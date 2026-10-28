import type { AlignmentSummary, ColumnScope, SummaryOptions, VariableColumnResult } from '../types';
import { MAX_VARIABLE_COLUMNS, type ColumnAnalysis } from '../summary';
import type { Core, SummaryEntry } from './core';
export const PAGE_SIZE=20;
function request(v:Core,o:SummaryOptions):{scope:ColumnScope;key:string;limit:number} {
  v.assertAlive();const a=v.a;if(!a)throw new Error('No alignment is loaded.');
  const mode=o.rows??v.options.statisticsScope,ref=o.referenceId===undefined?v.reference:a.rows.findIndex(r=>r.id===o.referenceId);
  if(ref<0)throw new Error(`Unknown reference row “${o.referenceId}”.`);
  const rows=mode==='filtered'?v.filteredRows:undefined,limit=Number.isFinite(o.limit)?Math.max(0,Math.floor(o.limit!)):MAX_VARIABLE_COLUMNS;
  let hash=2166136261;if(rows)for(const r of rows)hash=Math.imul(hash^r,16777619);
  const start=o.start??1,end=o.end??a.width;
  return {scope:{rows,start,end,reference:ref,limit},key:`${a.id}|${mode}|${rows?.length??''}|${hash>>>0}|${start}|${end}|${ref}`,limit};
}
/** Reuse the cached analysis when it covers the same rows, columns and reference with at least this limit; else start the worker. A newer request cancels a pending one. */
function analysis(v:Core,o:SummaryOptions):SummaryEntry {
  const {scope,key,limit}=request(v,o),cached=v.summaryCache;
  if(cached&&cached.key===key&&(cached.limit>=limit||cached.data?.variable.truncated===false))return cached;
  const entry:SummaryEntry={key,limit,promise:v.summarizer.summary(v.a!,scope)};v.summaryCache=entry;
  const done=()=>{if(!v.disposed&&v.summaryCache===entry&&v.tab==='summary'){v.inspectorDirty=true;v.schedule();}};
  entry.promise.then(data=>{entry.data=data;done();},(error:Error)=>{if(error.name==='AbortError'){if(v.summaryCache===entry)v.summaryCache=undefined;return;}entry.error=error.message;done();});
  return entry;
}
async function lazy<T>(v:Core,o:SummaryOptions,pick:(data:ColumnAnalysis)=>T):Promise<T> {return pick(await analysis(v,o).promise);}
export const getSummary=(v:Core,o:SummaryOptions):Promise<AlignmentSummary>=>lazy(v,o,d=>d.summary);
export const getVariableColumns=(v:Core,o:SummaryOptions):Promise<VariableColumnResult>=>lazy(v,o,d=>d.variable);
/** What the Summary tab shows now: the selected block when two or more columns are selected, else the whole alignment. */
export function panelSummary(v:Core):{block?:{start:number;end:number};entry?:SummaryEntry;error?:string} {
  const sel=v.selection,block=sel&&sel.end>sel.start?{start:sel.start,end:sel.end}:undefined;
  try{const before=v.summaryCache?.key,entry=analysis(v,block??{});if(entry.key!==before)v.summaryPage=0;return {block,entry};}
  catch(error){return {block,error:(error as Error).message};}
}
