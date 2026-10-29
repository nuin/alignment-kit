import type { Annotation } from '../types';
import { variantOf, variantShape, annotationColor, assignLanes, variantsToAnnotations, type VariantInfo, type VariantShape, type VariantInput, type VariantOptions, type VariantResult } from '../variants';
import { trackLayout } from '../visibility';
import { trackHeight } from '../tracks';
import { columnSpan } from '../mask';
import { $ } from '../controls';
import type { Core } from './core';

export const MAX_LANES=8,LANE=12;
/** `rank` orders rows as displayed: -2 for a variant without a row, -1 for the pinned reference. */
export interface VariantMark { a:Annotation; info:VariantInfo; lane:number; color:string; shape:VariantShape; rank:number }
/** `marks` are the mapped variants that pass the annotation filter on shown rows, sorted by start column then row rank. `lanes` counts drawn lanes (at most 8); `overflow` counts marks beyond them. `total` counts mapped variants in the alignment. */
export interface VariantLayout { marks:VariantMark[]; lanes:number; overflow:number; total:number }
const empty:VariantLayout={marks:[],lanes:0,overflow:0,total:0};
export function variantLayout(v:Core):VariantLayout {
  const a=v.a;if(!a)return empty;
  const keys=[a,a.annotations,v.filteredAnnotations.visible,v.filteredRows,v.rows,v.pinned,v.reference],c=v.variantCache;
  if(c&&c.keys.length===keys.length&&c.keys.every((k,i)=>k===keys[i]))return c.value;
  const rowIndex=new Map(a.rows.map((r,i)=>[r.id,i])),shown=new Map(v.filteredRows.map((r,i)=>[r,i]));
  const rank=(id?:string):number=>{if(!id)return -2;const r=rowIndex.get(id)!;if(v.pinned&&r===v.reference)return -1;if(v.hidden.has(id))return NaN;const p=v.rowPos[r];return p>=0?p:shown.has(r)?1e6+shown.get(r)!:NaN;};
  const marks:VariantMark[]=[];
  for(const n of v.filteredAnnotations.visible){
    if(n.mapping!=='mapped'||n.start===undefined||n.end===undefined)continue;const info=variantOf(n);if(!info)continue;
    const k=rank(n.rowId);if(Number.isNaN(k))continue;
    marks.push({a:n,info,lane:0,color:annotationColor(n),shape:variantShape(info),rank:k});
  }
  marks.sort((x,y)=>x.a.start!-y.a.start!||x.rank-y.rank||x.a.end!-y.a.end!);
  const {lanes,count}=assignLanes(marks.map(k=>({start:k.a.start!,end:k.a.end!})));marks.forEach((k,i)=>k.lane=lanes[i]);
  let total=0;for(const n of a.annotations)if(n.mapping==='mapped'&&variantOf(n))total++;
  const value={marks,lanes:Math.min(MAX_LANES,count),overflow:marks.filter(k=>k.lane>=MAX_LANES).length,total};
  v.variantCache={keys,value};v.overviewDirty=true;return value;
}
/** Lanes the variant track takes in the layout: 0 when it is switched off or no variant is shown. */
export const drawnLanes=(v:Core):number=>v.visibility.variantTrack?variantLayout(v).lanes:0;
export const variantTrackTop=(v:Core):number|null=>v.a?trackLayout(v.visibility,v.options.rowHeight,v.drawnTracks().map(t=>({height:trackHeight(t)})),v.a.alphabet,drawnLanes(v)).offsets.variants:null;
/** The variant marker under a pointer in the track strip, or null. Markers are at least 12 px wide for hit testing. */
export function variantAt(v:Core,event:MouseEvent):Annotation|null {
  const top=variantTrackTop(v);if(top===null)return null;
  const tracks=$(v.root,'.ak-tracks'),rect=tracks.getBoundingClientRect(),y=event.clientY-rect.top+tracks.scrollTop-top-3,x=event.clientX-rect.left-v.gutter+v.scroll.scrollLeft,lane=Math.floor(y/LANE);
  if(event.clientX-rect.left<v.gutter||y<0||lane>=variantLayout(v).lanes)return null;
  let best:Annotation|null=null,near=Infinity;const cw=v.options.cellWidth;
  for(const k of variantLayout(v).marks){
    if(k.lane!==lane)continue;const [l,r]=columnSpan(v.columns,k.a.start!,k.a.end!);if(r<=l)continue;
    const d=Math.abs(x-(l+r)/2*cw);if(d<=Math.max((r-l)*cw/2,6)&&d<near){near=d;best=k.a;}
  }
  return best;
}
/** Select a variant's columns and row, expanding its group when collapsed, and scroll it into view. */
export function selectVariant(v:Core,n:Annotation):void {
  const a=v.a!,row=n.rowId?a.rows.findIndex(r=>r.id===n.rowId):-1;
  if(row>=0&&v.grouped){const g=v.groupName(row);if(g&&v.collapsed.has(g))v.toggleGroup(g,false);}
  v.variantCursor=n.id;v.setSelection({start:n.start!,end:n.end!,...(n.rowId?{rowId:n.rowId}:{})});
}
/** Marks with at least one shown column, in navigation order. */
const navigable=(v:Core):VariantMark[]=>variantLayout(v).marks.filter(k=>{const [l,r]=columnSpan(v.columns,k.a.start!,k.a.end!);return r>l;});
const current=(v:Core,marks:VariantMark[]):number=>{const s=v.selection;if(!s||!v.variantCursor)return -1;return marks.findIndex(k=>k.a.id===v.variantCursor&&k.a.start===s.start&&k.a.end===s.end&&(k.a.rowId??undefined)===s.rowId);};
export function nextVariant(v:Core,direction:number=1):Annotation|null {
  v.assertAlive();if(!v.a)return null;const marks=navigable(v),n=marks.length;if(!n)return null;
  const dir=direction<0?-1:1;let i=current(v,marks);
  if(i>=0)i=(i+dir+n)%n;
  else{
    const s=v.selection;
    if(!s)i=dir>0?0:n-1;
    else{
      const row=s.rowId?variantRank(v,s.rowId,marks):dir>0?-Infinity:Infinity,after=(k:VariantMark)=>k.a.start!>s.start||k.a.start===s.start&&k.rank>row,before=(k:VariantMark)=>k.a.start!<s.start||k.a.start===s.start&&k.rank<row;
      if(dir>0){i=marks.findIndex(after);if(i<0)i=0;}else{i=n-1;while(i>=0&&!before(marks[i]))i--;if(i<0)i=n-1;}
    }
  }
  selectVariant(v,marks[i].a);return {...marks[i].a};
}
const variantRank=(v:Core,rowId:string,marks:VariantMark[]):number=>{const hit=marks.find(k=>k.a.rowId===rowId);if(hit)return hit.rank;const r=v.a!.rows.findIndex(x=>x.id===rowId);return v.pinned&&r===v.reference?-1:v.rowPos[r]??-1;};
/** Show the navigation buttons only when the alignment has mapped variants; the counter reads k / n over the variants shown. */
export function syncVariantNav(v:Core):void {
  const nav=$(v.root,'.ak-variant-nav'),l=variantLayout(v),marks=l.total?navigable(v):[],i=marks.length?current(v,marks):-1;
  nav.dataset.empty=String(!l.total);
  const text=`${i<0?'–':i+1} / ${marks.length}`,out=$(nav,'output');if(out.textContent!==text)out.textContent=text;
  for(const b of nav.querySelectorAll('button'))b.disabled=!marks.length;
}
export function addVariants(v:Core,variants:readonly VariantInput[],options:VariantOptions={}):VariantResult {
  v.assertAlive();if(!v.a)throw new Error('Load an alignment before adding variants.');
  const result=variantsToAnnotations(v.a,variants,options);v.addAnnotations(result.annotations);
  const mapped=result.annotations.filter(a=>a.mapping==='mapped').length;
  v.message(`Added ${result.annotations.length} variants (${mapped} mapped).${result.warnings.length?` ${result.warnings.length} warnings: ${result.warnings.slice(0,3).join(' ')}${result.warnings.length>3?' …':''}`:''}`);
  return result;
}
