import type { Alignment, Annotation } from './types';
import { isGap, rowOffset } from './model';
export type VariantClass='nonsense'|'frameshift'|'missense'|'inframe'|'splice'|'synonymous'|'other';
export type VariantType='substitution'|'deletion'|'insertion'|'delins'|'duplication'|'frameshift'|'other';
export type VariantShape='diamond'|'triangle'|'chevron'|'square';
/** Stored as `annotation.metadata.variant`. `ref` and `alt` are one-letter residues, `*` for a stop. */
export interface VariantInfo { ref?:string; alt?:string; type:VariantType; hgvs?:string; consequenceClass:VariantClass }
/** A variant to place on a row. `position` and `end` are 1-based; `hgvs` (protein, such as p.Arg123Trp) fills fields left out. */
export interface VariantInput { id?:string; rowId:string; position?:number; end?:number; ref?:string; alt?:string; type?:string; consequence?:string|string[]; hgvs?:string; label?:string; disease?:boolean; phenotype?:boolean; color?:string; metadata?:Record<string,unknown> }
/** Coordinates of explicit `position` and `end`: 'sequence' (default) counts ungapped residues from 1 without the row offset, 'residue' applies the row offset (`metadata.start`, as in the ruler), 'alignment' uses alignment columns. Positions read from HGVS always use 'residue'. */
export interface VariantOptions { coordinates?:'sequence'|'residue'|'alignment' }
export interface VariantResult { annotations:Annotation[]; warnings:string[] }
/** `start` and `end` are protein positions; `ref` lists the residues HGVS names (one, or the first and last of a range). */
export interface HgvsProtein { start:number; end:number; ref:string; alt:string; type:VariantType; consequence:string }
/** Okabe-Ito colors per consequence class: vermillion, reddish purple, blue, orange, sky blue, bluish green and grey. */
export const variantColors:Readonly<Record<VariantClass,string>>=Object.freeze({nonsense:'#D55E00',frameshift:'#CC79A7',missense:'#0072B2',inframe:'#E69F00',splice:'#56B4E9',synonymous:'#009E73',other:'#999999'});
export const variantClassLabels:Readonly<Record<VariantClass,string>>=Object.freeze({nonsense:'Nonsense (stop gained)',frameshift:'Frameshift',missense:'Missense',inframe:'In-frame insertion or deletion',splice:'Splice',synonymous:'Synonymous',other:'Other or unknown'});
const hex=/^#[0-9a-f]{6}$/i;
/** True when the annotation carries `metadata.variant`; `kind` alone does not make a variant. */
export const isVariant=(a:Annotation):boolean=>!!(a.metadata&&typeof a.metadata.variant==='object'&&a.metadata.variant);
const three:Record<string,string>={Ala:'A',Arg:'R',Asn:'N',Asp:'D',Cys:'C',Gln:'Q',Glu:'E',Gly:'G',His:'H',Ile:'I',Leu:'L',Lys:'K',Met:'M',Phe:'F',Pro:'P',Ser:'S',Thr:'T',Trp:'W',Tyr:'Y',Val:'V',Sec:'U',Pyl:'O',Ter:'*'};
const styles=[{aa:Object.keys(three).join('|'),one:(s:string)=>s.replace(/[A-Z][a-z]{2}/g,x=>three[x])},{aa:'[ACDEFGHIKLMNPQRSTVWYUOX*]',one:(s:string)=>s.replace(/X/g,'*')}];
/** Parse a protein HGVS change: substitutions (p.Arg123Trp, p.R123W, p.Arg123Ter, p.Arg123*, p.Arg123=), frameshifts (p.Arg123fs, p.Arg123ProfsTer5, p.Arg97ProfsTer), del, dup, ins, delins, extensions (p.Ter110GlnextTer17) and an unknown effect at one residue (p.Met1?), with or without parentheses and an accession prefix. Null when it does not parse. */
export function parseHgvsProtein(text:string):HgvsProtein|null {
  const m=/^(?:[^\s:]+:)?p\.(\()?(.+?)(\))?$/.exec(String(text??'').trim());if(!m||!m[1]!==!m[3])return null;
  for(const {aa,one} of styles){
    const r=new RegExp(`^(${aa})(\\d+)(?:_(${aa})(\\d+))?(?:(=|\\*|${aa})|(?:(${aa})?fs(?:(?:Ter|\\*|X)(?:\\d+|\\?)?)?)|(del)|(dup)|ins((?:${aa})+)|delins((?:${aa})+)|(\\?)|(${aa})ext(?:Ter|\\*|X)?(?:-?\\d+|\\?)?)$`).exec(m[2]);
    if(!r)continue;
    const [,r1,p1,r2,p2,sub,fsAlt,del,dup,ins,delins,unknown,ext]=r,start=Number(p1),end=p2?Number(p2):start,ref=one(r1+(r2??''));
    if(start<1||end<start||ref.slice(0,1)==='*'&&!sub&&!ext)return null;
    if(unknown){if(p2)return null;return {start,end,ref,alt:'',type:'other',consequence:start===1&&ref==='M'?'start_lost':'protein_altering_variant'};}
    if(ext!==undefined){if(p2)return null;return {start,end,ref,alt:one(ext),type:'substitution',consequence:ref==='*'?'stop_lost':'start_lost'};}
    if(sub!==undefined){if(p2)return null;const alt=sub==='='?ref:one(sub);return {start,end,ref,alt,type:'substitution',consequence:alt===ref?'synonymous_variant':alt==='*'?'stop_gained':ref==='*'?'stop_lost':'missense_variant'};}
    if(del)return {start,end,ref,alt:'',type:'deletion',consequence:'inframe_deletion'};
    if(dup)return {start,end,ref,alt:'',type:'duplication',consequence:'inframe_insertion'};
    if(ins!==undefined){if(!p2||end!==start+1)return null;return {start,end,ref,alt:one(ins),type:'insertion',consequence:'inframe_insertion'};}
    if(delins!==undefined)return {start,end,ref,alt:one(delins),type:'delins',consequence:'protein_altering_variant'};
    if(p2)return null;
    return {start,end,ref,alt:fsAlt?one(fsAlt):'',type:'frameshift',consequence:'frameshift_variant'};
  }
  return null;
}
/** Normalize a free-text variant type (PAVI seq_substitution_type, SO names, short forms). */
export function variantType(text:string|undefined):VariantType {
  const t=(text??'').toLowerCase().replace(/[\s-]+/g,'_');
  if(/^(substitution|snp|snv|mnv|point_mutation|missense|nonsense|single_nucleotide_variant|synonymous)/.test(t))return 'substitution';
  if(/^delins|^indel|^complex_substitution/.test(t))return 'delins';
  if(/^del/.test(t))return 'deletion';
  if(/^ins/.test(t))return 'insertion';
  if(/^dup/.test(t))return 'duplication';
  if(/^frameshift/.test(t))return 'frameshift';
  return 'other';
}
/** Consequence class from Sequence Ontology terms, most severe first; the variant type decides when no term is known. */
export function consequenceClass(consequences?:string|readonly string[],type?:string):VariantClass {
  const terms=(typeof consequences==='string'?[consequences]:consequences??[]).map(c=>String(c).toLowerCase().trim().replace(/[\s-]+/g,'_'));
  const has=(re:RegExp)=>terms.some(t=>re.test(t));
  if(has(/^(stop_gained|nonsense)/))return 'nonsense';
  if(has(/^frameshift/))return 'frameshift';
  if(has(/^missense/))return 'missense';
  if(has(/^(inframe_|disruptive_inframe_|conservative_inframe_|protein_altering)/))return 'inframe';
  if(has(/^splice/))return 'splice';
  if(has(/^(synonymous|stop_retained|start_retained)/))return 'synonymous';
  const t=(type??'').toLowerCase();
  if(t==='nonsense')return 'nonsense';if(t==='missense')return 'missense';
  const n=variantType(t);return n==='frameshift'?'frameshift':n==='deletion'||n==='insertion'||n==='delins'||n==='duplication'?'inframe':'other';
}
const classes=new Set(Object.keys(variantColors));
/** The variant record of an annotation (metadata.variant with type and class checked), or null for other annotations. */
export function variantOf(a:Annotation):VariantInfo|null {
  if(!isVariant(a))return null;const m=a.metadata?.variant as Partial<VariantInfo>|undefined;
  const type=m&&typeof m.type==='string'?variantType(m.type):variantType(a.kind);
  const cls=m&&classes.has(m.consequenceClass as string)?m.consequenceClass!:consequenceClass(a.consequence,a.kind);
  return {...(m&&typeof m.ref==='string'?{ref:m.ref}:{}),...(m&&typeof m.alt==='string'?{alt:m.alt}:{}),...(m&&typeof m.hgvs==='string'?{hgvs:m.hgvs}:{}),type,consequenceClass:cls};
}
/** Outline color of an annotation: its own hex color, else the consequence color for a variant, else the feature red. */
const colorCache=new WeakMap<Annotation,string>();
export function annotationColor(a:Annotation):string {
  let c=colorCache.get(a);if(c)return c;
  if(a.color&&hex.test(a.color))c=a.color;else{const v=variantOf(a);c=v?variantColors[v.consequenceClass]:'#a63d59';}
  colorCache.set(a,c);return c;
}
export function variantShape(v:VariantInfo):VariantShape {
  if(v.consequenceClass==='nonsense'||v.consequenceClass==='frameshift'||v.type==='frameshift')return 'square';
  if(v.type==='deletion')return 'triangle';if(v.type==='insertion'||v.type==='duplication')return 'chevron';return 'diamond';
}
export const MAX_LANES=8;
/** Greedy lanes: spans sorted by start go into the first of at most `max` lanes whose last span ends before them. A span that fits no lane gets -1 and counts in `overflow`. */
export function assignLanes(spans:readonly {start:number;end:number}[],max=MAX_LANES):{lanes:number[];count:number;overflow:number} {
  const order=spans.map((_,i)=>i).sort((x,y)=>spans[x].start-spans[y].start||spans[x].end-spans[y].end||x-y),ends:number[]=[],lanes=new Array<number>(spans.length);let overflow=0;
  for(const i of order){
    let lane=-1;for(let k=0;k<ends.length;k++)if(ends[k]<spans[i].start){lane=k;break;}
    if(lane<0&&ends.length<max)lane=ends.push(0)-1;
    if(lane<0){lanes[i]=-1;overflow++;continue;}
    ends[lane]=spans[i].end;lanes[i]=lane;
  }
  return {lanes,count:ends.length,overflow};
}
/** Alignment columns of the residues of one row, written into a buffer reused across rows; returns the residue count. */
const fillResidues=(a:Alignment,row:number,buffer:Int32Array):number=>{let n=0;for(let c=0;c<a.width;c++)if(!isGap(a.codes[row*a.width+c]))buffer[n++]=c+1;return n;};
/** Columns `from`..`to` of a row as upper-case residues, gaps skipped. */
const residuesAt=(a:Alignment,row:number,from:number,to:number):string=>{let s='';for(let c=from;c<=to;c++){const k=a.codes[row*a.width+c-1];if(!isGap(k))s+=String.fromCharCode(k).toUpperCase();}return s;};
/** True when `ref` agrees with the residues: all of them when the lengths match, else the first and last for two letters, else the first. */
const refAgrees=(ref:string,seq:string):boolean=>{const r=ref.toUpperCase();if(!seq)return false;if(r.length===seq.length)return r===seq;if(r.length===2)return r[0]===seq[0]&&r[1]===seq[seq.length-1];return r[0]===seq[0];};
/** `hgvsPosition: false` keeps HGVS positions out of the mapping (PAVI supplies alignment columns separately). */
export function mapVariants(alignment:Alignment,variants:readonly VariantInput[],options:VariantOptions&{hgvsPosition?:boolean}={}):VariantResult {
  const warnings:string[]=[],coords=options.coordinates??'sequence';
  if(coords!=='sequence'&&coords!=='alignment'&&coords!=='residue')throw new Error('coordinates must be "sequence", "residue" or "alignment".');
  const byId=new Map(alignment.rows.map((r,i)=>[r.id,i])),used=new Set(alignment.annotations.map(a=>a.id)),seen=new Set<string>();
  let buffer:Int32Array|undefined,bufferRow=-1,count=0;
  const annotations=variants.map((input,i):Annotation=>{
    const hgvs=typeof input.hgvs==='string'&&input.hgvs.trim()?input.hgvs.trim():undefined,parsed=hgvs?parseHgvsProtein(hgvs):null;
    const row=byId.get(input.rowId)??-1,name=input.label??hgvs??input.id??`variant ${i+1}`;
    if(hgvs&&!parsed)warnings.push(`${name}: could not parse HGVS “${hgvs}”.`);
    // HGVS positions are residue numbers, so they take the row offset whatever `coordinates` says.
    const fromHgvs=input.position===undefined&&options.hgvsPosition!==false&&!!parsed,mode=fromHgvs?'residue':coords;
    const pos=input.position??(fromHgvs?parsed!.start:undefined),last=input.end??(fromHgvs?parsed!.end:undefined)??pos;
    const ref=input.ref??parsed?.ref,alt=input.alt??parsed?.alt,type=input.type!==undefined?variantType(input.type):parsed?.type??(ref&&alt?(ref.length===alt.length?'substitution':alt.length?'delins':'deletion'):'other');
    const consequence=input.consequence!==undefined?(Array.isArray(input.consequence)?[...input.consequence]:[input.consequence]):parsed?[parsed.consequence]:undefined;
    const kind=input.type??(type==='other'?'variant':type),cls=consequenceClass(consequence,kind);
    let id=input.id??`${input.rowId}:${hgvs||pos}:${i}`;
    if(seen.has(id)||used.has(id)){if(input.id!==undefined)warnings.push(`${name}: duplicate ID “${id}” renamed.`);let k=1;while(seen.has(`${id}:${k}`)||used.has(`${id}:${k}`))k++;id=`${id}:${k}`;}
    seen.add(id);
    const variant:VariantInfo={...(ref!==undefined?{ref}:{}),...(alt!==undefined?{alt}:{}),type,...(hgvs?{hgvs}:{}),consequenceClass:cls};
    const base:Annotation={id,label:name,kind,mapping:'unmapped',...(consequence?{consequence}:{}),...(input.disease!==undefined?{disease:input.disease}:{}),...(input.phenotype!==undefined?{phenotype:input.phenotype}:{}),...(typeof input.color==='string'?{color:input.color}:{}),metadata:{...input.metadata,variant,...(pos!==undefined?{sourceStart:pos,sourceEnd:last}:{}),coordinates:mode}};
    if(row<0){warnings.push(`${name}: no sequence with ID “${input.rowId}”.`);return {...base,metadata:{...base.metadata,rowId:input.rowId}};}
    const rowId=alignment.rows[row].id,rowName=alignment.rows[row].name;
    if(pos===undefined||!Number.isInteger(pos)||!Number.isInteger(last)||pos<1||last!<pos){warnings.push(`${name}: no valid position on ${rowName}.`);return {...base,rowId};}
    let start:number,end:number;
    if(mode==='alignment'){
      if(last!>alignment.width){warnings.push(`${name} (${pos}-${last}) is outside the ${alignment.width} alignment columns.`);return {...base,rowId};}
      start=pos;end=last!;
    } else {
      if(bufferRow!==row){buffer??=new Int32Array(alignment.width);count=fillResidues(alignment,row,buffer);bufferRow=row;}
      const shift=mode==='residue'?rowOffset(alignment.rows[row])-1:0,from=pos-shift,to=last!-shift;
      if(from<1||to>count){warnings.push(`${name} (${pos}-${last}) is outside the ${mode==='residue'?`residues ${shift+1}-${shift+count}`:`${count} residues`} of ${rowName}.`);return {...base,rowId};}
      start=buffer![from-1];end=buffer![to-1];
    }
    if(ref&&ref!=='*'){const seq=residuesAt(alignment,row,start,end);if(!refAgrees(ref,seq))warnings.push(`${name}: reference ${ref} does not match ${seq||'a gap'} at ${mode==='alignment'?'column':'residue'} ${pos} of ${rowName}.`);}
    return {...base,rowId,start,end,mapping:'mapped'};
  });
  return {annotations,warnings};
}
/** Turn variant records into annotations with `metadata.variant`. Pure: the alignment is not changed. Unknown rows and positions outside the row give `mapping: 'unmapped'` and a warning; a `ref` that disagrees with the row adds a warning and still maps. */
export function variantsToAnnotations(alignment:Alignment,variants:readonly VariantInput[],options:VariantOptions={}):VariantResult {
  if(!Array.isArray(variants))throw new Error('variants must be an array.');
  return mapVariants(alignment,variants,{coordinates:options.coordinates});
}
