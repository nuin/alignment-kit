// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {calculateStats} from '../src/analysis';
import {colorSchemes,getColorScheme,dynamicColor,residueColor} from '../src/colors';
import {encodeViewLink,decodeViewLink} from '../src/link';
import {parseViewerConfig} from '../src/config';
import {defaultVisibility} from '../src/visibility';
import {Renderer,type RenderView} from '../src/renderer';
import {AnnotationIndex} from '../src/annotations';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const data=()=>createAlignment([
  {id:'a',name:'Zeta',sequence:'ACGT'},{id:'b',name:'Alpha',sequence:'AG-T'},{id:'c',name:'Mid',sequence:'A--T'},
  {id:'d',name:'Beta',sequence:'TCGT'},{id:'e',name:'Gamma',sequence:'ACGA'},
],{alphabet:'dna',annotations:[{id:'f1',rowId:'d',label:'x',start:1,end:2,mapping:'mapped'},{id:'f2',rowId:'d',label:'y',start:2,end:3,mapping:'mapped'},{id:'f3',rowId:'a',label:'z',start:1,end:1,mapping:'mapped'},{id:'g',label:'global',start:1,end:1,mapping:'mapped'}]});
const make=async(options={})=>{const viewer=createViewer(host(),{worker:false,visibility:{reference:false},...options});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());return viewer;};
const shown=(viewer:any)=>(viewer.rows as number[]).map(i=>viewer.a.rows[i].id).join(',');
const rowsOf=(sequences:string[],alphabet:'dna'|'protein')=>createAlignment(sequences.map((sequence,i)=>({id:`r${i}`,name:`r${i}`,sequence})),{alphabet});
const NEUTRAL='#e9edf2';

it('shades percent identity by the fraction of rows sharing the residue and honors the threshold',()=>{
  const stats=calculateStats(rowsOf(['AAAA','AAAC','AACC','A-CC'],'dna')),scheme=getColorScheme('percent-identity');
  expect(dynamicColor(scheme,'A',stats,0,0,0)).toBe(residueColor('A',scheme,1));
  expect(dynamicColor(scheme,'C',stats,3,0,0)).toBe(residueColor('C',scheme,0.75));
  expect(dynamicColor(scheme,'A',stats,3,0,0)).toBe(residueColor('A',scheme,0.25));
  expect(dynamicColor(scheme,'A',stats,3,0.5,0)).toBe(NEUTRAL);
  expect(dynamicColor(scheme,'C',stats,3,0.75,0)).toBe(residueColor('C',scheme,0.75));
  expect(dynamicColor(scheme,'-',stats,1,0,0)).toBe('#f1f4f7');
  expect(dynamicColor(scheme,'A',undefined,0,0,0)).toBe('#edf0f4');
});
it('applies the color threshold to the conservation scheme',()=>{
  const stats=calculateStats(rowsOf(['AA','AC','AC','GC'],'dna')),scheme=getColorScheme('conservation');
  expect(dynamicColor(scheme,'A',stats,0,0.75,0)).toBe(residueColor('A',scheme,0.75));
  expect(dynamicColor(scheme,'A',stats,0,0.8,0)).toBe(NEUTRAL);
});
it('colors residues with a positive BLOSUM62 score to the consensus',()=>{
  const stats=calculateStats(rowsOf(['LA','LA','IA','WA'],'protein')),scheme=getColorScheme('blosum62'),blue=residueColor('L',scheme);
  expect(dynamicColor(scheme,'L',stats,0,0,0)).toBe(blue);expect(dynamicColor(scheme,'I',stats,0,0,0)).toBe(blue);
  expect(dynamicColor(scheme,'W',stats,0,0,0)).toBe(NEUTRAL);
  expect(dynamicColor(scheme,'L',stats,0,0,0.8)).toBe(NEUTRAL);
  const tied=calculateStats(rowsOf(['LA','WA'],'protein'));
  expect(dynamicColor(scheme,'L',tied,0,0,0)).toBe(NEUTRAL);expect(dynamicColor(scheme,'-',stats,0,0,0)).toBe('#f1f4f7');
});
it('limits the new schemes by alphabet',()=>{
  expect(colorSchemes('protein').map(s=>s.id)).toEqual(expect.arrayContaining(['percent-identity','blosum62']));
  const dna=colorSchemes('dna').map(s=>s.id);expect(dna).toContain('percent-identity');expect(dna).not.toContain('blosum62');
});
it('draws uncolored cells below the color threshold',()=>{
  const a=rowsOf(['ACGT','ACGA','A-GT'],'dna'),fills:string[]=[];
  const ctx=new Proxy({},{get:(_,k)=>()=>{},set:(_,k,value)=>{if(k==='fillStyle')fills.push(String(value));return true;}});
  const spy=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  const draw=(colorThreshold:number)=>{
    fills.length=0;
    const v:RenderView={a,stats:calculateStats(a),rows:[1],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'percent-identity',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,colorThreshold};
    new Renderer().body(document.createElement('canvas'),v,64,22);return fills.filter(f=>f===NEUTRAL).length;
  };
  const none=draw(0),some=draw(0.9);spy.mockRestore();
  expect(none).toBe(0);expect(some).toBe(2);
});

