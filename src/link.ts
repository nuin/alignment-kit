import { mergeColumnRanges } from './mask';
import type { ColorMode, RulerCoordinates, Selection, ViewState } from './types';

/** View fields a shareable link can carry. Annotation filters and visibility stay out of links. */
export interface ViewLink {
  source?:string; alignmentId?:string; selection?:Selection|null; referenceId?:string;
  colorScheme?:string; colorMode?:ColorMode; matchDisplay?:'letter'|'dot'; cellWidth?:number; query?:string;
  sort?:ViewState['sort']; statisticsScope?:ViewState['statisticsScope']; start?:number; rowOffset?:number; rulerCoordinates?:RulerCoordinates;
  /** Manually hidden columns, from `hide=10-20,30-35`. */
  hiddenColumns?:[number,number][];
  /** Parameter names present in the link but malformed. */
  ignored?:string[];
}
const modes:ColorMode[]=['all','reference-differences','reference-matches','consensus-differences','consensus-matches'];
const sorts:ViewState['sort'][]=['input','name','identity','tree'];
const scopes:ViewState['statisticsScope'][]=['all','filtered'];
const keys=['src','aln','sel','row','ref','scheme','mode','zoom','q','sort','scope','x','y','dots','ruler','hide'];
/** True when a fragment or query holds at least one link parameter; plain anchors such as `#viewer` do not. */
export const isViewLink=(input:string):boolean=>{const p=new URLSearchParams(input.replace(/^[#?]/,''));return keys.some(key=>key==='ruler'?!!p.get(key):p.has(key));};

/** Readable URL parameters, e.g. `src=…&sel=50-60&row=seq-3&ref=seq-1&scheme=soft&zoom=16`. Defaults are omitted. */
export function encodeViewLink(state:ViewState,source?:string):string {
  const p=new URLSearchParams();
  if(source)p.set('src',source);
  if(state.alignmentId)p.set('aln',state.alignmentId);
  if(state.selection){p.set('sel',state.selection.start===state.selection.end?String(state.selection.start):`${state.selection.start}-${state.selection.end}`);if(state.selection.rowId)p.set('row',state.selection.rowId);}
  if(state.referenceId)p.set('ref',state.referenceId);
  p.set('scheme',state.colorScheme);
  if(state.colorMode!=='all')p.set('mode',state.colorMode);
  if(state.matchDisplay==='dot')p.set('dots','1');
  p.set('zoom',String(state.cellWidth));
  if(state.query)p.set('q',state.query);
  if(state.sort!=='input'&&state.sort!=='manual')p.set('sort',state.sort);
  if(state.statisticsScope!=='all')p.set('scope',state.statisticsScope);
  if(state.rulerCoordinates==='reference')p.set('ruler','ref');
  if(state.hiddenColumns?.length)p.set('hide',state.hiddenColumns.map(([s,e])=>s===e?String(s):`${s}-${e}`).join(','));
  if(state.start>1)p.set('x',String(state.start));
  if(state.rowOffset>0)p.set('y',String(state.rowOffset));
  return p.toString();
}

/** Parse a link fragment or query (with or without `#`/`?`). Unknown parameters are kept out; malformed ones are listed in `ignored`. */
export function decodeViewLink(input:string):ViewLink {
  const p=new URLSearchParams(input.replace(/^[#?]/,'')),link:ViewLink={},ignored:string[]=[];
  const int=(key:string,min:number)=>{const value=p.get(key);if(value===null)return undefined;const n=Number(value);if(Number.isInteger(n)&&n>=min)return n;ignored.push(key);return undefined;};
  const pick=<T extends string>(key:string,allowed:readonly T[])=>{const value=p.get(key);if(value===null)return undefined;if((allowed as readonly string[]).includes(value))return value as T;ignored.push(key);return undefined;};
  const str=(key:string)=>p.get(key)||undefined;
  const source=str('src');
  if(source){try{const url=new URL(source,'http://link.invalid');if(['http:','https:'].includes(url.protocol))link.source=source;else ignored.push('src');}catch{ignored.push('src');}}
  link.alignmentId=str('aln');link.referenceId=str('ref');link.colorScheme=str('scheme');link.query=str('q');
  const sel=p.get('sel');
  if(sel!==null){const m=sel.match(/^(\d+)(?:-(\d+))?$/),start=m?Number(m[1]):0,end=m?Number(m[2]??m[1]):0;if(m&&start>=1&&end>=start)link.selection={start,end,...(p.get('row')?{rowId:p.get('row')!}:{})};else ignored.push('sel');}
  link.colorMode=pick('mode',modes);link.sort=pick('sort',sorts);link.statisticsScope=pick('scope',scopes);
  const dots=p.get('dots');if(dots==='1')link.matchDisplay='dot';else if(dots==='0')link.matchDisplay='letter';else if(dots!==null)ignored.push('dots');
  link.rulerCoordinates=pick('ruler',['ref'] as const)&&'reference';
  const hide=p.get('hide');
  if(hide!==null){
    const parts=hide.split(',').map(part=>part.match(/^(\d+)(?:-(\d+))?$/)),ranges=parts.map(m=>m&&[Number(m[1]),Number(m[2]??m[1])] as [number,number]);
    if(ranges.length&&ranges.every(r=>r&&r[0]>=1&&r[1]>=r[0]))link.hiddenColumns=mergeColumnRanges(ranges as [number,number][]);else ignored.push('hide');
  }
  link.cellWidth=int('zoom',1);link.start=int('x',1);link.rowOffset=int('y',0);
  for(const key of Object.keys(link) as (keyof ViewLink)[])if(link[key]===undefined)delete link[key];
  if(ignored.length)link.ignored=ignored;
  return link;
}
