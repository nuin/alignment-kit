import { type Hit, type SearchOptions, type SearchResult } from '../types';
import { compilePattern } from '../search';
import { $ } from '../controls';
import { TIMEOUT_ERROR } from '../worker-client';
import { type Core, type SearchState } from './core';
export async function search(v:Core, pattern:string,options:Pick<SearchOptions,'mode'|'strands'>={}):Promise<SearchResult> {
  v.assertAlive();if(!v.a)return {hits:[],truncated:false};
  try{const state=await v.runSearch(pattern.trim(),{mode:options.mode,strands:options.strands});v.message('');return {hits:[...state.result.hits],truncated:state.result.truncated};}
  catch(error){if((error as Error).name===TIMEOUT_ERROR)v.error(error);throw error;}
}
export function clearSearch(v:Core):void {
  v.assertAlive();if(!v.searchState&&!v.searchBusy)return;
  v.dropSearch();v.inspectorDirty=true;v.schedule();
}
export function dropSearch(v:Core):void {
  $<HTMLInputElement>(v.root,'[aria-label="Find motif"]').value='';
  if(v.searchBusy)v.message('');
  ++v.searchRun;v.searchBusy=false;v.searcher.cancel();
  if(!v.searchState)return;
  v.searchState=undefined;v.emit('search',null);
}
/** Validate on the main thread, then scan in the search worker. A newer run, clear or load discards this one with an AbortError; a TimeoutError drops the hits. */
export async function runSearch(v:Core, pattern:string,options:SearchOptions,refilter=false):Promise<SearchState> {
  const a=v.a!;compilePattern(pattern,{alphabet:a.alphabet,mode:options.mode});
  const run=++v.searchRun;v.searcher.cancel();v.searchBusy=true;
  const current=()=>{if(v.disposed||v.a!==a||run!==v.searchRun)throw new DOMException('Search replaced','AbortError');};
  const old=v.searchState,same=old?.pattern===pattern&&old.options.mode===options.mode&&old.options.strands===options.strands;let full=same?old!.full:undefined,result:SearchResult;
  try{
    if(!same){full=await v.searcher.search(a,pattern,options);current();if(full.truncated)full=undefined;}
    if(full){
      const hits=new Map<number,Hit[]>();for(const hit of full.hits){const list=hits.get(hit.row);if(list)list.push(hit);else hits.set(hit.row,[hit]);}
      result={hits:v.filteredRows.flatMap(r=>hits.get(r)??[]),truncated:false};
    }else{let rows:number[];do{rows=v.filteredRows;result=await v.searcher.search(a,pattern,{...options,rows});current();}while(rows!==v.filteredRows);}
  }catch(error){
    if(run===v.searchRun){v.searchBusy=false;if((error as Error).name===TIMEOUT_ERROR&&v.searchState){v.searchState=undefined;v.inspectorDirty=true;v.schedule();v.emit('search',null);}}
    throw error;
  }
  v.searchBusy=false;
  const byRow=new Map<number,Hit[]>(),previous=same?old!.result.hits[old!.cursor]:undefined;
  for(const hit of result.hits){const list=byRow.get(hit.row);if(list)list.push(hit);else byRow.set(hit.row,[hit]);}
  const cursor=previous?result.hits.findIndex(h=>h.rowId===previous.rowId&&h.start===previous.start&&h.end===previous.end&&h.strand===previous.strand):-1;
  v.searchState={pattern,options,result,byRow,cursor,full};v.inspectorDirty=true;v.schedule();
  const key=(h:Hit)=>`${h.row}:${h.start}:${h.end}:${h.strand}`;
  if(!refilter||!old||old.result.truncated!==result.truncated||old.result.hits.length!==result.hits.length||result.hits.some((h,i)=>key(h)!==key(old.result.hits[i])))v.emit('search',{hits:[...result.hits],truncated:result.truncated});
  return v.searchState;
}
export function goToHit(v:Core, index:number):void {
  const state=v.searchState,hit=state?.result.hits[index];if(!state||!hit||!v.a)return;
  state.cursor=index;v.setSelection({start:hit.start,end:hit.end,rowId:hit.rowId},true,v.tab==='hits');
  const concealed=!v.columns.mask.subarray(hit.start-1,hit.end).includes(1);
  v.message(`Hit ${index+1} of ${state.result.hits.length.toLocaleString()} in ${v.a.rows[hit.row].name}, sequence positions ${hit.seqStart}–${hit.seqEnd}, ${hit.strand==='+'?'forward':'reverse'} strand.${concealed?' The hit is in hidden columns. Use Show all columns to reveal it.':''}`);
}
export async function findMotif(v:Core, motif:string,direction:1|-1=1):Promise<boolean> {
  v.assertAlive();if(!v.a)return false;
  try {
    const text=motif.trim();
    if(!text){v.clearSearch();return false;}
    const started=v.searchState?.pattern!==text;
    if(started){v.message('Searching…');await v.runSearch(text,{});}
    const state=v.searchState!,n=state.result.hits.length;
    if(!n){v.message(`No match for ${text}${v.filteredRows.length<v.a.rows.length?' in the filtered sequences':''}.`);return started;}
    v.goToHit(state.cursor<0?(direction>0?0:n-1):(state.cursor+direction+n)%n);
    return started;
  }catch(error){v.error(error);return false;}
}
