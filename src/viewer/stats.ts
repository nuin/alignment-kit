import { type ViewState, type ColumnMark } from '../types';
import { addMarks, markColor } from '../marks';
import { compilePattern } from '../search';
import { hidesEveryColumn, mergeColumnRanges, columnPos, type ColumnRange } from '../mask';
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
export function getState(v:Core):ViewState {return {version:1,alignmentId:v.a?.id??'',referenceId:v.a?.rows[v.reference]?.id??null,query:v.query,sort:v.sort,start:v.firstColumn()+1,rowOffset:Math.floor(v.scroll.scrollTop/v.options.rowHeight),cellWidth:v.options.cellWidth,selection:v.selection?{...v.selection}:null,colorScheme:v.options.colorScheme,colorMode:v.options.colorMode,matchDisplay:v.options.matchDisplay,statisticsScope:v.options.statisticsScope,rulerCoordinates:v.options.rulerCoordinates,annotationFilter:structuredClone(v.annotationFilter),visibility:v.getVisibility(),sortColumn:v.sort==='residue'?v.sortColumn:undefined,consensusThreshold:v.options.consensusThreshold,colorThreshold:v.options.colorThreshold,minIdentity:v.options.minIdentity,minCoverage:v.options.minCoverage,hiddenRowIds:[...v.hidden],manualOrder:v.manualOrder?[...v.manualOrder]:null,collapsedGroups:[...v.collapsed],hiddenColumns:v.manualHidden.map(r=>[...r] as ColumnRange),reverseComplement:v.reversed,reverseStrandRowIds:[...v.rowStrands],columnMarks:v.columnMarks.map(m=>({...m})),...(v.searchState?{find:v.searchState.pattern,...(v.searchState.options.mode&&v.searchState.options.mode!=='auto'?{findMode:v.searchState.options.mode}:{}),...(v.searchState.options.strands&&v.searchState.options.strands!=='both'?{strands:v.searchState.options.strands}:{})}:{})};}
export async function setState(v:Core, state:ViewState):Promise<void> {
  if(!v.a||state.version!==1||state.alignmentId!==v.a.id)throw new Error('View state belongs to a different alignment or unsupported version.');
  if(!Number.isFinite(state.start)||!Number.isFinite(state.rowOffset))throw new Error('Invalid view state.');
  if(state.find!==undefined){
    if(typeof state.find!=='string'||!state.find||(state.findMode!==undefined&&!searchModes.includes(state.findMode))||(state.strands!==undefined&&state.strands!=='both'&&state.strands!=='forward'))throw new Error('Invalid search in view state.');
    try{compilePattern(state.find,{alphabet:v.a.alphabet,mode:state.findMode});}catch{throw new Error('Invalid search in view state.');}
  }
  const hiddenColumns=mergeColumnRanges(state.hiddenColumns??[]);
  if(hiddenColumns.some(([s,e])=>!Number.isInteger(s)||!Number.isInteger(e)||s<1||e<s||e>v.a!.width)||hidesEveryColumn(v.a,v.maskOptions(hiddenColumns)))throw new Error('Invalid hidden columns in view state.');
  const marks=(state.columnMarks??[]).map(m=>({start:m.start,end:m.end,color:markColor(m.color)}));
  if(marks.some(m=>!Number.isInteger(m.start)||!Number.isInteger(m.end)||m.start<1||m.end<m.start||m.end>v.a!.width))throw new Error('Invalid column marks in view state.');
  v.manualHidden=hiddenColumns;v.columnMarks=marks.reduce((list,m)=>addMarks(list,[[m.start,m.end]],m.color),[] as ColumnMark[]);v.colMap=undefined;
  v.setOptions({cellWidth:state.cellWidth,colorScheme:state.colorScheme,colorMode:state.colorMode,matchDisplay:state.matchDisplay??'letter',statisticsScope:state.statisticsScope,rulerCoordinates:state.rulerCoordinates??'alignment',reverseComplement:state.reverseComplement??false,consensusThreshold:state.consensusThreshold??0,colorThreshold:state.colorThreshold??0,minIdentity:state.minIdentity??0,minCoverage:state.minCoverage??0,visibility:state.visibility});v.setFilter(state.query);if(state.referenceId)v.setReference(state.referenceId);
  const known=new Set(v.a.rows.map(r=>r.id));v.hidden=new Set((state.hiddenRowIds??[]).filter(id=>known.has(id)));v.manualOrder=state.manualOrder?state.manualOrder.filter(id=>known.has(id)):null;v.collapsed=new Set(state.collapsedGroups??[]);v.rowStrands=new Set((state.reverseStrandRowIds??[]).filter(id=>known.has(id)));v.labelKey='';
  await v.setSort(state.sort==='tree'&&!v.tree||state.sort==='residue'&&!(Number.isInteger(state.sortColumn)&&state.sortColumn!>=1&&state.sortColumn!<=v.a.width)?'input':state.sort,state.sortColumn);if(v.options.statisticsScope==='filtered')void v.updateStats().catch(()=>{});v.setAnnotationFilter(state.annotationFilter);v.setSelection(state.selection,false);
  v.scroll.scrollLeft=columnPos(v.columns,Math.min(Math.max(1,state.start),v.a.width)-1)*v.options.cellWidth;v.scroll.scrollTop=state.rowOffset*v.options.rowHeight;v.schedule();
  await v.restoreSearch(state.find,state.findMode,state.strands);
}
