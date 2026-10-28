// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {exportAnnotationsGff3,exportAnnotationsTsv,exportAnnotationsJson} from '../src/annotation-export';
import {importAnnotations,isUniProtJson} from '../src/annotation-import';
import {parseAlignment} from '../src/parsers';
import {createAlignment} from '../src/model';
import {createViewer} from '../src/viewer';
import type {Annotation} from '../src/types';
const base=()=>parseAlignment('>a\nA-CGT\n>b one\nATCGT\n>c\nAT-GT',{alphabet:'dna'});
const note=(id:string,rowId:string|undefined,start:number|undefined,end:number|undefined,extra:Partial<Annotation>={}):Annotation=>({id,label:`L ${id}`,kind:'domain',rowId,start,end,mapping:start===undefined?'unmapped':'mapped',...extra});
const withNotes=()=>{const a=base(),[ra,rb,rc]=a.rows.map(r=>r.id);return createAlignment(a.rows,{name:'aln',alphabet:'dna',annotations:[note('x1',ra,3,5),note('x2',rb,2,4,{kind:'variant',consequence:['missense'],disease:true}),note('x3',rc,3,3),note('x4',rb,undefined,undefined),note('x5',undefined,1,2)]});};
it('writes per-row sequence coordinates in GFF3 and skips what has none',()=>{
  const w:string[]=[],lines=exportAnnotationsGff3(withNotes(),{warnings:w}).trim().split('\n');
  expect(lines[0]).toBe('##gff-version 3');
  expect(lines.slice(1).map(l=>l.split('\t')).map(x=>[x[0],x[2],x[3],x[4]])).toEqual([['a','domain','2','4'],['b one','variant','2','4']]);
  expect(w).toHaveLength(3);expect(w.join(' ')).toMatch(/unmapped/);expect(w.join(' ')).toMatch(/no residue/);
});
it('writes alignment columns when asked',()=>{
  const a=withNotes(),f=exportAnnotationsGff3(a,{coordinates:'alignment',seqid:'id',annotations:a.annotations.slice(0,2)}).trim().split('\n').slice(1).map(l=>l.split('\t'));
  expect(f.map(x=>[x[0],x[3],x[4]])).toEqual([[a.rows[0].id,'3','5'],[a.rows[1].id,'2','4']]);
});
it('round-trips GFF3 through importAnnotations',()=>{
  const a=withNotes(),kept=a.annotations.filter(x=>['x1','x2'].includes(x.id));
  const back=importAnnotations(base(),exportAnnotationsGff3(a,{annotations:kept})).annotations;
  expect(back.map(x=>[x.rowId,x.start,x.end,x.mapping,x.label])).toEqual(kept.map(x=>[x.rowId,x.start,x.end,'mapped',x.label]));
  const cols=importAnnotations(base(),exportAnnotationsGff3(a,{coordinates:'alignment',seqid:'id',annotations:kept}),{coordinates:'alignment'}).annotations;
  expect(cols.map(x=>[x.rowId,x.start,x.end])).toEqual(kept.map(x=>[x.rowId,x.start,x.end]));
});
it('TSV lists unmapped annotations with empty coordinates',()=>{
  const rows=exportAnnotationsTsv(withNotes()).replace(/\n$/,'').split('\n').map(l=>l.split('\t'));
  expect(rows[0].slice(6,10)).toEqual(['aln_start','aln_end','seq_start','seq_end']);
  expect(rows).toHaveLength(6);
  expect(rows[1].slice(4,10)).toEqual(['a','mapped','3','5','2','4']);
  expect(rows[3].slice(6,10)).toEqual(['3','3','','']);
  expect(rows[4].slice(5,10)).toEqual(['unmapped','','','','']);
  expect(rows[5].slice(6,10)).toEqual(['1','2','','']);
});
it('JSON has null coordinates for unmapped annotations',()=>{
  const d=JSON.parse(exportAnnotationsJson(withNotes()));
  expect(d.alignment.width).toBe(5);expect(d.annotations).toHaveLength(5);
  expect(d.annotations[0]).toMatchObject({rowName:'a',alignmentStart:3,alignmentEnd:5,sequenceStart:2,sequenceEnd:4});
  expect(d.annotations[3]).toMatchObject({mapping:'unmapped',alignmentStart:null,sequenceStart:null});
  expect(d.annotations[1].consequence).toEqual(['missense']);
});
it('honours the annotation filter',()=>{
  const a=withNotes();
  expect(exportAnnotationsTsv(a,{filter:{types:['variant']}}).trim().split('\n')).toHaveLength(2);
  expect(JSON.parse(exportAnnotationsJson(a,{filter:{hiddenRowIds:[a.rows[0].id,a.rows[1].id]}})).annotations.map((x:any)=>x.id)).toEqual(['x3','x5']);
});
it('detects UniProt JSON by its features array',()=>{
  expect(isUniProtJson('{"features":[]}')).toBe(true);expect(isUniProtJson('{"results":[{"features":[]}]}')).toBe(true);
  expect(isUniProtJson('{"rows":[]}')).toBe(false);expect(isUniProtJson('nope')).toBe(false);expect(isUniProtJson('[]')).toBe(false);
});
beforeAll(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{document.body.replaceChildren();});
it('opens a UniProt JSON file as annotations and rejects other JSON',async()=>{
  const root=document.createElement('div');document.body.append(root);
  const v=createViewer(root,{worker:false});await v.setAlignment(parseAlignment('>P1\nACDEFG\n>P2\nACDEFG'));
  const file=(text:string,name:string)=>Object.assign(new File([text],name),{arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
  await (v as any).openFile(file(JSON.stringify({primaryAccession:'P1',features:[{type:'Domain',description:'K',location:{start:{value:2},end:{value:3}}}]}),'p1.json'));
  expect(v.getAlignment()!.annotations).toHaveLength(1);expect(v.getAlignment()!.annotations[0]).toMatchObject({rowId:expect.any(String),start:2,end:3});
  const errors:Error[]=[];v.on('error',e=>errors.push(e));
  await (v as any).openFile(file('{"selection":null}','state.json'));
  expect(errors[0].message).toMatch(/not UniProt annotations/);expect(v.getAlignment()!.annotations).toHaveLength(1);
  v.destroy();
});
it('round-trips repeated row names by writing the row id as seqid',()=>{
  const a=parseAlignment('>s\nACGT\n>s\nACGT',{alphabet:'dna'}),[r1,r2]=a.rows.map(r=>r.id),b=createAlignment(a.rows,{name:'aln',alphabet:'dna',annotations:[note('d1',r2,2,3)]}),w:string[]=[];
  const text=exportAnnotationsGff3(b,{warnings:w});
  expect(w.join(' ')).toMatch(/used by 2 rows/);
  const back=importAnnotations(b,text).annotations;
  expect(back.map(x=>[x.rowId,x.start,x.end])).toEqual([[r2,2,3]]);expect(r1).not.toBe(r2);
});
it('round-trips row names that start with # or >',()=>{
  const a=parseAlignment('>#x\nACGT\n>y\nACGT',{alphabet:'dna'}),b=createAlignment(a.rows,{name:'aln',alphabet:'dna',annotations:[note('d1',a.rows[0].id,2,3)]});
  const text=exportAnnotationsGff3(b);
  expect(text.split('\n')[1].startsWith('#')).toBe(false);
  expect(importAnnotations(b,text).annotations.map(x=>[x.rowId,x.start,x.end])).toEqual([[a.rows[0].id,2,3]]);
});
it('lists .json in the Open file picker',()=>{
  const host=document.body.appendChild(document.createElement('div')),v=createViewer(host,{worker:false} as any);
  expect(host.querySelector('input.ak-file')!.getAttribute('accept')).toContain('.json');v.destroy();
});
