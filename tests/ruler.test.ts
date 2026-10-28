// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {createAlignment,columnToResidue,residueToColumn,rowOffset} from '../src/model';
import {Renderer} from '../src/renderer';
import {renderInspector} from '../src/inspector';
import {defaultVisibility} from '../src/visibility';
import {parseViewerConfig} from '../src/config';
import {encodeViewLink,decodeViewLink,isViewLink} from '../src/link';
import type {ViewState} from '../src/types';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const viewerFor=async(text:string,options={})=>{const v=createViewer(host(),{worker:false,...options});disposers.push(()=>v.destroy());await v.setAlignment(parseAlignment(text,{alphabet:'dna'}));return v;};
const FASTA='>ref\nA-CG-T\n>other\nATCGAT\n>third\nAT-GAT';
const message=(v:any)=>v.root.querySelector('.ak-message').textContent;
const labels=(a:ReturnType<typeof parseAlignment>,ruler:'alignment'|'reference',reference=0,cw=16)=>{
  const texts:string[]=[],ctx:any=new Proxy({fillText:(t:string)=>texts.push(t)},{get:(t:any,k)=>k in t?t[k]:()=>{},set:(t,k,val)=>{t[k]=val;return true;}});
  const canvas:any={width:0,height:0,style:{},getContext:()=>ctx};
  new Renderer().tracks(canvas,{a,rows:[],reference,x:0,y:0,cw,rh:36,gutter:0,scheme:'soft',mode:'all',dark:false,selection:null,annotations:null as any,logo:false,visibility:{...defaultVisibility,modalFrequency:false,gapFraction:false,consensus:false,reference:false},ruler},400);
  return texts;
};
it('maps columns and residues with a row offset',()=>{
  const a=createAlignment([{name:'r',sequence:'A-CG',metadata:{start:100}},{name:'s',sequence:'ACGT',metadata:{start:0}}]);
  expect(rowOffset(a.rows[0])).toBe(100);expect(rowOffset(a.rows[1])).toBe(1);
  expect([1,2,3,4].map(c=>columnToResidue(a,0,c))).toEqual([100,null,101,102]);
  expect([100,101,102,99,103,1.5].map(n=>residueToColumn(a,0,n))).toEqual([1,3,4,null,null,null]);
});
it('records the Stockholm NAME/START-END offset without renaming rows',()=>{
  const a=parseAlignment('# STOCKHOLM 1.0\nseqA/51-54 AC-G\nseqB/9-4 ACGT\nplain ACGT\nodd/0-4 ACGT\n//');
  expect(a.rows.map(r=>r.name)).toEqual(['seqA/51-54','seqB/9-4','plain','odd/0-4']);
  expect(a.rows.map(r=>rowOffset(r))).toEqual([51,1,1,1]);
  expect(a.rows[0].metadata).toEqual({start:51});expect(a.rows[1].metadata).toBeUndefined();
});
it('labels ruler ticks with reference residue numbers and skips gap columns',()=>{
  const a=parseAlignment('>ref\nA-CGT-ACGTACGTACGTACGT-A\n>o\nAACGTAACGTACGTACGTACGTAA',{alphabet:'dna'});
  expect(labels(a,'alignment')).toEqual(['1','10','20']);
  expect(labels(a,'reference')).toEqual(['1','10','20']);
  const x=createAlignment([{name:'ref',sequence:'-A-CGTACGTACGTACGTACGT',metadata:{start:8}}]);
  expect(labels(x,'reference')).toEqual(['8','10','20']);
  expect(labels(x,'alignment')).toEqual(['1','10','20']);
});
it('numbers reference ticks after leading gap columns',()=>{
  const a=createAlignment([{name:'ref',sequence:'-----ACGTACGTACGTACGTACGT'}]);
  expect(labels(a,'reference')).toEqual(['1','10','20']);
});
it('shows the alignment column and reference residue in the Position tab',()=>{
  const a=createAlignment([{id:'r',name:'ref',sequence:'A-CG',metadata:{start:10}},{id:'s',name:'other',sequence:'ATCG'}]),target=document.createElement('div');
  const base={a,selection:{start:3,end:3,rowId:'s'},scheme:'soft',reference:0,selectedRows:new Set<string>(),annotations:[],annotationFilter:{},unknown:0,excluded:0,tab:'position',page:0,scope:'all'};
  renderInspector(target,base);
  expect(target.textContent).toContain('Column 3');expect(target.textContent).toContain('Reference ref: residue 11');expect(target.textContent).toContain('Sequence position 3');
  renderInspector(target,{...base,selection:{start:2,end:2}});expect(target.textContent).toContain('Reference ref: gap');
});
it('defaults to alignment ruler, switches via option, select and state',async()=>{
  const v:any=await viewerFor(FASTA),el=v.element as HTMLElement;
  expect(v.getState().rulerCoordinates).toBe('alignment');
  v.setOptions({rulerCoordinates:'reference'});expect(v.getState().rulerCoordinates).toBe('reference');
  const select=el.querySelector<HTMLSelectElement>('select[aria-label="Ruler coordinates"]')!;
  expect(select.value).toBe('reference');
  select.value='alignment';select.dispatchEvent(new Event('change',{bubbles:true}));
  expect(v.getState().rulerCoordinates).toBe('alignment');
  expect(()=>v.setOptions({rulerCoordinates:'bogus'})).toThrow(/ruler/);
  await v.setState({...v.getState(),rulerCoordinates:'reference'});expect(v.getViewLink()).toContain('ruler=ref');
  const {rulerCoordinates:_,...old}=v.getState();await v.setState(old as ViewState);expect(v.getState().rulerCoordinates).toBe('alignment');
});
it('hides the Ruler select with the rulerCoordinates visibility key',async()=>{
  const v=await viewerFor(FASTA),select=v.element.querySelector('select[aria-label="Ruler coordinates"]')!;
  expect((select.closest('label') as HTMLElement).hidden).toBe(false);
  v.setOptions({visibility:{rulerCoordinates:false}});expect((select.closest('label') as HTMLElement).hidden).toBe(true);
});
it('goToResidue selects a residue by row ID and reports failures',async()=>{
  const v:any=await viewerFor(FASTA);
  expect(v.goToResidue('seq-1',4)).toBe(true);expect(v.getState().selection).toEqual({start:6,end:6,rowId:'seq-1'});
  expect(v.goToResidue('seq-1',5)).toBe(false);expect(message(v)).toContain('no residue 5');
  expect(v.goToResidue('seq-1',0)).toBe(false);expect(v.goToResidue('seq-1',1.5)).toBe(false);
  expect(v.goToResidue('nope',1)).toBe(false);expect(message(v)).toContain('No sequence with ID nope');
  expect(v.getState().selection).toEqual({start:6,end:6,rowId:'seq-1'});
});
it('goToResidue honors the row offset from Stockholm names',async()=>{
  const v:any=createViewer(host(),{worker:false});disposers.push(()=>v.destroy());
  await v.setAlignment(parseAlignment('# STOCKHOLM 1.0\nx/20-23 A-CG\ny/1-4 ACGT\n//'));
  expect(v.goToResidue('seq-1',21)).toBe(true);expect(v.getState().selection?.start).toBe(3);
  expect(v.goToResidue('seq-1',1)).toBe(false);
});
const goTo=(v:any,text:string)=>{const input=v.element.querySelector('[aria-label="Go to alignment column"]') as HTMLInputElement;input.value=text;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));return input;};
it('Go to accepts a column, a reference residue, and row:residue',async()=>{
  const v:any=await viewerFor(FASTA);
  goTo(v,'4');expect(v.getState().selection).toEqual({start:4,end:4});
  goTo(v,'7');expect(message(v)).toContain('1 to 6');
  goTo(v,'other:5');expect(v.getState().selection).toEqual({start:5,end:5,rowId:'seq-2'});
  goTo(v,'seq-3:3');expect(v.getState().selection).toEqual({start:4,end:4,rowId:'seq-3'});
  goTo(v,'ghost:2');expect(message(v)).toContain('No sequence named ghost');
  goTo(v,'other:9');expect(message(v)).toContain('no residue 9');
  goTo(v,'banana');expect(message(v)).toContain('row:residue');
  v.setOptions({rulerCoordinates:'reference'});
  goTo(v,'3');expect(v.getState().selection).toEqual({start:4,end:4});
  goTo(v,'5');expect(message(v)).toContain('ref has no residue 5');
  goTo(v,'seq-2:3');expect(v.getState().selection).toEqual({start:3,end:3,rowId:'seq-2'});
});
it('Go to input shows reference residue numbers in reference mode',async()=>{
  const v:any=await viewerFor(FASTA,{rulerCoordinates:'reference'}),input=v.element.querySelector('[aria-label="Go to alignment column"]') as HTMLInputElement;
  v.setSelection({start:2,end:2});expect(input.value).toBe('');
  v.setSelection({start:4,end:4});expect(input.value).toBe('3');
});
it('round-trips ruler=ref in links and ignores bad values',()=>{
  const state:ViewState={version:1,alignmentId:'a',referenceId:null,query:'',sort:'input',start:1,rowOffset:0,cellWidth:16,selection:null,colorScheme:'soft',colorMode:'all',statisticsScope:'all',annotationFilter:{}};
  expect(encodeViewLink(state)).not.toContain('ruler');
  const text=encodeViewLink({...state,rulerCoordinates:'reference'});expect(text).toContain('ruler=ref');
  expect(decodeViewLink(text).rulerCoordinates).toBe('reference');expect(isViewLink('ruler=ref')).toBe(true);
  expect(decodeViewLink('ruler=bad')).toEqual({ignored:['ruler']});
});
it('applies the ruler from a view link and resets it when absent',async()=>{
  const v:any=await viewerFor(FASTA);
  await v.applyViewLink('ruler=ref');expect(v.getState().rulerCoordinates).toBe('reference');
  await v.applyViewLink('zoom=16');expect(v.getState().rulerCoordinates).toBe('alignment');
});
it('validates rulerCoordinates in viewer configuration',()=>{
  expect(parseViewerConfig('{"rulerCoordinates":"reference","visibility":{"rulerCoordinates":false}}')).toEqual({rulerCoordinates:'reference',visibility:{rulerCoordinates:false}});
  expect(()=>parseViewerConfig('{"rulerCoordinates":"gene"}')).toThrow(/rulerCoordinates/);
});
