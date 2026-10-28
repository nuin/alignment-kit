// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {compilePattern} from '../src/search';
import {exportPhylip} from '../src/export';
import {mountViewer} from '../src/integration';
import {trackLayout,defaultVisibility} from '../src/visibility';
import {columnToResidue,residueToColumn,rowOffset} from '../src/index';
import type {SearchResult} from '../src/types';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const dna=(...rows:string[])=>createAlignment(rows.map((sequence,i)=>({id:`r${i+1}`,name:`r${i+1}`,sequence})),{alphabet:'dna'});
const viewerFor=async(a=dna('AACGTT','ACGTAC','GGGCCC')):Promise<any>=>{const v=createViewer(host(),{worker:false});disposers.push(()=>v.destroy());await v.setAlignment(a);return v;};

it('reruns a search when only the strands or mode change',async()=>{
  const v=await viewerFor(dna('AAACCC'));
  expect((await v.search('GGG',{strands:'forward'})).hits).toHaveLength(0);
  expect((await v.search('GGG',{strands:'both'})).hits.map((h:any)=>h.strand)).toEqual(['-']);
  expect((await v.search('A.A',{mode:'literal'})).hits).toHaveLength(0);
  expect((await v.search('A.A',{mode:'regex'})).hits.length).toBeGreaterThan(0);
});
it('rejects a repeated group that contains alternatives in regex mode',()=>{
  for(const p of ['/(A|AA)+C/','/(.|.)+X/','/(?:A|C)*G/','/((A|C)G)+/','/(A|C){2,}/'])expect(()=>compilePattern(p,{alphabet:'dna'}),p).toThrow(/alternatives/);
  for(const p of ['/(A|C)G/','/[A|C]+G/','/A\\|+C/','/(AC)+G/','/(A|C)?G/'])expect(()=>compilePattern(p,{alphabet:'dna'}),p).not.toThrow();
});
it('emits a copy of the search hits',async()=>{
  const v=await viewerFor();let seen:SearchResult|null=null;v.on('search',(r:SearchResult|null)=>{seen=r;});
  await v.search('ACG');seen!.hits.length=0;
  expect(v.getSearchHits().length).toBeGreaterThan(0);expect((v as any).searchState.result.hits.length).toBeGreaterThan(0);
});
it('selects the top row on ArrowUp when no row is selected',async()=>{
  // r1 is the pinned reference, so r2 is the first grid row.
  const v=await viewerFor(),scroll=v.scroll as HTMLElement;
  scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  expect(v.getState().selection?.rowId).toBe('r2');
  scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  expect(v.getState().selection?.rowId).toBe('r2');
  scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  expect(v.getState().selection?.rowId).toBe('r3');
});
it('adds the track container scroll offset to track clicks',async()=>{
  const v=await viewerFor(),tracks=v.root.querySelector('.ak-tracks') as HTMLElement,ref=trackLayout({...defaultVisibility},36,[],'dna').offsets.reference!;
  expect(ref).toBeGreaterThan(60);
  tracks.scrollTop=60;tracks.dispatchEvent(new MouseEvent('click',{clientX:v.gutter+20,clientY:ref-60+5,bubbles:true}));
  expect(v.getState().selection).toEqual({start:2,end:2,rowId:'r1'});
});
it('pads relaxed PHYLIP names once for large row counts',()=>{
  const n=150000,a=createAlignment(Array.from({length:n},(_,i)=>({name:`s${i}`,sequence:'A'})),{alphabet:'dna'}),started=Date.now();
  const lines=exportPhylip(a).split('\n');
  expect(lines[1]).toBe('s0'.padEnd(String(n-1).length+3)+'A');expect(Date.now()-started).toBeLessThan(5000);
});
it('forwards search events through the framework controller',async()=>{
  const results:(SearchResult|null)[]=[],c=mountViewer(host(),{options:{worker:false},onSearch:r=>results.push(r)});disposers.push(()=>c.destroy());
  await c.viewer.setAlignment(dna('ACGT'));await c.viewer.search('CG');c.viewer.clearSearch();
  expect(results.map(r=>r?.hits.length??null)).toEqual([1,null]);
});
it('exports the residue numbering helpers from the package entry',()=>{
  const a=createAlignment([{name:'x',sequence:'-ACG',metadata:{start:10}}],{alphabet:'dna'});
  expect(rowOffset(a.rows[0])).toBe(10);expect(columnToResidue(a,0,2)).toBe(10);expect(residueToColumn(a,0,12)).toBe(4);
});
