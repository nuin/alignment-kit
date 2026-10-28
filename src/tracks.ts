import type { Alignment, CustomTrack, TrackType } from './types';
import { defaultVisibility } from './visibility';
export const trackTypes:readonly TrackType[]=['bar','heatmap','text','custom'];
const known=new Set(['id','label','height','type','values','domain','color','render']);
const fail=(id:string,message:string):never=>{throw new Error(`Track ${id}: ${message}`);};
/** Validate one track definition. `json` rejects functions and typed arrays so the result stays JSON-safe. Returns a shallow copy. */
export function validateTrack(input:unknown,json=false):CustomTrack {
  if(typeof input!=='object'||input===null||Array.isArray(input))throw new Error('A track must be an object.');
  const t=input as Record<string,unknown>,id=typeof t.id==='string'?t.id:'';
  if(!/^[\w.:-]{1,64}$/.test(id))throw new Error('Track id must be 1 to 64 letters, digits, dots, colons, underscores or hyphens.');
  if(Object.hasOwn(defaultVisibility,id))fail(id,'the id is reserved by a built-in track or visibility key.');
  for(const key of Object.keys(t))if(!known.has(key))fail(id,`unknown field ${key}.`);
  if(typeof t.label!=='string'||!t.label.trim()||t.label.length>120)fail(id,'label must be a non-empty string of at most 120 characters.');
  if(!trackTypes.includes(t.type as TrackType))fail(id,`type must be one of ${trackTypes.join(', ')}.`);
  if(t.height!==undefined&&(typeof t.height!=='number'||!Number.isFinite(t.height)||t.height<12||t.height>120))fail(id,'height must be a number between 12 and 120.');
  if(t.domain!==undefined&&(!Array.isArray(t.domain)||t.domain.length!==2||t.domain.some(x=>typeof x!=='number'||!Number.isFinite(x))||t.domain[0]>=t.domain[1]))fail(id,'domain must be [min, max] with min below max.');
  if(t.color!==undefined&&(typeof t.color!=='string'||!t.color))fail(id,'color must be a non-empty string.');
  const v=t.values;
  if(v!==undefined&&typeof v!=='string'){
    if(typeof v!=='object'||v===null||typeof (v as ArrayLike<unknown>).length!=='number')fail(id,'values must be a string or an array with one entry per column.');
    if(json&&(!Array.isArray(v)||v.some(x=>x!==null&&(typeof x!=='number'||!Number.isFinite(x)))))fail(id,'values must be a string or an array of numbers and nulls.');
  }
  if(t.render!==undefined){
    if(json)fail(id,'render cannot be set in JSON configuration.');
    if(typeof t.render!=='function')fail(id,'render must be a function.');
    if(t.type!=='custom')fail(id,'render is only used by custom tracks.');
  } else if(t.type==='custom')fail(id,'custom tracks require a render function.');
  return Object.assign({id,label:t.label as string,type:t.type as TrackType},t);
}
/** Validate a list of definitions, rejecting duplicate ids. */
export function validateTracks(input:unknown,json=false):CustomTrack[] {
  if(!Array.isArray(input))throw new Error('tracks must be an array.');
  const tracks=input.map(t=>validateTrack(t,json)),ids=new Set<string>();
  for(const t of tracks){if(ids.has(t.id))throw new Error(`Track ${t.id}: duplicate id.`);ids.add(t.id);}
  return tracks;
}
export const trackHeight=(t:CustomTrack):number=>t.height??26;
/** Throws unless `values` is absent or has exactly one entry per column. */
export function checkTrackLength(t:CustomTrack,width:number):void {
  if(t.values!==undefined&&t.values.length!==width)throw new Error(`Track ${t.id}: values has ${t.values.length} entries; expected ${width}, one per alignment column.`);
}
/** Numeric value at a 0-based column, or null. String values read digits as numbers. */
export function trackNumber(t:CustomTrack,column:number):number|null {
  const v=t.values?.[column];
  if(typeof v==='string'){const n=v>='0'&&v<='9'&&v.length===1?Number(v):NaN;return Number.isNaN(n)?null:n;}
  return typeof v==='number'&&Number.isFinite(v)?v:null;
}
/** Single character at a 0-based column for text tracks; blank when absent. */
export function trackText(t:CustomTrack,column:number):string {
  const v=t.values?.[column];
  return v===undefined||v===null?'':typeof v==='number'?String(Math.round(v*100)/100):v;
}
const blank=new Set(['','.','-','_','~',' ',':']);
export const isTrackBlank=(c:string):boolean=>blank.has(c);
/** Tracks from Stockholm #=GC lines and the #=GR lines of one row (PP_cons and PP as 0-9 shading). */
export function stockholmTracks(a:Alignment,rowIndex:number):CustomTrack[] {
  const st=a.metadata.stockholm,out:CustomTrack[]=[];if(!st)return out;
  const make=(id:string,label:string,key:string,values:string):CustomTrack=>key==='PP_cons'||key==='PP'?{id,label,height:20,type:'heatmap',values,domain:[0,9],color:'#6b7785'}:{id,label,height:20,type:'text',values};
  for(const [key,values] of Object.entries(st.GC))if(values.length===a.width)out.push(make(`gc:${key}`,key,key,values));
  const row=a.rows[rowIndex],gr=row?st.GR[row.name]:undefined;
  if(row&&gr)for(const [key,values] of Object.entries(gr))if(values.length===a.width)out.push(make(`gr:${key}:${row.id}`,`${key} ${row.name}`,key,values));
  return out;
}
