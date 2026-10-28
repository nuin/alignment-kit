// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createAlignment} from '../src/model';
import {parseAlignment} from '../src/parsers';
import {compilePattern,findHits,detectMode} from '../src/search';
import {createViewer} from '../src/viewer';
import {Renderer} from '../src/renderer';
import {AnnotationIndex} from '../src/annotations';
import {renderInspector} from '../src/inspector';
import {parseViewerConfig} from '../src/config';
import {defaultVisibility} from '../src/visibility';
import type {Hit,Alignment} from '../src/types';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const dna=(...rows:string[])=>createAlignment(rows.map((sequence,i)=>({name:`r${i+1}`,sequence})),{alphabet:'dna'});
const protein=(...rows:string[])=>createAlignment(rows.map((sequence,i)=>({name:`p${i+1}`,sequence})),{alphabet:'protein'});
const spans=(a:Alignment,pattern:string,options={})=>findHits(a,pattern,options).hits.map(h=>`${h.row}:${h.start}-${h.end}${h.strand}`);

it('detects the syntax in auto mode',()=>{
  expect(detectMode('/N[^P][ST]/')).toBe('regex');
  expect(detectMode('N-{P}-[ST]-{P}')).toBe('prosite');
  expect(detectMode('<M')).toBe('prosite');
  expect(detectMode('K>')).toBe('prosite');
  expect(detectMode('A-x(2)-G')).toBe('prosite');
  expect(detectMode('x(2)')).toBe('prosite');
  expect(detectMode('ACGTRYN')).toBe('iupac');
});
it('searches IUPAC DNA codes and treats U as T',()=>{
  const a=dna('ACGTAGGT'),fwd={strands:'forward'} as const;
  expect(spans(a,'RGGT',fwd)).toEqual(['0:5-8+']);
  expect(spans(a,'ACNT',fwd)).toEqual(['0:1-4+']);
  expect(spans(a,'ACNNT',fwd)).toEqual([]);
  expect(spans(a,'YGT',fwd)).toEqual(['0:2-4+']);
  expect(spans(a,'AGGU',fwd)).toEqual(['0:5-8+']);
  expect(spans(a,'WSK',fwd)).toEqual(['0:1-3+','0:5-7+']);
  const rna=createAlignment([{name:'x',sequence:'ACGUACGU'}],{alphabet:'rna'});
  expect(spans(rna,'ACGT',fwd)).toEqual(['0:1-4+','0:5-8+']);
  expect(spans(rna,'UACG',fwd)).toEqual(['0:4-7+']);
});
it('searches protein IUPAC codes',()=>{
  const a=protein('MKDNEQILV','MKBXXZJVV');
  expect(spans(a,'KB')).toEqual(['0:2-3+','1:2-3+']);
  expect(spans(a,'KBN')).toEqual(['0:2-4+']);
  expect(spans(a,'KDXEQ')).toEqual(['0:2-6+']);
  expect(spans(a,'EZ')).toEqual(['0:5-6+']);
  expect(spans(a,'QJ')).toEqual(['0:6-7+']);
  expect(spans(a,'X')).toHaveLength(18);
});
it('searches regular expressions',()=>{
  const a=protein('AANGSAANPTA');
  expect(spans(a,'/N[^P][ST]/')).toEqual(['0:3-5+']);
  expect(spans(a,'/a{2}n/')).toEqual(['0:1-3+','0:6-8+']);
  expect(compilePattern('/AC/',{alphabet:'protein'}).flags).toBe('gi');
  expect(()=>compilePattern('/(/',{alphabet:'protein'})).toThrow(/Invalid regular expression/);
  expect(spans(dna('ACGTT'),'/A.G|T{2}/',{strands:'forward'})).toEqual(['0:1-3+','0:4-5+']);
});
it('searches PROSITE patterns including the N-glycosylation site',()=>{
  const a=protein('MNASAGNPSAANVTAMNGTK','MNASAGNPSAANVTAMNGTP');
  expect(spans(a,'N-{P}-[ST]-{P}')).toEqual(['0:2-5+','0:12-15+','0:17-20+','1:2-5+','1:12-15+']);
  expect(spans(protein('AKKCDEFGH'),'K-x(2)-D')).toEqual(['0:2-5+']);
  expect(spans(protein('AKKCDEFGH'),'K-x(1,3)-D')).toEqual(['0:2-5+','0:3-5+']);
  expect(spans(protein('MKAMK'),'<M')).toEqual(['0:1-1+']);
  expect(spans(protein('MKAMK'),'K>')).toEqual(['0:5-5+']);
  expect(spans(protein('MKAMK'),'M-K>')).toEqual(['0:4-5+']);
  expect(spans(protein('MKAMK'),'[M>]')).toEqual(['0:1-1+','0:4-4+']);
  expect(spans(protein('GAGG'),'G-x-G.')).toEqual(['0:1-3+']);
  expect(()=>compilePattern('A-{',{alphabet:'protein'})).toThrow(/PROSITE/);
  expect(()=>compilePattern('A-x(3,1)',{alphabet:'protein'})).toThrow(/repeat/);
});
it('matches an N-glycosylation site across gaps and reports ungapped positions',()=>{
  const [hit]=findHits(protein('MN-AS-T-A'),'N-{P}-[ST]-{P}').hits;
  expect(hit).toEqual({rowId:'seq-1',row:0,start:2,end:7,seqStart:2,seqEnd:5,strand:'+',match:'NAST'});
});
it('reports overlapping hits',()=>{
  expect(spans(dna('AAAA'),'AA',{strands:'forward'})).toEqual(['0:1-2+','0:2-3+','0:3-4+']);
  expect(spans(protein('GGGG'),'/GG/')).toHaveLength(3);
  expect(spans(protein('ABABA'),'ABA')).toEqual(['0:1-3+','0:3-5+']);
});
it('maps hits across gaps to alignment columns',()=>{
  const [hit]=findHits(dna('A-C--G-T'),'ACG',{strands:'forward'}).hits;
  expect(hit).toMatchObject({start:1,end:6,seqStart:1,seqEnd:3,match:'ACG'});
});
it('searches the reverse complement and maps hits back to forward coordinates',()=>{
  const a=dna('TTTCC-GA');
  expect(findHits(a,'TCGG').hits).toEqual([{rowId:'seq-1',row:0,start:4,end:8,seqStart:4,seqEnd:7,strand:'-',match:'TCGG'}]);
  expect(findHits(a,'TCGG',{strands:'forward'}).hits).toEqual([]);
  const rna=createAlignment([{name:'x',sequence:'GGAAUC'}],{alphabet:'rna'});
  expect(findHits(rna,'GAUU').hits).toMatchObject([{start:3,end:6,seqStart:3,seqEnd:6,strand:'-',match:'GAUU'}]);
  expect(findHits(protein('ACGT'),'ACGT').hits.map(h=>h.strand)).toEqual(['+']);
});
it('finds a primer with IUPAC codes on either strand',()=>{
  const a=dna('GGGATGCCGTACGTTT','AAACGTACGGCATCCC');
  expect(findHits(a,'ACGNACGG').hits.map(h=>[h.row,h.start,h.end,h.strand,h.match])).toEqual([[0,7,14,'-','ACGTACGG'],[1,3,10,'+','ACGTACGG']]);
});
it('limits hits to 10,000 and flags truncation',()=>{
  const a=dna('A'.repeat(10050));
  const result=findHits(a,'A',{strands:'forward'});
  expect(result.hits).toHaveLength(10000);expect(result.truncated).toBe(true);
  expect(findHits(a,'A',{strands:'forward',limit:7})).toMatchObject({truncated:true});
  expect(findHits(dna('AAAAAAA'),'A',{strands:'forward',limit:7})).toMatchObject({truncated:false});
  expect(findHits(a,'A',{strands:'forward',limit:999999}).hits).toHaveLength(10000);
});
it('searches only the requested rows, in order',()=>{
  const a=dna('ACGT','ACGT','ACGT');
  expect(findHits(a,'ACG',{strands:'forward',rows:[2,0]}).hits.map(h=>h.row)).toEqual([2,0]);
});
it('rejects empty and unsupported patterns with readable errors',()=>{
  expect(()=>compilePattern('  ',{alphabet:'dna'})).toThrow(/Enter a motif/);
  expect(()=>compilePattern('AC1',{alphabet:'dna'})).toThrow(/Unexpected/);
  expect(()=>compilePattern('A'.repeat(501),{alphabet:'dna'})).toThrow(/limited/);
  expect(()=>compilePattern('AC',{alphabet:'dna',mode:'nope' as any})).toThrow(/Unknown search mode/);
  expect(compilePattern('A.C*',{alphabet:'protein',mode:'literal'}).source).toBe('A\\.C\\*');
});

