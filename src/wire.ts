import type { Alignment, Alphabet, Annotation, AlignmentMetadata, SequenceInput, ViewState } from './types';
import { createAlignment } from './model';
import { parseViewerConfig, type ViewerConfig } from './config';
import { parseNewick } from './tree';

/** One row of a wire document. `sequence` holds one character per alignment column; `id` defaults to `seq-N`. */
export interface WireRow { id?:string; name:string; sequence:string; species?:string; metadata?:Record<string,unknown> }
/** Wire format version 1: the JSON document every language binding sends to the viewer. See docs/reference/wire-format.md. */
export interface WireDocument {
  $schema?:string; format:'msa-canvas'; version:1;
  alignment:{id?:string;name?:string;alphabet?:Alphabet;rows:WireRow[];metadata?:AlignmentMetadata};
  annotations?:Annotation[]; /** Newick text. */ tree?:string; config?:ViewerConfig; state?:ViewState;
}
/** Optional parts of a document. `annotations` replaces the annotations of the alignment. */
export interface WireExtras { annotations?:Annotation[]; tree?:string; config?:unknown; state?:ViewState }
/** A validated document. `state.alignmentId` is the id of `alignment`. */
export interface WireContent { alignment:Alignment; tree?:string; config?:ViewerConfig; state?:ViewState }
export const WIRE_FORMAT='msa-canvas' as const,WIRE_VERSION=1 as const;
/** The one marker of dist/template.html. It is joined at run time so that the bundled copy of this module does not contain it. */
export const WIRE_PLACEHOLDER:string=['{{MSA','PAYLOAD','JSON}}'].join('_');

type Dict=Record<string,unknown>;
const fail=(message:string):never=>{throw new Error(`Invalid msa-canvas document: ${message}`);};
const dict=(v:unknown):v is Dict=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const only=(v:Dict,keys:string[],at:string)=>{for(const key of Object.keys(v))if(!keys.includes(key))fail(`unknown key "${key}" in ${at}.`);};
const text=(v:Dict,key:string,at:string,required=false)=>{if(v[key]===undefined?required:typeof v[key]!=='string')fail(`${at}.${key} must be a string.`);};
const flag=(v:Dict,key:string,at:string)=>{if(v[key]!==undefined&&typeof v[key]!=='boolean')fail(`${at}.${key} must be a boolean.`);};
const bag=(v:Dict,key:string,at:string,required=false)=>{if(v[key]===undefined?required:!dict(v[key]))fail(`${at}.${key} must be an object.`);};
const num=(v:Dict,key:string,at:string)=>{if(typeof v[key]!=='number'||!Number.isFinite(v[key]))fail(`${at}.${key} must be a finite number.`);};
const pick=(v:Dict,key:string,at:string,values:readonly string[],required=false)=>{if(v[key]===undefined?required:!values.includes(v[key] as string))fail(`${at}.${key} must be one of ${values.join(', ')}.`);};
const alphabets=['protein','dna','rna'],sorts=['input','name','identity','gaps','length','residue','annotations','manual','tree'],colorModes=['all','reference-differences','reference-matches','consensus-differences','consensus-matches'];

function checkAnnotation(v:unknown,i:number):Annotation {
  const at=`annotations[${i}]`;
  if(!dict(v))return fail(`${at} must be an object.`);
  only(v,['id','rowId','label','start','end','kind','consequence','disease','phenotype','color','mapping','metadata'],at);
  text(v,'id',at,true);text(v,'label',at,true);text(v,'rowId',at);text(v,'kind',at);text(v,'color',at);flag(v,'disease',at);flag(v,'phenotype',at);bag(v,'metadata',at);
  pick(v,'mapping',at,['mapped','unmapped'],true);
  for(const key of ['start','end'])if(v[key]!==undefined&&!Number.isInteger(v[key]))fail(`${at}.${key} must be an integer.`);
  if(v.consequence!==undefined&&!(Array.isArray(v.consequence)&&v.consequence.every(c=>typeof c==='string')))fail(`${at}.consequence must be an array of strings.`);
  return v as unknown as Annotation;
}
/** Checks the keys setState reads without a fallback. Row IDs, columns and search patterns are checked by setState against the loaded alignment. */
function checkState(v:unknown):ViewState {
  if(!dict(v))return fail('state must be an object.');
  if(v.version!==1)fail(`state.version ${JSON.stringify(v.version)} is not supported; this build reads version 1.`);
  for(const key of ['start','rowOffset','cellWidth'])num(v,key,'state');
  for(const key of ['query','colorScheme'])text(v,key,'state',true);
  text(v,'alignmentId','state');bag(v,'annotationFilter','state',true);bag(v,'visibility','state');
  pick(v,'sort','state',sorts,true);pick(v,'colorMode','state',colorModes,true);pick(v,'statisticsScope','state',['all','filtered'],true);
  if(v.referenceId!==null&&typeof v.referenceId!=='string')fail('state.referenceId must be a string or null.');
  const s=v.selection;
  if(s!==null&&!(dict(s)&&Number.isInteger(s.start)&&Number.isInteger(s.end)&&(s.rowId===undefined||typeof s.rowId==='string')))fail('state.selection must be null or {start, end, rowId?} with integer columns.');
  return v as unknown as ViewState;
}
const checkTree=(v:unknown):string=>{if(typeof v!=='string')return fail('tree must be a Newick string.');parseNewick(v);return v;};

