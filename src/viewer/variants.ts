import type { Annotation } from '../types';
import { variantOf, variantShape, annotationColor, assignLanes, variantsToAnnotations, type VariantInfo, type VariantShape, type VariantInput, type VariantOptions, type VariantResult } from '../variants';
import { trackLayout } from '../visibility';
import { trackHeight } from '../tracks';
import { columnSpan, type ColumnMap } from '../mask';
import { $ } from '../controls';
import type { Core } from './core';

export const LANE=12;
/** `rank` orders rows as displayed: -2 for a variant without a row, -1 for the pinned reference, a row's grid position, or just after its group header while the group is collapsed. `lane` is -1 beyond the eighth lane. */
export interface VariantMark { a:Annotation; info:VariantInfo; lane:number; color:string; shape:VariantShape; rank:number }
/** A mark with its display interval [left, right) under the current column map. */
export interface NavMark { k:VariantMark; left:number; right:number }
/** `marks` are the mapped variants that pass the annotation filter on shown rows, sorted by start column then row rank. `lanes` counts drawn lanes (at most 8); `overflow` counts marks beyond them. `total` counts mapped variants in the alignment. `nav` caches the navigation order for one column map. */
export interface VariantLayout { marks:VariantMark[]; lanes:number; overflow:number; total:number; nav?:{columns:ColumnMap;list:NavMark[]} }
const empty:VariantLayout={marks:[],lanes:0,overflow:0,total:0};
export function variantLayout(v:Core):VariantLayout {
  const a=v.a;if(!a)return empty;
  const keys=[a,a.annotations,v.filteredAnnotations.visible,v.filteredRows,v.rows,v.pinned,v.reference],c=v.variantCache;
  if(c&&c.keys.length===keys.length&&c.keys.every((k,i)=>k===keys[i]))return c.value;
  const rowIndex=new Map(a.rows.map((r,i)=>[r.id,i])),shown=new Map(v.filteredRows.map((r,i)=>[r,i])),headers=new Map<string,number>();
  v.rows.forEach((item,p)=>{if(item<0)headers.set(v.groupList[-item-1].name,p);});
  const rank=(id?:string):number=>{
    if(!id)return -2;const r=rowIndex.get(id)!;if(v.pinned&&r===v.reference)return -1;if(v.hidden.has(id))return NaN;
    const p=v.rowPos[r];if(p>=0)return p;const s=shown.get(r);if(s===undefined)return NaN;
    const g=v.grouped?v.groupName(r):null,h=g===null?undefined:headers.get(g);
    return h===undefined?1e6+s:h+(s+1)/(shown.size+2);
  };
  const marks:VariantMark[]=[];
  for(const n of v.filteredAnnotations.visible){
    if(n.mapping!=='mapped'||n.start===undefined||n.end===undefined)continue;const info=variantOf(n);if(!info)continue;
    const k=rank(n.rowId);if(Number.isNaN(k))continue;
    marks.push({a:n,info,lane:0,color:annotationColor(n),shape:variantShape(info),rank:k});
  }
  marks.sort((x,y)=>x.a.start!-y.a.start!||x.rank-y.rank||x.a.end!-y.a.end!);
  const {lanes,count,overflow}=assignLanes(marks.map(k=>({start:k.a.start!,end:k.a.end!})));marks.forEach((k,i)=>k.lane=lanes[i]);
  let total=0;for(const n of a.annotations)if(n.mapping==='mapped'&&variantOf(n))total++;
  const value:VariantLayout={marks,lanes:count,overflow,total};
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
  for(const {k,left,right} of navigable(v)){
    if(k.lane!==lane)continue;
    const d=Math.abs(x-(left+right)/2*cw);if(d<=Math.max((right-left)*cw/2,6)&&d<near){near=d;best=k.a;}
  }
  return best;
}
/** Select a variant's columns and row, expanding its group when collapsed, and scroll it into view. */
export function selectVariant(v:Core,n:Annotation):void {
  const a=v.a!,row=n.rowId?a.rows.findIndex(r=>r.id===n.rowId):-1;
  if(row>=0&&v.grouped){const g=v.groupName(row);if(g&&v.collapsed.has(g))v.toggleGroup(g,false);}
  v.variantCursor=n.id;v.setSelection({start:n.start!,end:n.end!,...(n.rowId?{rowId:n.rowId}:{})});
}
/** Marks with at least one shown column, ordered by display column (left to right on screen, so right to left in source columns in the reverse-complement view), then row rank. Cached on the layout per column map. */
export function navigable(v:Core):NavMark[] {
  const l=variantLayout(v),m=v.columns;if(l.nav?.columns===m)return l.nav.list;
  const list:NavMark[]=[];
  for(const k of l.marks){const [left,right]=columnSpan(m,k.a.start!,k.a.end!);if(right>left)list.push({k,left,right});}
  list.sort((x,y)=>x.left-y.left||x.k.rank-y.k.rank||x.right-y.right);
  l.nav={columns:m,list};return list;
}
const current=(v:Core,list:NavMark[]):number=>{const s=v.selection;if(!s||!v.variantCursor)return -1;return list.findIndex(({k})=>k.a.id===v.variantCursor&&k.a.start===s.start&&k.a.end===s.end&&(k.a.rowId??undefined)===s.rowId);};
export function nextVariant(v:Core,direction:number=1):Annotation|null {
  v.assertAlive();if(!v.a)return null;const list=navigable(v),n=list.length;if(!n)return null;
  const dir=direction<0?-1:1;let i=current(v,list);
  if(i>=0)i=(i+dir+n)%n;
  else{
    const s=v.selection;
    if(!s)i=dir>0?0:n-1;
    else{
      const at=columnSpan(v.columns,s.start,s.end)[0],row=s.rowId?rowRank(v,s.rowId,list):dir>0?-Infinity:Infinity;
      const after=({k,left}:NavMark)=>left>at||left===at&&k.rank>row,before=({k,left}:NavMark)=>left<at||left===at&&k.rank<row;
      if(dir>0){i=list.findIndex(after);if(i<0)i=0;}else{i=n-1;while(i>=0&&!before(list[i]))i--;if(i<0)i=n-1;}
    }
  }
  const a=list[i].k.a;selectVariant(v,a);return {...a};
}
const rowRank=(v:Core,rowId:string,list:NavMark[]):number=>{const hit=list.find(({k})=>k.a.rowId===rowId);if(hit)return hit.k.rank;const r=v.a!.rows.findIndex(x=>x.id===rowId);return v.pinned&&r===v.reference?-1:v.rowPos[r]??-1;};
/** Show the navigation buttons only when the alignment has mapped variants; the counter reads k / n over the variants shown. Recomputed only when the layout, column map, selection or cursor changes. */
export function syncVariantNav(v:Core):void {
  const l=variantLayout(v),key=[l,v.columns,v.selection,v.variantCursor],old=v.variantNavKey;
  if(old&&old.every((x,i)=>x===key[i]))return;v.variantNavKey=key;
  const nav=$(v.root,'.ak-variant-nav'),list=l.total?navigable(v):[],i=list.length?current(v,list):-1;
  nav.dataset.empty=String(!l.total);
  $(nav,'output').textContent=`${i<0?'–':i+1} / ${list.length}`;
  for(const b of nav.querySelectorAll('button'))b.disabled=!list.length;
}
export function addVariants(v:Core,variants:readonly VariantInput[],options:VariantOptions={}):VariantResult {
  v.assertAlive();if(!v.a)throw new Error('Load an alignment before adding variants.');
  const result=variantsToAnnotations(v.a,variants,options);v.addAnnotations(result.annotations);
  const mapped=result.annotations.filter(a=>a.mapping==='mapped').length;
  v.message(`Added ${result.annotations.length} variants (${mapped} mapped).${result.warnings.length?` ${result.warnings.length} warnings: ${result.warnings.slice(0,3).join(' ')}${result.warnings.length>3?' …':''}`:''}`);
  return result;
}