it('runs search from the viewer, keeps hits by row and emits search events',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment('>a\nA-CGAACG\n>b\nTTACGATT\n>c\nGGGGGGGG',{alphabet:'dna'}));
  const handler=vi.fn();viewer.on('search',handler);
  const result=viewer.search('ACG',{strands:'forward'});
  expect(result.hits.map(h=>[h.rowId,h.start,h.end])).toEqual([['seq-1',1,4],['seq-1',6,8],['seq-2',3,5]]);
  expect(viewer.getSearchHits()).toHaveLength(3);expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({truncated:false}));
  expect([...(viewer as any).searchState.byRow.keys()]).toEqual([0,1]);
  viewer.clearSearch();expect(viewer.getSearchHits()).toEqual([]);expect(handler).toHaveBeenLastCalledWith(null);
  expect(()=>viewer.search('/(/')).toThrow(/regular expression/);
});
it('cycles through hits with Find next and previous and selects them',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment('>a\nA-CGAACG\n>b\nTTACGATT',{alphabet:'dna'}));
  viewer.findMotif('ACG');expect(viewer.getState().selection).toEqual({start:1,end:4,rowId:'seq-1'});
  viewer.findMotif('ACG');expect(viewer.getState().selection).toEqual({start:6,end:8,rowId:'seq-1'});
  viewer.findMotif('ACG');expect(viewer.getState().selection).toEqual({start:3,end:5,rowId:'seq-2'});
  viewer.findMotif('ACG');expect(viewer.getState().selection).toEqual({start:1,end:4,rowId:'seq-1'});
  viewer.findMotif('ACG',-1);expect(viewer.getState().selection).toEqual({start:3,end:5,rowId:'seq-2'});
  viewer.findMotif('');expect(viewer.getSearchHits()).toEqual([]);
  viewer.findMotif('/(/');expect((viewer as any).root.querySelector('.ak-message').textContent).toMatch(/regular expression/);
  viewer.findMotif('GGGGGG');expect((viewer as any).root.querySelector('.ak-message').textContent).toMatch(/No match/);
});
it('re-runs the search over filtered rows when the filter changes',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment('>alpha\nACGT\n>beta\nACGT',{alphabet:'dna'}));
  viewer.search('ACG',{strands:'forward'});expect(viewer.getSearchHits()).toHaveLength(2);
  viewer.setFilter('beta');expect(viewer.getSearchHits().map(h=>h.rowId)).toEqual(['seq-2']);
  viewer.setFilter('');expect(viewer.getSearchHits()).toHaveLength(2);
});
it('drops the search when another alignment loads',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(dna('ACGT'));viewer.search('ACG');
  await viewer.setAlignment(dna('ACGT'));expect(viewer.getSearchHits()).toEqual([]);
  viewer.search('ACG');viewer.clear();expect(viewer.getSearchHits()).toEqual([]);
});
it('jumps to a hit clicked in the Hits tab without leaving the tab',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment('>a\nACGTACGT',{alphabet:'dna'}));
  viewer.search('ACG',{strands:'forward'});(viewer as any).tab='hits';
  const button=document.createElement('button');button.dataset.hit='1';el.querySelector('.ak-inspector-content')!.append(button);button.click();
  expect(viewer.getState().selection).toEqual({start:5,end:7,rowId:'seq-1'});expect((viewer as any).tab).toBe('hits');
});
it('lists the first 200 hits with row, columns, strand and match',async()=>{
  const a=dna('ACGT'.repeat(300));
  const result=findHits(a,'ACGT',{strands:'forward'});
  const target=document.createElement('div');
  const input={a,selection:null,scheme:'soft',reference:0,selectedRows:new Set<string>(),annotations:[],annotationFilter:{},unknown:0,excluded:0,tab:'hits',page:0,scope:'all',hits:result.hits,truncated:false,pattern:'ACGT',hit:1};
  renderInspector(target,input as any);
  expect(target.querySelectorAll('[data-hit]')).toHaveLength(200);
  expect(target.textContent).toContain('300 hits for ACGT');expect(target.textContent).toContain('Showing the first 200 hits');
  const first=target.querySelector('[data-hit="0"]')!.textContent!;
  expect(first).toContain('r1');expect(first).toContain('columns 1–4');expect(first).toContain('forward strand');expect(first).toContain('ACGT');
  expect(target.querySelector('[data-hit="1"]')!.getAttribute('aria-current')).toBe('true');
  renderInspector(target,{...input,hits:[],pattern:'',hit:-1} as any);expect(target.textContent).toContain('PROSITE');
  renderInspector(target,{...input,hits:result.hits.slice(0,1),truncated:true} as any);expect(target.textContent).toContain('1+ hits');
  renderInspector(target,{...input,hits:[{...result.hits[0],match:'<b>'}]} as any);expect(target.querySelector('b')).toBeNull();
});
it('draws hit outlines only for the visible rows',()=>{
  const a=dna('ACGTACGT','ACGTACGT','ACGTACGT');
  const calls:any[][]=[];
  const ctx:any=new Proxy({},{get:(t:any,key:string)=>key in t?t[key]:(...args:any[])=>{calls.push([key,...args]);},set:(t:any,key:string,value:any)=>{t[key]=value;return true;}});
  const spy=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx);disposers.push(()=>spy.mockRestore());
  const hit=(row:number,start:number,end:number,strand:'+'|'-'='+'):Hit=>({rowId:`seq-${row+1}`,row,start,end,seqStart:start,seqEnd:end,strand,match:'x'});
  const hits=new Map([[0,[hit(0,2,4)]],[1,[hit(1,5,6,'-')]],[2,[hit(2,1,2)]]]);
  new Renderer().body(document.createElement('canvas'),{a,rows:[0,1],reference:0,x:0,y:0,cw:10,rh:20,gutter:0,scheme:'soft-nucleotide',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,hits,activeHit:hits.get(0)![0]} as any,100,40);
  const strokes=calls.filter(c=>c[0]==='strokeRect');
  expect(strokes).toEqual([['strokeRect',11,1,28,17],['strokeRect',41,21,18,17]]);
  expect(calls.filter(c=>c[0]==='setLineDash').map(c=>c[1])).toContainEqual([4,3]);
});
it('adds the hitsTab visibility key, on by default and accepted in configuration',()=>{
  expect(defaultVisibility.hitsTab).toBe(true);
  expect(parseViewerConfig({visibility:{hitsTab:false}})).toEqual({visibility:{hitsTab:false}});
  const viewer=createViewer(host(),{worker:false,visibility:{hitsTab:false}});disposers.push(()=>viewer.destroy());
  expect((viewer as any).root.querySelector('[data-tab="hits"]').hidden).toBe(true);
  viewer.setOptions({visibility:{hitsTab:true}});expect((viewer as any).root.querySelector('[data-tab="hits"]').hidden).toBe(false);
});
it('rejects nested repetition that backtracks catastrophically',()=>{
  expect(()=>compilePattern('/(A+)+B/',{alphabet:'dna'})).toThrow(/Nested repetition/);
  expect(()=>compilePattern('/(?:A*B)*/',{alphabet:'dna'})).toThrow(/Nested repetition/);
  expect(()=>compilePattern('/(AC){2,}/',{alphabet:'dna'})).not.toThrow();
  expect(()=>compilePattern('/(AC)+G/',{alphabet:'dna'})).not.toThrow();
});
it('stops scanning a row at the hit cap and reports a palindromic site once',()=>{
  const a=dna('A'.repeat(300000));
  const start=Date.now(),result=findHits(a,'A',{strands:'forward',limit:5});
  expect(result.hits).toHaveLength(5);expect(result.truncated).toBe(true);expect(Date.now()-start).toBeLessThan(500);
  expect(spans(dna('TTACGTTT'),'ACGT')).toEqual(['0:3-6+']);
});
it('ignores a non-finite limit and rejects bad row indices',()=>{
  expect(findHits(dna('A'.repeat(10050)),'A',{strands:'forward',limit:NaN}).hits).toHaveLength(10000);
  expect(()=>findHits(dna('ACGT','ACGT'),'A',{rows:[5]})).toThrow(/Row index 5/);
  expect(()=>findHits(dna('ACGT'),'A',{rows:[0.5]})).toThrow(/Row index/);
  expect(()=>findHits(dna('ACGT'),'A',{rows:[-1]})).toThrow(/Row index/);
});
it('reads lowercase text containing x as IUPAC unless it has PROSITE syntax',()=>{
  expect(detectMode('acx')).toBe('iupac');expect(detectMode('x')).toBe('prosite');expect(detectMode('A-x-G')).toBe('prosite');
  expect(detectMode('x-A')).toBe('prosite');
  expect(spans(protein('MACXG'),'acx')).toEqual(['0:2-4+']);
});
it('keeps the Hits tab closed after a failed search and emits only on a changed hit set',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment('>alpha\nACGT\n>beta\nACGT\n>gamma\nACGT',{alphabet:'dna'}));
  expect(viewer.findMotif('ACG')).toBe(true);expect(viewer.findMotif('ACG')).toBe(false);
  expect(viewer.findMotif('A-x(5,2)-C')).toBe(false);expect(viewer.getSearchHits().length).toBeGreaterThan(0);
  const handler=vi.fn();viewer.on('search',handler);
  viewer.setFilter('a');expect(handler).toHaveBeenCalledTimes(0);
  viewer.setFilter('alp');expect(handler).toHaveBeenCalledTimes(1);
  viewer.setFilter('alph');expect(handler).toHaveBeenCalledTimes(1);
  expect(viewer.getSearchHits().every(h=>h.rowId==='seq-1')).toBe(true);
  viewer.setFilter('');expect(handler).toHaveBeenCalledTimes(2);
});
it('clears the search and the motif box when a new alignment loads',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(dna('ACGT'));const input=el.querySelector<HTMLInputElement>('[aria-label="Find motif"]')!;
  input.value='ACG';viewer.findMotif('ACG');
  const handler=vi.fn();viewer.on('search',handler);
  await viewer.setAlignment(dna('ACGT'));expect(handler).toHaveBeenCalledWith(null);expect(input.value).toBe('');
  input.value='ACG';viewer.findMotif('ACG');viewer.clear();expect(handler).toHaveBeenLastCalledWith(null);expect(handler).toHaveBeenCalledTimes(3);expect(input.value).toBe('');
});
