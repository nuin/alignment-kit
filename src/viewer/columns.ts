import { computeColumnMask, hidesEveryColumn, mergeColumnRanges, subtractColumnRange, columnPos, keptColumn, type ColumnRange, type MaskOptions } from '../mask';
import { type Core } from './core';
/** Original zero-based column at the left edge of the viewport. */
export function firstColumn(v:Core):number {const m=v.columns;return m.cols[Math.min(m.count-1,Math.max(0,Math.floor(v.scroll.scrollLeft/v.options.cellWidth)))]??0;}
/** One-based column after stepping one displayed column right (1) or left (-1) from `column`; hidden columns are skipped. In the reverse-complement view a step right moves to a lower column number. */
export function stepColumn(v:Core, column:number,step:1|-1):number {
  const m=v.columns,c=column-1,s=m.reversed?-step:step,k=s<0?m.before[c]-1:m.mask[c]?m.before[c]+1:m.before[c];
  return keptColumn(m,Math.max(0,Math.min(m.count-1,k)))+1;
}
/** Apply a new mask: rebuild the map, keep the same original column at the left edge and redraw. */
export function maskChanged(v:Core, anchor:number):void {
  v.colMap=undefined;v.overviewDirty=true;v.inspectorDirty=true;v.layout();
  v.scroll.scrollLeft=columnPos(v.columns,Math.min(anchor,Math.max(0,v.columns.width-1)))*v.options.cellWidth;v.schedule();v.emit('state',v.getState());
}
export function maskOptions(v:Core, hidden:readonly ColumnRange[]):MaskOptions {return {gapFraction:v.options.hideGapColumns,allGap:v.options.hideAllGapColumns,hidden};}
export function setManualHidden(v:Core, ranges:ColumnRange[]):void {const anchor=v.a?v.firstColumn():0;v.manualHidden=ranges;v.maskChanged(anchor);}
export function hideColumns(v:Core, start:number,end:number):void {
  v.assertAlive();const a=v.a;if(!a)throw new Error('Load an alignment before hiding columns.');
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>a.width)throw new Error(`Hide columns needs a range inside 1 to ${a.width}.`);
  const ranges=mergeColumnRanges([...v.manualHidden,[start,end]]);
  if(hidesEveryColumn(a,v.maskOptions(ranges)))throw new Error('At least one column must stay visible.');
  v.setManualHidden(ranges);
}
export function showColumns(v:Core, start?:number,end?:number):void {
  v.assertAlive();
  if(start===undefined){const anchor=v.a?v.firstColumn():0;v.manualHidden=[];v.options.hideGapColumns=null;v.options.hideAllGapColumns=false;v.maskChanged(anchor);return;}
  const last=end??start,width=v.a?.width??0;
  if(!Number.isInteger(start)||!Number.isInteger(last)||start<1||last<start||last>width)throw new Error(`Show columns needs a range inside 1 to ${width}.`);
  const ranges=subtractColumnRange(v.manualHidden,start,last),mask=computeColumnMask(v.a!,v.maskOptions(ranges));
  if(mask.subarray(start-1,last).includes(0))throw new Error('Some of these columns are hidden by hideGapColumns or hideAllGapColumns; call showColumns() with no arguments or change those options.');
  v.setManualHidden(ranges);
}
export function columnHidden(v:Core, column:number):boolean {
  if(v.columns.mask[column-1]!==0)return false;
  v.message(`Column ${column} is hidden. Use Show all columns to reveal it.`);return true;
}
