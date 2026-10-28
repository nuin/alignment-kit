import { resolveRegion } from '../export';
import { type Core } from './core';
const rowOf=(v:Core,rowId:string):number=>v.a?.rows.findIndex(r=>r.id===rowId)??-1;
const inRange=(v:Core,column:number):boolean=>!!v.a&&Number.isInteger(column)&&column>=1&&column<=v.a.width;
export function getResidue(v:Core, rowId:string, column:number):string|null {
  v.assertAlive();const r=rowOf(v,rowId);if(r<0||!inRange(v,column))return null;
  const c=v.a!.codes[r*v.a!.width+column-1];return c===45?null:String.fromCharCode(c);
}
export function getColumn(v:Core, column:number):{rowId:string;residue:string}[] {
  v.assertAlive();const a=v.a;if(!a||!inRange(v,column))return [];
  return a.rows.map((row,r)=>({rowId:row.id,residue:String.fromCharCode(a.codes[r*a.width+column-1])}));
}
/** Checked rows in display order (filtered-out ones last), else the row of the selection; columns of the selection, else all. */
export function getSelectionSequences(v:Core, options:{gaps?:'keep'|'remove'}={}):{id:string;name:string;sequence:string}[] {
  v.assertAlive();const a=v.a;if(!a)return [];
  if(options.gaps!==undefined&&options.gaps!=='keep'&&options.gaps!=='remove')throw new Error('gaps must be keep or remove.');
  if(!v.selectedRows.size&&!v.selection?.rowId)return [];
  const {start,end,rows}=resolveRegion(a,{rowIds:v.copyRegion(a).rowIds,start:v.selection?.start,end:v.selection?.end});
  return rows.map(r=>{const row=a.rows[r],text=row.sequence.slice(start-1,end);return {id:row.id,name:row.name,sequence:options.gaps==='remove'?text.replace(/[-.]/g,''):text};});
}
export function getVisibleRows(v:Core):string[] {
  v.assertAlive();const a=v.a;if(!a)return [];
  const pinned=v.pinned&&!v.hidden.has(a.rows[v.reference].id)?[a.rows[v.reference].id]:[];
  return [...pinned,...v.rows.filter(i=>i>=0).map(i=>a.rows[i].id)];
}
export function getVisibleColumns(v:Core):{start:number;end:number} {
  v.assertAlive();if(!v.a)return {start:0,end:0};
  const m=v.columns,start=v.firstColumn()+1,last=Math.min(m.count,Math.ceil((v.scroll.scrollLeft+v.scroll.clientWidth-v.gutter)/v.options.cellWidth));
  return {start,end:Math.max(start,(m.cols[Math.max(0,last-1)]??v.a.width-1)+1)};
}
export function scrollToRow(v:Core, rowId:string):boolean {
  v.assertAlive();const r=rowOf(v,rowId);if(r<0||v.hidden.has(rowId))return false;
  if(v.pinned&&r===v.reference)return true;
  const index=v.rowPos[r];if(index===undefined||index<0)return false;
  v.scroll.scrollTop=index*v.options.rowHeight;v.schedule();return true;
}
export function scrollToColumn(v:Core, column:number):boolean {
  v.assertAlive();if(!inRange(v,column)||v.columns.mask[column-1]===0)return false;
  v.scroll.scrollLeft=v.columns.before[column-1]*v.options.cellWidth;v.schedule();return true;
}
