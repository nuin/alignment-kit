import type { Alignment } from './types';
import { isGap } from './model';

/** An inclusive one-based range of alignment columns. */
export type ColumnRange = [number, number];
/** Which columns hide: `gapFraction` hides columns whose gap fraction over all rows is at least that value (0 to 1), `allGap` hides columns that are gaps in every row, `hidden` lists manually hidden ranges. */
export interface MaskOptions { gapFraction?:number|null; allGap?:boolean; hidden?:readonly (readonly [number,number])[] }
/** Display to original column map. `cols[d]` is the zero-based original column shown at display index d; `before[c]` counts kept columns left of original column c (for a hidden column, the display index of the next kept one). `edges` lists the display positions (0 to count) where hidden columns were collapsed. */
export interface ColumnMap { width:number; count:number; mask:Uint8Array; cols:Int32Array; before:Int32Array; edges:Int32Array; /** True when display runs right to left: `cols` and `edges` are then in display order, while `before` still counts kept columns left of each original column. */ reversed?:boolean }

const counts=new WeakMap<Alignment,Uint32Array>();
/** Rows holding a gap in each column. Cached per alignment object. */
function gapCounts(a:Alignment):Uint32Array {
  let gaps=counts.get(a);if(gaps)return gaps;
  gaps=new Uint32Array(a.width);
  for(let r=0;r<a.rows.length;r++)for(let c=0;c<a.width;c++)if(isGap(a.codes[r*a.width+c]))gaps[c]++;
  counts.set(a,gaps);return gaps;
}
/** Sort ranges and merge those that overlap or touch. Returns new arrays. */
export function mergeColumnRanges(ranges:readonly (readonly [number,number])[]):ColumnRange[] {
  const out:ColumnRange[]=[];
  for(const [s,e] of [...ranges].sort((x,y)=>x[0]-y[0]||x[1]-y[1])){const last=out[out.length-1];if(last&&s<=last[1]+1)last[1]=Math.max(last[1],e);else out.push([s,e]);}
  return out;
}
/** Remove columns `start` to `end` from the ranges, splitting a range that spans them. */
export function subtractColumnRange(ranges:readonly (readonly [number,number])[],start:number,end:number):ColumnRange[] {
  const out:ColumnRange[]=[];
  for(const [s,e] of ranges){if(e<start||s>end){out.push([s,e]);continue;}if(s<start)out.push([s,start-1]);if(e>end)out.push([end+1,e]);}
  return out;
}
/** 1 for a kept column, 0 for a hidden one; length `a.width`. When the combined mask would hide every column, the gap rules alone apply, then the manual ranges alone, then all columns stay. */
export function computeColumnMask(a:Alignment,options:MaskOptions={}):Uint8Array {
  const full=rawColumnMask(a,options);if(full.includes(1))return full;
  const gaps=rawColumnMask(a,{...options,hidden:[]});if(gaps.includes(1))return gaps;
  const manual=rawColumnMask(a,{hidden:options.hidden});return manual.includes(1)?manual:manual.fill(1);
}
/** True when the gap rules and manual ranges together hide every column. */
export function hidesEveryColumn(a:Alignment,options:MaskOptions={}):boolean {return !rawColumnMask(a,options).includes(1);}
function rawColumnMask(a:Alignment,options:MaskOptions):Uint8Array {
  const threshold=options.gapFraction??null,mask=new Uint8Array(a.width).fill(1);
  if(threshold!==null&&!(threshold>=0&&threshold<=1))throw new Error('gapFraction must be a number from 0 to 1.');
  if(threshold!==null||options.allGap){
    const gaps=gapCounts(a),n=a.rows.length;
    for(let c=0;c<a.width;c++)if(options.allGap&&gaps[c]===n||threshold!==null&&gaps[c]>=threshold*n-1e-9)mask[c]=0;
  }
  for(const [s,e] of options.hidden??[])mask.fill(0,Math.max(1,s)-1,Math.min(a.width,e));
  return mask;
}
export function buildColumnMap(mask:Uint8Array):ColumnMap {
  const width=mask.length,before=new Int32Array(width+1),kept:number[]=[],edges:number[]=[];
  for(let c=0;c<width;c++){
    before[c]=kept.length;
    if(mask[c]){if(c>0&&!mask[c-1])edges.push(kept.length);kept.push(c);}
  }
  before[width]=kept.length;
  if(mask.length&&!mask[width-1]&&kept.length)edges.push(kept.length);
  return {width,count:kept.length,mask,cols:Int32Array.from(kept),before,edges:Int32Array.from(edges)};
}
let identity:ColumnMap|undefined;
/** A map that keeps every column; the last one built is reused. */
export function identityColumns(width:number):ColumnMap {
  if(identity?.width!==width)identity=buildColumnMap(new Uint8Array(width).fill(1));
  return identity;
}
/** The same columns shown right to left. Use columnSpan and columnPos for original-to-display lookups on a reversed map. */
export function reverseColumnMap(m:ColumnMap):ColumnMap {return {...m,cols:Int32Array.from(m.cols).reverse(),edges:Int32Array.from(m.edges,e=>m.count-e).reverse(),reversed:true};}
/** Display interval [left, right) of original columns `start` to `end` (one-based, inclusive). Hidden columns collapse to zero width. */
export const columnSpan=(m:ColumnMap,start:number,end:number):[number,number]=>m.reversed?[m.count-m.before[end],m.count-m.before[start-1]]:[m.before[start-1],m.before[end]];
/** Display index of zero-based original column `c`; for a hidden column, the nearest kept column on the side the display runs towards. */
export const columnPos=(m:ColumnMap,c:number):number=>m.reversed?Math.max(0,m.count-1-m.before[c]):m.before[c];
/** Zero-based original column of the k-th kept column counted left to right in the source. */
export const keptColumn=(m:ColumnMap,k:number):number=>m.cols[m.reversed?m.count-1-k:k];
