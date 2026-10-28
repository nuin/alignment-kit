import type { AlignmentSummary, ColumnScope, SummaryOptions, VariableColumnResult } from '../types';
import { MAX_VARIABLE_COLUMNS, type ColumnAnalysis } from '../summary';
import type { Core, SummaryEntry } from './core';
export const PAGE_SIZE=20;
const MAX_ENTRIES=8;
function request(v:Core,o:SummaryOptions):{scope:ColumnScope;key:string;limit:number} {
  v.assertAlive();const a=v.a;if(!a)throw new Error('No alignment is loaded.');
  const mode=o.rows??v.options.statisticsScope,ref=o.referenceId===undefined?v.reference:a.rows.findIndex(r=>r.id===o.referenceId);
  if(ref<0)throw new Error(`Unknown reference row “${o.referenceId}”.`);
  if(mode==='filtered'&&!v.filteredRows.length)throw new Error('No sequences match the filter. Clear it or use rows: "all".');
  const rows=mode==='filtered'?v.filteredRows:undefined,limit=Number.isFinite(o.limit)?Math.max(0,Math.floor(o.limit!)):MAX_VARIABLE_COLUMNS;
  let hash=2166136261;if(rows)for(const r of rows)hash=Math.imul(hash^r,16777619);
  const start=o.start??1,end=o.end??a.width;
  return {scope:{rows,start,end,reference:ref,limit},key:`${a.id}|${mode}|${rows?.length??''}|${hash>>>0}|${start}|${end}|${ref}`,limit};
}
/** Each distinct key (rows, columns, reference) has its own worker, so a request never cancels an unrelated one. A cached entry serves any request with a limit it covers; a larger limit starts a new run and leaves the old one to finish. Only load and destroy cancel. */
function analysis(v:Core,o:SummaryOptions,retry=false):SummaryEntry {
  const {scope,key,limit}=request(v,o),cached=v.summaryCache.get(key);
  if(cached&&!(retry&&cached.error)&&(cached.limit>=limit||cached.data?.variable.truncated===false))return cached;
  const task=v.summaryTask(),entry:SummaryEntry={key,limit,task,promise:task.summary(v.a!,scope)};
  v.summaryCache.delete(key);v.summaryCache.set(key,entry);
  for(const [k] of v.summaryCache){if(v.summaryCache.size<=MAX_ENTRIES)break;v.summaryCache.get(k)!.task.cancel();v.summaryCache.delete(k);}
  const done=()=>{if(!v.disposed&&v.tab==='summary'){v.inspectorDirty=true;v.schedule();}};
  entry.promise.then(data=>{entry.data=data;done();},(error:Error)=>{if(error.name==='AbortError'){if(v.summaryCache.get(key)===entry)v.summaryCache.delete(key);return;}entry.error=error.message;done();});
  return entry;
}
/** Cancel every pending summary and forget the results. */
export function cancelSummaries(v:Core):void {for(const e of v.summaryCache.values())e.task.cancel();v.summaryCache.clear();}
async function lazy<T>(v:Core,o:SummaryOptions,pick:(data:ColumnAnalysis)=>T):Promise<T> {return pick(await analysis(v,o,true).promise);}
export const getSummary=(v:Core,o:SummaryOptions):Promise<AlignmentSummary>=>lazy(v,{...o,limit:0},d=>d.summary);
export const getVariableColumns=(v:Core,o:SummaryOptions):Promise<VariableColumnResult>=>lazy(v,o,d=>d.variable);
const shown=new WeakMap<Core,string>();
/** What the Summary tab shows now: the selected block when two or more columns are selected, else the whole alignment. */
export function panelSummary(v:Core):{block?:{start:number;end:number};entry?:SummaryEntry;error?:string} {
  const sel=v.selection,block=sel&&sel.end>sel.start?{start:sel.start,end:sel.end}:undefined;
  try{const entry=analysis(v,block??{});if(shown.get(v)!==entry.key){shown.set(v,entry.key);v.summaryPage=0;}return {block,entry};}
  catch(error){return {block,error:(error as Error).message};}
}