/** The alignment as a version 1 wire document made of plain JSON values; pass it to JSON.stringify. `config`, `state` and `tree` are validated and throw on bad input. */
export function toJson(alignment:Alignment,extras:WireExtras={}):WireDocument {
  const {width,codes}=alignment,decoder=new TextDecoder();
  const rows=alignment.rows.map((row,r):WireRow=>({id:row.id,name:row.name,sequence:decoder.decode(codes.subarray(r*width,(r+1)*width)),...(row.species===undefined?{}:{species:row.species}),...(row.metadata&&Object.keys(row.metadata).length?{metadata:clone(row.metadata)}:{})}));
  const annotations=clone(extras.annotations??alignment.annotations).map(checkAnnotation),metadata=clone(alignment.metadata??{});
  return {
    format:WIRE_FORMAT,version:WIRE_VERSION,
    alignment:{id:alignment.id,name:alignment.name,alphabet:alignment.alphabet,rows,...(Object.keys(metadata).length?{metadata}:{})},
    ...(annotations.length?{annotations}:{}),
    ...(extras.tree===undefined?{}:{tree:checkTree(extras.tree)}),
    ...(extras.config===undefined?{}:{config:clone(parseViewerConfig(extras.config))}),
    ...(extras.state===undefined?{}:{state:{...clone(checkState(extras.state)),alignmentId:alignment.id}}),
  };
}

/** Reads a version 1 wire document from JSON text or a parsed value. Throws an Error that names the offending key. A `state` in the document applies to the alignment in the document, so its `alignmentId` is set to that alignment's id. */
export function fromJson(input:string|unknown):WireContent {
  let doc:unknown=input;
  if(typeof input==='string')try{doc=JSON.parse(input);}catch{fail('the text is not JSON.');}
  if(!dict(doc))return fail('expected a JSON object.');
  if(doc.format!==WIRE_FORMAT)fail(`format must be "${WIRE_FORMAT}".`);
  if(doc.version!==WIRE_VERSION)fail(`version ${JSON.stringify(doc.version)} is not supported; this build reads version ${WIRE_VERSION}.`);
  only(doc,['$schema','format','version','alignment','annotations','tree','config','state'],'the document');
  const a=doc.alignment;
  if(!dict(a))return fail('alignment must be an object.');
  only(a,['id','name','alphabet','rows','metadata'],'alignment');text(a,'id','alignment');text(a,'name','alignment');bag(a,'metadata','alignment');pick(a,'alphabet','alignment',alphabets);
  if(!Array.isArray(a.rows)||!a.rows.length)fail('alignment.rows must be a non-empty array.');
  const rows=(a.rows as unknown[]).map((row,i):SequenceInput=>{
    const at=`alignment.rows[${i}]`;
    if(!dict(row))return fail(`${at} must be an object.`);
    only(row,['id','name','sequence','species','metadata'],at);text(row,'name',at,true);text(row,'sequence',at,true);text(row,'id',at);text(row,'species',at);bag(row,'metadata',at);
    return row as unknown as SequenceInput;
  });
  if(doc.annotations!==undefined&&!Array.isArray(doc.annotations))fail('annotations must be an array.');
  const annotations=((doc.annotations??[]) as unknown[]).map(checkAnnotation);
  const built=createAlignment(rows,{name:a.name as string|undefined,alphabet:a.alphabet as Alphabet|undefined,annotations,metadata:a.metadata as AlignmentMetadata|undefined});
  const alignment=typeof a.id==='string'&&a.id?{...built,id:a.id}:built;
  return {
    alignment,
    ...(doc.tree===undefined?{}:{tree:checkTree(doc.tree)}),
    ...(doc.config===undefined?{}:{config:parseViewerConfig(doc.config)}),
    ...(doc.state===undefined?{}:{state:{...checkState(doc.state),alignmentId:alignment.id}}),
  };
}

/** JSON text that is safe inside a script element: every `<` becomes `<`, so `</script>` and `<!--` cannot occur. The text stays valid JSON because `<` only occurs inside strings. */
export const escapeJson=(json:string):string=>json.replace(/</g,'\\u003c');
/** Puts a wire document into dist/template.html (or any text with exactly one placeholder) and returns the page. */
export function fillTemplate(template:string,doc:WireDocument):string {
  const at=template.indexOf(WIRE_PLACEHOLDER);
  if(at<0||template.indexOf(WIRE_PLACEHOLDER,at+1)>=0)throw new Error(`The template must contain ${WIRE_PLACEHOLDER} exactly once.`);
  return template.slice(0,at)+escapeJson(JSON.stringify(doc))+template.slice(at+WIRE_PLACEHOLDER.length);
}
