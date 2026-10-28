import { addMarks, defaultMarkColor, isMarked, markColor, markRanges, removeMarks, unmarked, type MarkRange } from '../marks';
import type { ColumnMark } from '../types';
import { $ } from '../controls';
import type { Core } from './core';
function changed(v:Core,marks:ColumnMark[],note?:string):void {
  v.columnMarks=marks;v.inspectorDirty=true;if(note)$(v.root,'.ak-live').textContent=note;v.schedule();v.emit('state',v.getState());
}
const widthOf=(v:Core,what:string)=>{v.assertAlive();if(!v.a)throw new Error(`Load an alignment before ${what}.`);return v.a.width;};
export function markColumns(v:Core, ranges:readonly MarkRange[], color?:string):void {
  const list=markRanges(ranges,widthOf(v,'marking columns')),c=markColor(color);
  changed(v,addMarks(v.columnMarks,list,c));
}
export function unmarkColumns(v:Core, ranges?:readonly MarkRange[]):void {
  const w=widthOf(v,'unmarking columns');
  changed(v,ranges===undefined?[]:removeMarks(v.columnMarks,markRanges(ranges,w)));
}
/** Mark start to end, or unmark it when every column in it is already marked. Existing marks keep their color. */
export function toggleColumnMarks(v:Core, start:number, end:number):void {
  const [range]=markRanges([[start,end]],widthOf(v,'marking columns')),what=start===end?`column ${start}`:`columns ${start} to ${end}`;
  if(isMarked(v.columnMarks,start,end))changed(v,removeMarks(v.columnMarks,[range]),`Unmarked ${what}`);
  else changed(v,addMarks(v.columnMarks,unmarked(v.columnMarks,start,end),defaultMarkColor),`Marked ${what}`);
}
