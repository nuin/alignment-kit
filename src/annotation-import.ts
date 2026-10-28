import type { Alignment, Annotation, AnnotationFormat, AnnotationImportOptions, AnnotationImportResult, AnnotationRecord } from './types';
const lines=(text:string):string[]=>text.replace(/^﻿/,'').split(/\r?\n/);
const integer=(s:string|undefined):boolean=>s!==undefined&&/^\d+$/.test(s);
const decode=(s:string):string=>{try{return decodeURIComponent(s);}catch{return s;}};
export function detectAnnotationFormat(text:string):AnnotationFormat {
  const clean=text.replace(/^﻿/,'').trimStart();
  if(/^[[{]/.test(clean)) return 'uniprot';
  if(/^LOCUS\s/m.test(clean)||/^FEATURES\s/m.test(clean)) return 'genbank';
  if(/^ID {3}/m.test(clean)&&/^FT {3}/m.test(clean)) return 'embl';
  if(/^##gff-version/m.test(clean)) return 'gff3';
  const first=lines(clean).find(l=>l.trim()&&!/^(#|track\s|browser\s)/.test(l));
  if(first){const f=first.split('\t');if(f.length===9&&integer(f[3])&&integer(f[4]))return 'gff3';const b=first.trim().split(/\s+/);if(b.length>=3&&b.length<=12&&integer(b[1])&&integer(b[2]))return 'bed';}
  throw new Error('Unrecognized annotation format. Use GFF3, BED, GenBank, EMBL or UniProt JSON.');
}
export function parseGff3(text:string,warnings:string[]=[]):AnnotationRecord[] {
  const out:AnnotationRecord[]=[];
  for(const [i,line] of lines(text).entries()) {
    if(line.startsWith('##FASTA')) break;
    if(!line.trim()||line.startsWith('#')) continue;
    const f=line.split('\t');
    if(f.length<9||!integer(f[3])||!integer(f[4])||Number(f[3])<1||Number(f[3])>Number(f[4])){warnings.push(`GFF3 line ${i+1} skipped: expected 9 tab-separated fields with 1 <= start <= end.`);continue;}
    const attributes:Record<string,string>=Object.fromEntries(f[8].split(';').filter(p=>p.includes('=')).map(p=>{const k=p.indexOf('=');return [decode(p.slice(0,k).trim()),decode(p.slice(k+1))];}));
    out.push({seqid:decode(f[0]),start:Number(f[3]),end:Number(f[4]),kind:f[2],label:attributes.Name??attributes.gene??attributes.ID??f[2],metadata:{source:f[1],score:f[5],strand:f[6],phase:f[7],attributes}});
  }
  return out;
}
export function parseBed(text:string,warnings:string[]=[]):AnnotationRecord[] {
  const out:AnnotationRecord[]=[];
  for(const [i,line] of lines(text).entries()) {
    if(!line.trim()||/^(#|track\s|browser\s)/.test(line)) continue;
    const f=line.includes('\t')?line.split('\t'):line.trim().split(/\s+/);
    if(f.length<3||!integer(f[1])||!integer(f[2])||Number(f[1])>=Number(f[2])){warnings.push(`BED line ${i+1} skipped: expected chrom, start and end with start < end.`);continue;}
    const start=Number(f[1])+1,end=Number(f[2]),name=f[3]||'',base={source:'bed',score:f[4],strand:f[5]};
    if(f.length>=12&&integer(f[9])) {
      const sizes=f[10].split(',').filter(Boolean).map(Number),offsets=f[11].split(',').filter(Boolean).map(Number),count=Number(f[9]);
      if(sizes.length!==count||offsets.length!==count||[...sizes,...offsets].some(n=>!Number.isInteger(n)||n<0)){warnings.push(`BED line ${i+1} skipped: invalid BED12 block lists.`);continue;}
      sizes.forEach((size,b)=>{if(size>0)out.push({seqid:f[0],start:start+offsets[b],end:start+offsets[b]+size-1,kind:'exon',label:name||`${f[0]}:${start}-${end} exon ${b+1}`,metadata:{...base,block:b+1,blockCount:count,name}});});
    } else out.push({seqid:f[0],start,end,kind:'region',label:name||`${f[0]}:${start}-${end}`,metadata:{...base,name}});
  }
  return out;
}
interface Feature { key:string; location:string; qualifiers:[string,string][] }
const quoteOpen=(s:string):boolean=>((s.match(/"/g)?.length)??0)%2===1;
const unquote=(s:string):string=>s.replace(/^"([\s\S]*)"$/,'$1').replace(/""/g,'"');
function locationSpan(location:string):{start:number;end:number}|undefined {
  const local=location.replace(/[A-Za-z_][\w.]*:[<>]?\d+(?:\.\.[<>]?\d+)?/g,'');
  const numbers=[...local.matchAll(/\d+/g)].map(m=>Number(m[0])).filter(n=>n>0);
  return numbers.length?{start:Math.min(...numbers),end:Math.max(...numbers)}:undefined;
}
/** GenBank and EMBL share one feature-table grammar once the 5-character line prefix is removed. */
function parseFlatFile(text:string,embl:boolean,warnings:string[]):AnnotationRecord[] {
  const out:AnnotationRecord[]=[];
  let seqid='',aliases:string[]=[],inTable=false,feature:Feature|undefined,qualifier:[string,string]|undefined;
  const flush=()=>{
    const f=feature;feature=undefined;qualifier=undefined;
    if(!f) return;
    const span=locationSpan(f.location),qualifiers=f.qualifiers.map(([k,v]):[string,string]=>[k,unquote(v)]),q=(k:string)=>qualifiers.find(p=>p[0]===k)?.[1];
    if(!span){warnings.push(`${embl?'EMBL':'GenBank'} feature ${f.key} in ${seqid||'record'} skipped: location “${f.location}” has no local coordinates.`);return;}
    out.push({seqid,start:span.start,end:span.end,kind:f.key,label:q('gene')||q('product')||q('note')||q('label')||f.key,metadata:{location:f.location,strand:f.location.includes('complement(')?'-':'+',partial:/[<>]/.test(f.location),aliases,qualifiers:Object.fromEntries(qualifiers.filter(p=>p[0]!=='translation'))}});
  };
  const addBody=(body:string)=>{
    if(!body.trim()) return;
    if(/^\S/.test(body)){flush();const m=body.match(/^(\S+)\s+(\S.*)$/);if(m)feature={key:m[1],location:m[2].trim(),qualifiers:[]};return;}
    if(!feature) return;
    const t=body.trim();
    if(qualifier&&quoteOpen(qualifier[1])){qualifier[1]+=(qualifier[0]==='translation'?'':' ')+t;return;}
    const m=t.match(/^\/([\w-]+)(?:=(.*))?$/);
    if(m){qualifier=[m[1],m[2]??''];feature.qualifiers.push(qualifier);}
    else if(qualifier) qualifier[1]+=' '+t;
    else feature.location+=t;
  };
  for(const line of lines(text)) {
    if(line.startsWith('//')){flush();seqid='';aliases=[];inTable=false;continue;}
    if(embl) {
      if(line.startsWith('ID   ')){flush();seqid=line.slice(5).split(/[;\s]/)[0];const sv=line.match(/SV\s+(\d+)/);aliases=sv?[`${seqid}.${sv[1]}`]:[];}
      else if(line.startsWith('AC   ')){const ac=line.slice(5).split(';')[0].trim();if(ac)aliases=[...aliases,ac];}
      else if(line.startsWith('FT   ')) addBody(line.slice(5));
    } else {
      if(line.startsWith('LOCUS')){flush();seqid=line.split(/\s+/)[1]??'';aliases=[];inTable=false;}
      else if(/^(ACCESSION|VERSION)\s/.test(line)){const v=line.split(/\s+/)[1];if(v)aliases=[...aliases,v];}
      else if(line.startsWith('FEATURES')) inTable=true;
      else if(inTable&&/^\S/.test(line)){flush();inTable=false;}
      else if(inTable) addBody(line.slice(5));
    }
  }
  flush();
  return out;
}
export function parseGenBank(text:string,warnings:string[]=[]):AnnotationRecord[] {return parseFlatFile(text,false,warnings);}
export function parseEmbl(text:string,warnings:string[]=[]):AnnotationRecord[] {return parseFlatFile(text,true,warnings);}
/** True when the text is JSON whose entry, or every result or array element, has a features array. */
export function isUniProtJson(text:string):boolean {
  let data:any;try{data=JSON.parse(text.replace(/^﻿/,''));}catch{return false;}
  const entries:any[]=Array.isArray(data)?data:Array.isArray(data?.results)?data.results:[data];
  return entries.length>0&&entries.every(e=>Array.isArray(e?.features));
}
export function parseUniProtJson(text:string,warnings:string[]=[]):AnnotationRecord[] {
  let data:any;try{data=JSON.parse(text);}catch(error){throw new Error(`Invalid UniProt JSON: ${(error as Error).message}`);}
  const entries:any[]=Array.isArray(data)?data:Array.isArray(data?.results)?data.results:[data];
  const out:AnnotationRecord[]=[];
  for(const entry of entries) {
    const accession=entry?.primaryAccession as string|undefined,name=entry?.uniProtkbId as string|undefined,seqid=accession??name;
    if(!seqid||!Array.isArray(entry.features)){warnings.push('UniProt entry skipped: no accession or features list.');continue;}
    for(const f of entry.features) {
      const start=f?.location?.start?.value,end=f?.location?.end?.value;
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start){warnings.push(`UniProt ${seqid} feature ${f?.type??'?'} skipped: no exact start and end.`);continue;}
      out.push({seqid,start,end,kind:String(f.type),label:f.description||String(f.type),metadata:{aliases:name&&name!==seqid?[name]:[],featureId:f.featureId,evidences:f.evidences,accession,entryName:name}});
    }
  }
  return out;
}
const parsers:Record<AnnotationFormat,(text:string,warnings:string[])=>AnnotationRecord[]>={gff3:parseGff3,bed:parseBed,genbank:parseGenBank,embl:parseEmbl,uniprot:parseUniProtJson};
export function importAnnotations(alignment:Alignment,text:string,options:AnnotationImportOptions={}):AnnotationImportResult {
  const warnings:string[]=[],format=!options.format||options.format==='auto'?detectAnnotationFormat(text):options.format;
  if(!parsers[format]) throw new Error(`Unknown annotation format “${format}”.`);
  const fallback=options.rowId===undefined?-1:alignment.rows.findIndex(r=>r.id===options.rowId);
  if(options.rowId!==undefined&&fallback<0) throw new Error(`Unknown sequence “${options.rowId}”.`);
  const byId=new Map(alignment.rows.map((r,i)=>[r.id,i])),byName=new Map<string,number>();
  alignment.rows.forEach((r,i)=>{if(!byName.has(r.name))byName.set(r.name,i);});
  const byToken=new Map<string,number>();
  alignment.rows.forEach((r,i)=>{for(const t of [r.name.split(/\s+/)[0],...r.name.split(/\s+/)[0].split('|')])if(t&&!byToken.has(t))byToken.set(t,i);});
  const columns=new Map<number,Int32Array>(),columnsOf=(row:number):Int32Array=>{
    let map=columns.get(row);
    if(!map){const list:number[]=[];for(let c=0;c<alignment.width;c++)if(alignment.codes[row*alignment.width+c]!==45)list.push(c+1);map=Int32Array.from(list);columns.set(row,map);}
    return map;
  };
  const used=new Set(alignment.annotations.map(a=>a.id));let counter=0;
  const nextId=():string=>{let id:string;do id=`import-${format}-${++counter}`;while(used.has(id));used.add(id);return id;};
  const annotations=parsers[format](text,warnings).map((r):Annotation=>{
    const ids=[r.seqid,...((r.metadata.aliases as string[]|undefined)??[])];
    let row=-1;
    for(const id of ids){const i=byId.get(id);if(i!==undefined){row=i;break;}}
    if(row<0)for(const id of ids){const i=byName.get(id);if(i!==undefined){row=i;break;}}
    if(row<0)for(const id of ids){const i=byToken.get(id);if(i!==undefined){row=i;break;}}
    if(row<0)row=fallback;
    const base={id:nextId(),label:r.label,kind:r.kind,metadata:{...r.metadata,seqid:r.seqid,sourceStart:r.start,sourceEnd:r.end,format}};
    const rowId=row>=0?alignment.rows[row].id:undefined;
    if(options.coordinates==='alignment') {
      if(r.end>alignment.width){warnings.push(`${r.label} (${r.seqid}:${r.start}-${r.end}) is outside the ${alignment.width} alignment columns.`);return {...base,rowId,mapping:'unmapped'};}
      return {...base,rowId,start:r.start,end:r.end,mapping:'mapped'};
    }
    if(row<0){warnings.push(`${r.label}: no sequence matches “${r.seqid}”. Pass rowId to attach it to one row.`);return {...base,mapping:'unmapped'};}
    const map=columnsOf(row);
    if(r.end>map.length){warnings.push(`${r.label} (${r.seqid}:${r.start}-${r.end}) is outside the ${map.length} residues of ${alignment.rows[row].name}.`);return {...base,rowId,mapping:'unmapped'};}
    return {...base,rowId,start:map[r.start-1],end:map[r.end-1],mapping:'mapped'};
  });
  return {annotations,warnings};
}
