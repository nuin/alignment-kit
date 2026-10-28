import { mergeColumnRanges, type ColumnRange } from './mask';
import type { ColumnMark } from './types';
export const defaultMarkColor='#7b2cbf';
/** A column number or an inclusive one-based [start, end] range. */
export type MarkRange=number|readonly [number,number];
export function markColor(color:string|undefined):string {
  if(color===undefined)return defaultMarkColor;
  if(typeof color!=='string'||!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color))throw new Error('Mark colors must be three- or six-digit hex colors.');
  return color.toLowerCase();
}
export function markRanges(ranges:readonly MarkRange[],width:number):ColumnRange[] {
  if(!Array.isArray(ranges))throw new Error('Column ranges must be an array.');
  return ranges.map(r=>{const [s,e]=typeof r==='number'?[r,r]:r;
    if(!Number.isInteger(s)||!Number.isInteger(e)||s<1||e<s||e>width)throw new Error(`Column marks need ranges inside 1 to ${width}.`);return [s,e] as ColumnRange;});
}
const tidy=(marks:ColumnMark[]):ColumnMark[]=>{
  const out:ColumnMark[]=[];
  for(const m of marks.sort((x,y)=>x.start-y.start)){const last=out[out.length-1];if(last&&last.color===m.color&&m.start<=last.end+1)last.end=Math.max(last.end,m.end);else out.push({...m});}
  return out;
};
export function subtractMarks(marks:readonly ColumnMark[],start:number,end:number):ColumnMark[] {
  const out:ColumnMark[]=[];
  for(const m of marks){if(m.end<start||m.start>end){out.push({...m});continue;}if(m.start<start)out.push({...m,end:start-1});if(m.end>end)out.push({...m,start:end+1});}
  return out;
}
/** Paint `ranges` with `color`, replacing the color of columns already marked. */
export function addMarks(marks:readonly ColumnMark[],ranges:readonly ColumnRange[],color:string):ColumnMark[] {
  let out=marks.map(m=>({...m}));
  for(const [s,e] of ranges)out=[...subtractMarks(out,s,e),{start:s,end:e,color}];
  return tidy(out);
}
export function removeMarks(marks:readonly ColumnMark[],ranges:readonly ColumnRange[]):ColumnMark[] {
  let out=marks.map(m=>({...m}));
  for(const [s,e] of ranges)out=subtractMarks(out,s,e);
  return out;
}
/** Parts of start to end that carry no mark. */
export function unmarked(marks:readonly ColumnMark[],start:number,end:number):ColumnRange[] {
  const out:ColumnRange[]=[];let at=start;
  for(const m of marks){if(m.end<at||m.start>end)continue;if(m.start>at)out.push([at,m.start-1]);at=Math.max(at,m.end+1);}
  if(at<=end)out.push([at,end]);return out;
}
export const isMarked=(marks:readonly ColumnMark[],start:number,end=start):boolean=>unmarked(marks,start,end).length===0;
export const markSpans=(marks:readonly ColumnMark[]):ColumnRange[]=>mergeColumnRanges(marks.map(m=>[m.start,m.end] as ColumnRange));
/** Marks from link ranges: default color, except where a current mark already covers the columns. */
export function marksFromRanges(ranges:readonly ColumnRange[],current:readonly ColumnMark[]):ColumnMark[] {
  let out=addMarks([],ranges,defaultMarkColor);
  for(const m of current)for(const [s,e] of ranges){const a=Math.max(s,m.start),b=Math.min(e,m.end);if(a<=b)out=addMarks(out,[[a,b]],m.color);}
  return out;
}
