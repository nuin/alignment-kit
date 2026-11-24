import {it,expect} from 'vitest';
import {gzipSync} from 'node:zlib';
import {parseAlignment,readAlignmentInput} from '../src/parsers';
import {createAlignment} from '../src/model';
import {exportFasta,exportClustal,exportStockholm,exportPhylip,exportNexus} from '../src/export';
import type {Alignment,ParseOptions} from '../src/types';
// Seeded generators: a 32-bit LCG (Numerical Recipes constants), so every run sees the same inputs.
const lcg=(seed:number)=>{let s=seed>>>0;const next=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32,int=(n:number)=>Math.floor(next()*n);return {next,int,pick:<T>(list:ArrayLike<T>):T=>list[int(list.length)]};};
type Rng=ReturnType<typeof lcg>;
const FORMATS:ParseOptions['format'][]=[undefined,'fasta','stockholm','clustal','phylip','nexus','msf','pir'];
const POOL=[...'>>##;;//==**--..~~??  \t\n\n\n\r\'"[]{}()0123456789ACGTUNacgtnXMKLWxz|:,!_','﻿','é',' ','\u{1F9EC}','\0'];
const LINES=['# STOCKHOLM 1.0','//','#=GF ID fam','#=GF ZZ x','#=GS a DE','#=GS a DE text','#=GR a SS HHHH','#=GC SS_cons ....','#=XX odd','# note','CLUSTAL W (1.83) multiple sequence alignment','MUSCLE (3.8)','     ** *','>a','>a desc','>b','>','>P1;a','>P1;','>DL;b','description','ACGT','AC-T*','acgt','AC~?','MKV1','ACGTACGT','a ACGT','b AC-T','a ACGT 4','c MKVL','a          ACGT','#NEXUS','begin data;','BEGIN CHARACTERS;','dimensions ntax=2 nchar=4;','format datatype=dna gap=- missing=? matchchar=. interleave;','format datatype=protein interleave=yes;','matrix',';','end;',"'a b' ACGT",'[comment]','2 4','1 4','2 8 I','0 0','!!AA_MULTIPLE_ALIGNMENT 1.0','!!NA_MULTIPLE_ALIGNMENT 1.0',' x.msf  MSF: 4  Type: P  Check: 1  ..',' Name: a  Len: 4  Check: 1  Weight: 1.0',' Name: b  Len: 4  Check: 1  Weight: 1.0','a  AC.T','b  A~~T','1 4','','',' '];
const noise=(r:Rng):string=>Array.from({length:r.int(200)},()=>r.pick(POOL)).join('');
const bytes=(r:Rng):string=>new TextDecoder().decode(Uint8Array.from({length:r.int(300)},()=>r.int(256)));
const lines=(r:Rng):string=>Array.from({length:1+r.int(14)},()=>r.pick(LINES)).join(r.next()<0.1?'\r\n':'\n');
const mutate=(r:Rng,text:string):string=>{
  let out=text;
  for(let k=1+r.int(4);k>0;k--){
    const i=r.int(out.length+1),j=Math.min(out.length,i+r.int(8)),op=r.int(5);
    if(op===0)out=out.slice(0,i)+out.slice(j);
    else if(op===1)out=out.slice(0,i)+r.pick(POOL)+out.slice(i);
    else if(op===2)out=out.slice(0,i)+out.slice(i,j)+out.slice(i);
    else if(op===3)out=out.slice(0,i);
    else{const rows=out.split('\n'),x=r.int(rows.length),y=r.int(rows.length);[rows[x],rows[y]]=[rows[y],rows[x]];out=rows.join('\n');}
  }
  return out;
};
const NAME='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.|';
function sample(r:Rng):Alignment {
  const letters=r.next()<0.5?(r.next()<0.5?'ACGT':'ACGU')+(r.next()<0.3?'acgtnN':''):'ACDEFGHIKLMNPQRSTVWYacdxX*',gap=r.next()<0.7?'-':'.',gaps=r.next()*0.5;
  const n=1+r.int(8),width=1+r.int(150),names=new Set<string>();
  while(names.size<n)names.add('s'+Array.from({length:r.int(12)},()=>r.pick(NAME)).join(''));
  return createAlignment([...names].map(name=>({name,sequence:Array.from({length:width},()=>r.next()<gaps?gap:r.pick(letters)).join('')})));
}
/** What every successful parse must satisfy. */
function sound(a:Alignment,label:string):void {
  expect(a.rows.length,label).toBeGreaterThan(0);expect(a.width,label).toBeGreaterThan(0);expect(a.codes.length,label).toBe(a.rows.length*a.width);
  expect(a.codes.every(c=>(c>=65&&c<=90)||c===42||c===45),label).toBe(true);
  expect(new Set(a.rows.map(row=>row.id)).size,label).toBe(a.rows.length);expect(a.rows.every(row=>row.sequence.length===a.width&&row.name.length>0),label).toBe(true);
  expect(['dna','rna','protein'],label).toContain(a.alphabet);
  for(const w of a.metadata.warnings??[]){expect(typeof w.message,label).toBe('string');if(w.line!==undefined)expect(Number.isInteger(w.line)&&w.line>=1,label).toBe(true);}
}
/** Parse with every format setting; a failure must be an Error with a message, a success must be sound. Returns the number of successes. */
function attempt(text:string,label:string):number {
  let parsed=0;
  for(const format of FORMATS)for(const padShort of [false,true]){
    let a:Alignment;
    try{a=parseAlignment(text,{format,padShort});}catch(error){expect(error,label).toBeInstanceOf(Error);expect((error as Error).message.length,label).toBeGreaterThan(0);continue;}
    sound(a,`${label} as ${format??'auto'}`);parsed++;
  }
  return parsed;
}
const show=(text:string):string=>JSON.stringify(text.slice(0,300));
it('fails only with an Error and returns a sound alignment for 300 random strings and 300 random byte runs',()=>{
  const r=lcg(20250101);
  for(let i=0;i<300;i++){const text=noise(r);attempt(text,`noise ${i} ${show(text)}`);}
  for(let i=0;i<300;i++){const text=bytes(r);attempt(text,`bytes ${i} ${show(text)}`);}
},60000);
it('fails only with an Error and returns a sound alignment for 600 texts built from format lines',()=>{
  const r=lcg(7);let parsed=0;
  for(let i=0;i<600;i++){const text=lines(r);parsed+=attempt(text,`lines ${i} ${show(text)}`);}
  expect(parsed).toBeGreaterThan(100);
},60000);
const writers:[string,(a:Alignment)=>string][]=[['fasta',a=>exportFasta(a)],['clustal',a=>exportClustal(a)],['stockholm',a=>exportStockholm(a)],['phylip',a=>exportPhylip(a,{},{variant:'relaxed'})],['nexus',a=>exportNexus(a)]];
it('reads back what the FASTA, CLUSTAL, Stockholm, relaxed PHYLIP and NEXUS writers produce for 200 random alignments',()=>{
  const r=lcg(42);
  for(let i=0;i<200;i++){
    const a=sample(r);
    for(const [format,write] of writers){
      const text=write(a),label=`alignment ${i} as ${format} ${show(text)}`,b=parseAlignment(text);
      expect(b.metadata.format,label).toBe(format);expect(b.rows.map(row=>row.name),label).toEqual(a.rows.map(row=>row.name));
      expect(b.width,label).toBe(a.width);expect(b.alphabet,label).toBe(a.alphabet);expect(Buffer.from(b.codes).equals(Buffer.from(a.codes)),label).toBe(true);
      expect(b.metadata.warnings,label).toBeUndefined();
    }
  }
},60000);
it('survives 400 mutations of written files',()=>{
  const r=lcg(99);
  for(let i=0;i<400;i++){const [format,write]=r.pick(writers),text=mutate(r,write(sample(r)));attempt(text,`mutated ${format} ${i} ${show(text)}`);}
},60000);
it('finishes long repetitive inputs that stress the format regexes',()=>{
  const n=5000,cases=['MSF: 1 '.repeat(n),' '.repeat(n)+'x','>'+'a;'.repeat(n),"#NEXUS\nbegin data;\nmatrix\n"+"'".repeat(n),'#NEXUS\n'+'['.repeat(n),'# STOCKHOLM 1.0\n'+'#=GS '+' '.repeat(n)+'\n//','CLUSTAL\n\n'+' *'.repeat(n)+'x\n','1 1\n'+'a '.repeat(n),'>P1;a\n\n'+'*'.repeat(n),'a'+' '.repeat(n)+'1'+' '.repeat(n)+'x'];
  const started=Date.now();
  for(const [i,text] of cases.entries())attempt(text,`long ${i}`);
  expect(Date.now()-started).toBeLessThan(20000);
},60000);
it('decodes gzip and plain bytes, and rejects damaged gzip or invalid UTF-8 with an Error',async()=>{
  const r=lcg(5);
  for(let i=0;i<20;i++){
    const text=exportFasta(sample(r)),packed=gzipSync(text),plain=new TextEncoder().encode(text);
    expect(await readAlignmentInput(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength) as ArrayBuffer)).toBe(text);
    expect(await readAlignmentInput(new Blob([plain]))).toBe(text);expect(await readAlignmentInput(text)).toBe(text);
    const cut=Uint8Array.from(packed.subarray(0,10+r.int(Math.max(1,packed.length-11))));
    await expect(readAlignmentInput(cut.buffer),`cut ${i}`).rejects.toBeInstanceOf(Error);
    const junk=Uint8Array.from({length:2+r.int(60)},(_,k)=>k===0?31:k===1?139:r.int(256));
    await expect(readAlignmentInput(junk.buffer),`junk ${i}`).rejects.toBeInstanceOf(Error);
  }
  await expect(readAlignmentInput(Uint8Array.of(62,97,10,0xff,0xfe).buffer)).rejects.toBeInstanceOf(Error);
});
