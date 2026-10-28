// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {parseGff3,parseBed,parseGenBank,parseEmbl,parseUniProtJson,importAnnotations,detectAnnotationFormat} from '../src/annotation-import';
import {parseAlignment} from '../src/parsers';
import {createViewer} from '../src/viewer';
const aln=()=>parseAlignment('>a\nA-CGT\n>b\nATCGT\n>c\nAT-GT',{alphabet:'dna'});
const GFF='##gff-version 3\nctg\tsrc\tgene\t2\t4\t.\t+\t.\tID=g1;Name=Alpha%20one\nctg\tsrc\texon\t5\t5\t.\t-\t.\tID=e1\nbad line\n##FASTA\n>x\nACGT\n';
const BED='track name=t\na\t1\t4\tfeat\t0\t+\nb\t0\t5\tblocks\t0\t-\t0\t5\t0\t2\t2,2\t0,3\n';
const GB='LOCUS       a           5 bp    DNA     linear   01-JAN-2000\nACCESSION   X1\nFEATURES             Location/Qualifiers\n     source          1..5\n     CDS             join(1..2,<4..>5)\n                     /gene="geneA"\n                     /translation="MK\n                     LV"\n     misc_feature    complement(3..4)\n                     /note="a long\n                     note"\nORIGIN\n        1 acgtt\n//\n';
const EMBL='ID   X1; SV 1; linear; genomic DNA; STD; UNC; 5 BP.\nAC   Z9;\nFT   source          1..5\nFT   gene            complement(2..4)\nFT                   /product="prod"\nSQ   Sequence 5 BP;\n     acgtt\n//\n';
const UNIPROT=JSON.stringify({primaryAccession:'P1',uniProtkbId:'ENT_HUMAN',features:[{type:'Domain',description:'Kinase',location:{start:{value:1},end:{value:3}}},{type:'Site',location:{start:{value:9},end:{value:9}}},{type:'Region',description:'fuzzy',location:{start:{modifier:'UNKNOWN'},end:{value:2}}}]});
it('parses GFF3 with escaping, skips bad lines and stops at FASTA',()=>{
  const w:string[]=[],r=parseGff3(GFF,w);
  expect(r.map(x=>[x.seqid,x.start,x.end,x.kind,x.label])).toEqual([['ctg',2,4,'gene','Alpha one'],['ctg',5,5,'exon','e1']]);
  expect(w).toHaveLength(1);expect(r[1].metadata).toMatchObject({strand:'-'});
});
it('parses BED3 to BED12 and splits blocks into exons',()=>{
  const r=parseBed(BED);
  expect(r[0]).toMatchObject({seqid:'a',start:2,end:4,kind:'region',label:'feat'});
  expect(r.slice(1).map(x=>[x.kind,x.start,x.end])).toEqual([['exon',1,2],['exon',4,5]]);
  expect(parseBed('x\t0\t3')[0]).toMatchObject({start:1,end:3});
  const w:string[]=[];parseBed('x\t5\t5',w);expect(w).toHaveLength(1);
});
it('parses GenBank feature tables with join, complement and partial markers',()=>{
  const r=parseGenBank(GB);
  expect(r.map(x=>[x.seqid,x.kind,x.start,x.end,x.label])).toEqual([['a','source',1,5,'source'],['a','CDS',1,5,'geneA'],['a','misc_feature',3,4,'a long note']]);
  expect(r[1].metadata).toMatchObject({partial:true,strand:'+',aliases:['X1']});expect(r[1].metadata.qualifiers).not.toHaveProperty('translation');
  expect(r[2].metadata.strand).toBe('-');
});
it('parses EMBL feature tables',()=>{
  const r=parseEmbl(EMBL);
  expect(r.map(x=>[x.seqid,x.kind,x.start,x.end,x.label])).toEqual([['X1','source',1,5,'source'],['X1','gene',2,4,'prod']]);
  expect(r[1].metadata).toMatchObject({strand:'-',aliases:['X1.1','Z9']});
});
it('parses UniProt JSON and warns on inexact positions',()=>{
  const w:string[]=[],r=parseUniProtJson(UNIPROT,w);
  expect(r.map(x=>[x.seqid,x.kind,x.label,x.start,x.end])).toEqual([['P1','Domain','Kinase',1,3],['P1','Site','Site',9,9]]);
  expect(w).toHaveLength(1);expect(()=>parseUniProtJson('{')).toThrow(/Invalid UniProt JSON/);
  expect(parseUniProtJson(JSON.stringify({results:[JSON.parse(UNIPROT)]}))).toHaveLength(2);
});
it('detects formats from content',()=>{
  expect([GFF,BED,GB,EMBL,UNIPROT].map(detectAnnotationFormat)).toEqual(['gff3','bed','genbank','embl','uniprot']);
  expect(detectAnnotationFormat('ctg\tsrc\tgene\t2\t4\t.\t+\t.\tID=g')).toBe('gff3');
  expect(()=>detectAnnotationFormat('hello world')).toThrow(/Unrecognized annotation format/);
});
it('maps sequence coordinates to columns by id, then name, then rowId',()=>{
  const a=aln();
  const r=importAnnotations(a,'a\t1\t4\tf1\nseq-2\t0\t5\tf2\nzz\t0\t2\tf3\n');
  expect(r.annotations.map(x=>[x.rowId,x.start,x.end,x.mapping])).toEqual([['seq-1',3,5,'mapped'],['seq-2',1,5,'mapped'],[undefined,undefined,undefined,'unmapped']]);
  expect(r.warnings).toHaveLength(1);
  const f=importAnnotations(a,'zz\t1\t2\tf3\n',{rowId:'seq-3'});
  expect(f.annotations[0]).toMatchObject({rowId:'seq-3',start:2,end:2,mapping:'mapped'});expect(f.warnings).toEqual([]);
  expect(()=>importAnnotations(a,'zz\t1\t2',{rowId:'nope'})).toThrow(/Unknown sequence/);
  expect(new Set(r.annotations.map(x=>x.id)).size).toBe(3);
});
it('skips gap columns in the mapping and flags out-of-range records',()=>{
  const a=aln(),r=importAnnotations(a,'a\t0\t2\tx\na\t2\t4\ty\na\t3\t5\tz\n');
  expect(r.annotations[0]).toMatchObject({rowId:'seq-1',start:1,end:3});
  expect(r.annotations[1]).toMatchObject({start:4,end:5});
  expect(r.annotations[2]).toMatchObject({mapping:'unmapped',rowId:'seq-1'});expect(r.warnings).toHaveLength(1);
});
it('imports each format and supports alignment coordinates',()=>{
  const a=aln();
  expect(importAnnotations(a,GFF,{rowId:'seq-2'}).annotations.map(x=>[x.start,x.end,x.kind])).toEqual([[2,4,'gene'],[5,5,'exon']]);
  expect(importAnnotations(a,BED).annotations.map(x=>x.kind)).toEqual(['region','exon','exon']);
  expect(importAnnotations(a,GB).annotations).toHaveLength(3);
  expect(importAnnotations(a,EMBL).annotations.map(x=>[x.rowId,x.start,x.end])).toEqual([[undefined,undefined,undefined],[undefined,undefined,undefined]]);
  expect(importAnnotations(a,UNIPROT,{rowId:'seq-1'}).annotations[0]).toMatchObject({kind:'Domain',start:1,end:4});
  const c=importAnnotations(a,'ctg\t1\t3\tw\nctg\t4\t9\tv\n',{coordinates:'alignment',format:'bed',rowId:'seq-1'});
  expect(c.annotations.map(x=>[x.start,x.end,x.mapping])).toEqual([[2,3,'mapped'],[undefined,undefined,'unmapped']]);
  expect(()=>importAnnotations(a,'x',{format:'gff3'}) && importAnnotations(a,'x',{format:'nope' as any})).toThrow(/Unknown annotation format/);
});
beforeAll(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{document.body.replaceChildren();});
const file=(text:string,name:string)=>Object.assign(new File([text],name),{arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
it('adds, imports and removes annotations on a viewer',async()=>{
  const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false});
  expect(()=>viewer.importAnnotations(GFF)).toThrow(/Load an alignment/);
  await viewer.setAlignment(aln());
  const r=viewer.importAnnotations('a\t1\t4\tf1\nq\t0\t2\tf2\n');
  expect(r.annotations).toHaveLength(2);expect(viewer.getAlignment()!.annotations).toHaveLength(2);
  expect((viewer as any).annotationIndex.query('seq-1',1,5)).toHaveLength(1);
  expect(el.querySelector('.ak-message')!.textContent).toMatch(/Imported 2 annotations \(1 mapped\)\. 1 warnings/);
  viewer.addAnnotations([{id:'m',label:'m',start:2,end:3,mapping:'mapped',rowId:'seq-2'}]);
  expect(()=>viewer.addAnnotations([{id:'m',label:'m',mapping:'unmapped'}])).toThrow(/Duplicate/);
  expect(()=>viewer.addAnnotations([{id:'k',label:'k',start:1,end:99,mapping:'mapped'}])).toThrow(/invalid alignment coordinates/);
  expect(()=>viewer.addAnnotations([{id:'k',label:'k',rowId:'nope',mapping:'unmapped'}])).toThrow(/unknown sequence/);
  viewer.removeAnnotations([r.annotations[0].id]);expect(viewer.getAlignment()!.annotations).toHaveLength(2);
  viewer.removeAnnotations();expect(viewer.getAlignment()!.annotations).toHaveLength(0);
  expect((viewer as any).annotationIndex.query('seq-2',1,5)).toHaveLength(0);
  viewer.destroy();
});
it('imports annotations from an opened file instead of replacing the alignment',async()=>{
  const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false});
  await viewer.setAlignment(aln());
  const input=el.querySelector<HTMLInputElement>('.ak-file')!;expect(input.accept).toContain('.gff3');
  await (viewer as any).openFile(file(GFF,'x.gff3'));
  expect(viewer.getAlignment()!.rows).toHaveLength(3);expect(viewer.getAlignment()!.annotations).toHaveLength(2);
  await (viewer as any).openFile(file('>q\nAC\n>r\nAG','new.fa'));
  expect(viewer.getAlignment()!.rows).toHaveLength(2);expect(viewer.getAlignment()!.annotations).toHaveLength(0);
  viewer.destroy();
});
it('matches described FASTA headers by first token and pipe segments',()=>{
  const a=parseAlignment('>P12345 desc here\nACGT\n>sp|Q9XYZ|NAME_HUMAN other\nACGA',{alphabet:'dna'});
  const r=importAnnotations(a,'P12345\t0\t2\tx\nQ9XYZ\t0\t2\ty\nNAME_HUMAN\t0\t2\tz\n');
  expect(r.annotations.map(x=>x.rowId)).toEqual(['seq-1','seq-2','seq-2']);expect(r.warnings).toEqual([]);
});
it('keeps records whose seqid starts with track or browser',()=>{
  expect(parseBed('trackA\t0\t5\ty')).toHaveLength(1);expect(parseBed('browser-x\t0\t5\ty')).toHaveLength(1);
  expect(parseBed('track name=t\na\t0\t2\ty')).toHaveLength(1);expect(detectAnnotationFormat('track_1\t0\t5\ty')).toBe('bed');
});
it('handles all-gap rows, single-row alignments and alignment coordinates with rowId',()=>{
  const a=parseAlignment('>a\n----\n>b\nACGT',{alphabet:'dna'});
  const r=importAnnotations(a,'a\t0\t2\tx\n');expect(r.annotations[0].mapping).toBe('unmapped');expect(r.warnings).toHaveLength(1);
  const s=parseAlignment('>only\nA-CG',{alphabet:'dna'});
  expect(importAnnotations(s,'only\t0\t3\tx\n').annotations[0]).toMatchObject({rowId:'seq-1',start:1,end:4,mapping:'mapped'});
  expect(importAnnotations(a,'q\t2\t3\tx\n',{coordinates:'alignment',rowId:'seq-2',format:'bed'}).annotations[0]).toMatchObject({rowId:'seq-2',start:3,end:3});
});
it('clamps the feature page when annotations are removed',async()=>{
  const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false});
  await viewer.setAlignment(aln());
  viewer.addAnnotations(Array.from({length:100},(_,i)=>({id:`n${i}`,label:`n${i}`,start:1,end:2,mapping:'mapped' as const,rowId:'seq-1'})));
  (viewer as any).featurePage=3;viewer.removeAnnotations(Array.from({length:70},(_,i)=>`n${i}`));
  expect((viewer as any).featurePage).toBe(0);
  viewer.removeAnnotations();expect((viewer as any).featurePage).toBe(0);
  viewer.destroy();
});
