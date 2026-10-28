import { type ViewState } from '../types';
import { compilePattern } from '../search';
import { hidesEveryColumn, mergeColumnRanges, type ColumnRange } from '../mask';
import { type Core } from './core';
export async function updateStats(v:Core):Promise<void> {
  if(!v.a)return;const token=++v.statsRevision,a=v.a,scope=v.options.statisticsScope;
  v.analysis.cancel();
  if(scope==='all'&&v.fullStats){v.stats=v.fullStats;v.inspectorDirty=true;v.overviewDirty=true;v.schedule();return;}
  v.stats=undefined;v.inspectorDirty=true;v.schedule();
  try {
    const result=await v.analysis.stats(a,scope==='filtered'?v.filteredRows:undefined);
    if(v.disposed||token!==v.statsRevision||v.a!==a)return;
    v.stats=result;if(scope==='all')v.fullStats=result;
    v.inspectorDirty=true;v.overviewDirty=true;v.message('');v.schedule();
  }catch(error){v.error(error);if((error as Error).name!=='AbortError')throw error;}
}
const searchModes=['auto','literal','iupac','regex','prosite'];
export function getState(v:Core):ViewState {return {version:1,alignmentId:v.a?.id??'',referenceId:v.a?.rows[v.reference]?.id??null,query:v.query,sort:v.sort,start:v.firstColumn()+1,rowOffset:Math.floor(v.scroll.scrollTop/v.options.rowHeight),cellWidth:v.options.cellWidth,selection:v.selection?{...v.selection}:null,colorScheme:v.options.colorScheme,colorMode:v.options.colorMode,matchDisplay:v.options.matchDisplay,statisticsScope:v.options.statisticsScope,rulerCoordinates:v.options.rulerCoordinates,annotationFilter:structuredClone(v.annotationFilter),visibility:v.getVisibility(),hiddenRowIds:[...v.hidden],manualOrder:v.manualOrder?[...v.manualOrder]:null,collapsedGroups:[...v.collapsed],hiddenColumns:v.manualHidden.map(r=>[...r] as ColumnRange),...(v.searchState?{find:v.searchState.pattern,...(v.searchState.options.mode&&v.searchState.options.mode!=='auto'?{findMode:v.searchState.options.mode}:{}),...(v.searchState.options.strands&&v.searchState.options.strands!=='both'?{strands:v.searchState.options.strands}:{})}:{})};}
export async function setState(v:Core, state:ViewState):Promise<void> {
  if(!v.a||state.version!==1||state.alignmentId!==v.a.id)throw new Error('View state belongs to a different alignment or unsupported version.');
  if(!Number.isFinite(state.start)||!Number.isFinite(state.rowOffset))throw new Error('Invalid view state.');
  if(state.find!==undefined){
    if(typeof state.find!=='string'||!state.find||(state.findMode!==undefined&&!searchModes.includes(state.findMode))||(state.strands!==undefined&&state.strands!=='both'&&state.strands!=='forward'))throw new Error('Invalid search in view state.');
    try{compilePattern(state.find,{alphabet:v.a.alphabet,mode:state.findMode});}catch{throw new Error('Invalid search in view state.');}
  }
  const hiddenColumns=mergeColumnRanges(state.hiddenColumns??[]);
  if(hiddenColumns.some(([s,e])=>!Number.isInteger(s)||!Number.isInteger(e)||s<1||e<s||e>v.a!.width)||hidesEveryColumn(v.a,v.maskOptions(hiddenColumns)))throw new Error('Invalid hidden columns in view state.');
  v.manualHidden=hiddenColumns;v.colMap=undefined;
  v.setOptions({cellWidth:state.cellWidth,colorScheme:state.colorScheme,colorMode:state.colorMode,matchDisplay:state.matchDisplay??'letter',statisticsScope:state.statisticsScope,rulerCoordinates:state.rulerCoordinates??'alignment',visibility:state.visibility});v.setFilter(state.query);if(state.referenceId)v.setReference(state.referenceId);
  const known=new Set(v.a.rows.map(r=>r.id));v.hidden=new Set((state.hiddenRowIds??[]).filter(id=>known.has(id)));v.manualOrder=state.manualOrder?state.manualOrder.filter(id=>known.has(id)):null;v.collapsed=new Set(state.collapsedGroups??[]);
  await v.setSort(state.sort==='tree'&&!v.tree?'input':state.sort);if(v.options.statisticsScope==='filtered')void v.updateStats().catch(()=>{});v.setAnnotationFilter(state.annotationFilter);v.setSelection(state.selection,false);
  v.scroll.scrollLeft=v.columns.before[Math.min(Math.max(1,state.start),v.a.width)-1]*v.options.cellWidth;v.scroll.scrollTop=state.rowOffset*v.options.rowHeight;v.schedule();
  await v.restoreSearch(state.find,state.findMode,state.strands);
}