it('sorts by gaps, length, residue at a column and annotation count',async()=>{
  const viewer=await make();
  await viewer.setSort('gaps');expect(shown(viewer)).toBe('a,d,e,b,c');expect(viewer.getState().sort).toBe('gaps');
  await viewer.setSort('length');expect(shown(viewer)).toBe('a,d,e,b,c');
  await viewer.setSort('annotations');expect(shown(viewer)).toBe('d,a,b,c,e');
  await expect(viewer.setSort('residue')).rejects.toThrow(/Select a column/);
  await viewer.setSort('residue',4);expect(shown(viewer)).toBe('e,a,b,c,d');expect(viewer.getState()).toMatchObject({sort:'residue',sortColumn:4});
  viewer.setSelection({start:3,end:3});await viewer.setSort('residue');expect(shown(viewer)).toBe('a,d,e,b,c');expect(viewer.getState().sortColumn).toBe(3);
  await expect(viewer.setSort('residue',9)).rejects.toThrow(/Select a column/);
  await viewer.setSort('input');expect(viewer.getState().sortColumn).toBeUndefined();
});
it('orders rows from a pasted name list',async()=>{
  const viewer=await make();
  expect(viewer.setRowOrderFromNames(['Gamma','e-missing','Alpha','c'])).toEqual(['e-missing']);
  expect(shown(viewer)).toBe('e,b,c,a,d');expect(viewer.getState()).toMatchObject({sort:'manual',manualOrder:['e','b','c','a','d']});
  expect(viewer.setRowOrderFromNames([' Mid ','Mid','',' '])).toEqual([]);expect(shown(viewer)).toBe('c,e,b,a,d');
  expect(()=>viewer.setRowOrderFromNames([1 as any])).toThrow(/strings/);
});
it('filters rows by coverage and by identity to the reference',async()=>{
  const viewer=await make();
  viewer.setOptions({minCoverage:60});expect(shown(viewer)).toBe('a,b,d,e');
  viewer.setOptions({minCoverage:0,minIdentity:70});await vi.waitFor(()=>expect(shown(viewer)).toBe('a,c,d,e'));
  viewer.setOptions({minIdentity:100});expect(shown(viewer)).toBe('a,c');
  viewer.setReference('d');await vi.waitFor(()=>expect(shown(viewer)).toBe('d'));
  viewer.setOptions({minIdentity:0,minCoverage:0});expect(shown(viewer)).toBe('a,b,c,d,e');
  expect(viewer.getState()).toMatchObject({minIdentity:0,minCoverage:0});
});
it('keeps filtered statistics in step with the filters',async()=>{
  const viewer=await make({statisticsScope:'filtered'});await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(5));
  viewer.setOptions({minCoverage:60});await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(4));
  expect((viewer as any).filteredRows).toHaveLength(4);
});
it('round-trips thresholds, filters and the residue sort through state and links',async()=>{
  const viewer=await make({consensusThreshold:0.4,colorThreshold:0.3,minCoverage:60});
  await viewer.setSort('residue',4);
  const state=viewer.getState();expect(state).toMatchObject({consensusThreshold:0.4,colorThreshold:0.3,minCoverage:60,minIdentity:0,sort:'residue',sortColumn:4});
  const other=await make();await other.setState(state);
  expect(other.getState()).toMatchObject({consensusThreshold:0.4,colorThreshold:0.3,minCoverage:60,sort:'residue',sortColumn:4});expect(shown(other)).toBe(shown(viewer));
  const link=viewer.getViewLink();expect(link).toContain('sort=residue');expect(link).toContain('scol=4');expect(link).toContain('mincov=60');
  expect(decodeViewLink(link)).toMatchObject({sort:'residue',sortColumn:4,minCoverage:60});
  const fresh=await make();expect(await fresh.applyViewLink(link)).toEqual([]);expect(fresh.getState()).toMatchObject({sort:'residue',sortColumn:4,minCoverage:60});
  expect(await fresh.applyViewLink('sort=gaps')).toEqual([]);expect(fresh.getState()).toMatchObject({sort:'gaps',minCoverage:0});
  expect(await fresh.applyViewLink('sort=residue')).toContain('sort');expect(fresh.getState().sort).toBe('input');
  expect(decodeViewLink('minid=150&mincov=x').ignored).toEqual(['minid','mincov']);
  expect(encodeViewLink({...state,minIdentity:80,sort:'annotations',sortColumn:undefined})).toContain('minid=80');
  expect(decodeViewLink('sort=annotations')).toEqual({sort:'annotations'});
});
it('drives the thresholds and filters from the tools row',async()=>{
  const viewer=await make(),root=viewer.element;
  const input=(label:string)=>root.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  const consensus=input('Consensus threshold');consensus.value='55';consensus.dispatchEvent(new Event('input',{bubbles:true}));
  expect(viewer.getState().consensusThreshold).toBeCloseTo(0.55);expect(consensus.nextElementSibling!.textContent).toBe('55%');
  const color=input('Color threshold');expect(color.disabled).toBe(true);
  viewer.setOptions({colorScheme:'conservation'});expect(color.disabled).toBe(false);
  color.value='40';color.dispatchEvent(new Event('input',{bubbles:true}));expect(viewer.getState().colorThreshold).toBeCloseTo(0.4);
  const coverage=input('Minimum coverage');coverage.value='60';coverage.dispatchEvent(new Event('change',{bubbles:true}));expect(shown(viewer)).toBe('a,b,d,e');
  coverage.value='';coverage.dispatchEvent(new Event('change',{bubbles:true}));expect(viewer.getState().minCoverage).toBe(0);
  const order=root.querySelector<HTMLSelectElement>('[aria-label="Sequence order"]')!;
  expect([...order.options].map(o=>o.value)).toEqual(expect.arrayContaining(['gaps','length','residue','annotations']));
  order.value='gaps';order.dispatchEvent(new Event('change',{bubbles:true}));await vi.waitFor(()=>expect(viewer.getState().sort).toBe('gaps'));
  order.value='residue';order.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(order.value).toBe('gaps'));expect(root.querySelector('.ak-message')!.textContent).toMatch(/Select a column/);
});
it('hides the new controls with their visibility keys',async()=>{
  const viewer=await make({visibility:{reference:false,consensusThreshold:false,colorThreshold:false,minIdentity:false,minCoverage:false}}),root=viewer.element;
  for(const label of ['Consensus threshold','Color threshold','Minimum identity to reference','Minimum coverage'])expect(root.querySelector(`[aria-label="${label}"]`)!.closest('label')!.hidden).toBe(true);
  viewer.setOptions({visibility:{minCoverage:true}});expect(root.querySelector('[aria-label="Minimum coverage"]')!.closest('label')!.hidden).toBe(false);
});
it('validates the new options in config and keeps the schema in step',()=>{
  expect(parseViewerConfig({colorThreshold:0.5,minIdentity:80,minCoverage:50,visibility:{minIdentity:false}})).toEqual({colorThreshold:0.5,minIdentity:80,minCoverage:50,visibility:{minIdentity:false}});
  expect(()=>parseViewerConfig({minIdentity:101})).toThrow(/minIdentity/);expect(()=>parseViewerConfig({colorThreshold:2})).toThrow(/colorThreshold/);
  const schema=JSON.parse(readFileSync('config/viewer-config.schema.json','utf8'));
  expect(schema.properties.colorThreshold).toMatchObject({type:'number',minimum:0,maximum:1});
  expect(schema.properties.minCoverage).toMatchObject({type:'number',minimum:0,maximum:100});
  expect(Object.keys(schema.properties.visibility.properties).sort()).toEqual(Object.keys(defaultVisibility).sort());
});
