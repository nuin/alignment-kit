import type { Alignment } from './types';
export interface RowMetrics { gaps:Int32Array; length:Int32Array }
const cache=new WeakMap<Alignment,RowMetrics>();
/** Gap count and ungapped length of every row, cached per alignment. */
export function rowMetrics(a:Alignment):RowMetrics {
  const hit=cache.get(a);if(hit)return hit;
  const gaps=new Int32Array(a.rows.length),length=new Int32Array(a.rows.length);
  for(let r=0;r<a.rows.length;r++){let g=0;const off=r*a.width;for(let c=0;c<a.width;c++){const x=a.codes[off+c];if(x===45||x===46)g++;}gaps[r]=g;length[r]=a.width-g;}
  const made={gaps,length};cache.set(a,made);return made;
}
/** Annotations per row ID. */
export function annotationCounts(a:Alignment):Map<string,number> {
  const counts=new Map<string,number>();for(const n of a.annotations)if(n.rowId)counts.set(n.rowId,(counts.get(n.rowId)??0)+1);return counts;
}
