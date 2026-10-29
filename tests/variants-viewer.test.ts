// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {trackLayout,defaultVisibility} from '../src/visibility';
import {parseViewerConfig} from '../src/config';
import type {ViewerOptions} from '../src/types';
import type {VariantInput} from '../src/variants';
import {renderPanel} from '../src/viewer/panel';
import {syncVariantNav} from '../src/viewer/variants';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const alignment=()=>createAlignment([{id:'a',name:'Alpha',sequence:'MKLAVRST'},{id:'b',name:'Beta',sequence:'MKLAVKST'},{id:'c',name:'Gamma',sequence:'MRL-VRST'}],{alphabet:'protein'});
const make=async(options:ViewerOptions={})=>{
  const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false,...options});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(alignment());return {el,viewer};
};
const variants:VariantInput[]=[{rowId:'a',hgvs:'p.Val5Gly'},{rowId:'c',hgvs:'p.Arg2Ter'},{rowId:'b',hgvs:'p.Lys2Glu'},{rowId:'a',position:2,end:3,type:'deletion'}];
const height=(el:HTMLElement)=>parseFloat(el.querySelector<HTMLElement>('.ak-tracks')!.style.height);
const nav=(el:HTMLElement)=>el.querySelector<HTMLElement>('.ak-variant-nav')!;
const label=(el:HTMLElement)=>el.querySelector<HTMLElement>('.ak-variant-label')!;

it('adds the variant track above the reference only while a mapped variant passes the filter',async()=>{
  const {el,viewer}=await make(),base=height(el);
  expect(label(el).hidden).toBe(true);
  const {annotations,warnings}=viewer.addVariants(variants);
  expect(warnings).toEqual([]);expect(annotations).toHaveLength(4);
  // Column 2 holds three variants and the deletion spans 2-3: three lanes.
  expect(height(el)).toBe(base+3*12+6);expect(label(el).hidden).toBe(false);
  const layout=trackLayout(viewer.getVisibility(),36,[],'protein',3);
  expect(layout.offsets.variants).toBe(layout.offsets.reference!-42);
  viewer.setOptions({visibility:{variantTrack:false}});expect(height(el)).toBe(base);expect(label(el).hidden).toBe(true);
  viewer.setOptions({visibility:{variantTrack:true}});expect(height(el)).toBe(base+42);
  viewer.setAnnotationFilter({types:['domain']});expect(height(el)).toBe(base);
  viewer.setAnnotationFilter({});viewer.hideRows(['b','c']);expect(height(el)).toBe(base+12+6);
  viewer.setAnnotationFilter({hiddenRowIds:['a']});expect(height(el)).toBe(base);
  expect(el.querySelector('.ak-message')!.textContent).toMatch(/Added 4 variants \(4 mapped\)/);
});

it('caps the track at eight lanes and counts the rest in the label',async()=>{
  const {el,viewer}=await make();const base=height(el);
  viewer.addVariants(Array.from({length:11},(_,i)=>({rowId:'a',position:3,label:`v${i}`})));
  expect(height(el)).toBe(base+8*12+6);expect(label(el).textContent).toBe('Variants +3');
});

it('shows the navigation buttons with a counter only when there are variants',async()=>{
  const {el,viewer}=await make();
  expect(nav(el).hidden).toBe(true);expect(viewer.nextVariant()).toBeNull();
  viewer.addVariants(variants);expect(nav(el).hidden).toBe(false);expect(nav(el).querySelector('output')!.textContent).toBe('– / 4');
  el.querySelector<HTMLButtonElement>('[aria-label="Next variant"]')!.click();await Promise.resolve();syncVariantNav(viewer as any);
  expect(viewer.getState().selection).toEqual({start:2,end:3,rowId:'a'});expect(nav(el).querySelector('output')!.textContent).toBe('1 / 4');
  el.querySelector<HTMLButtonElement>('[aria-label="Previous variant"]')!.click();await Promise.resolve();syncVariantNav(viewer as any);
  expect(viewer.getState().selection).toEqual({start:5,end:5,rowId:'a'});expect(nav(el).querySelector('output')!.textContent).toBe('4 / 4');
  viewer.setOptions({visibility:{variantNav:false}});expect(nav(el).hidden).toBe(true);
  expect(parseViewerConfig({visibility:{variantNav:false,variantTrack:false},focusFirstVariant:true})).toMatchObject({focusFirstVariant:true});
  expect(()=>parseViewerConfig({focusFirstVariant:'yes'})).toThrow(/boolean/);
  expect(defaultVisibility.variantTrack&&defaultVisibility.variantNav).toBe(true);
});

it('orders variants by start column then display row, wraps, and skips hidden rows and columns',async()=>{
  const {el,viewer}=await make();viewer.addVariants(variants);
  const walk=(n:number,dir:1|-1=1)=>Array.from({length:n},()=>{const x=viewer.nextVariant(dir);return x&&`${x.rowId}:${x.start}`;});
  // a is the pinned reference, so it comes first; then b and c in display order.
  expect(walk(5)).toEqual(['a:2','b:2','c:2','a:5','a:2']);
  expect(walk(2,-1)).toEqual(['a:5','c:2']);
  viewer.hideRows(['b']);viewer.setSelection(null);expect(walk(4)).toEqual(['a:2','c:2','a:5','a:2']);
  await viewer.setSort('name');viewer.showRows();viewer.setReference('c');viewer.setSelection(null);
  expect(walk(4)).toEqual(['c:2','a:2','b:2','a:5']);
  viewer.hideColumns(5,5);viewer.setSelection(null);expect(walk(4)).toEqual(['c:2','a:2','b:2','c:2']);
  // From a plain column selection the next variant starts at or after that column.
  viewer.showColumns();viewer.setSelection({start:3,end:3});expect(walk(1)).toEqual(['a:5']);
  viewer.setSelection({start:3,end:3});expect(walk(1,-1)).toEqual(['b:2']);
  const scroll=el.querySelector<HTMLElement>('.ak-scroll')!;viewer.setSelection(null);
  scroll.dispatchEvent(new KeyboardEvent('keydown',{key:']',bubbles:true}));expect(viewer.getState().selection).toMatchObject({start:2,rowId:'c'});
  scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'[',bubbles:true}));expect(viewer.getState().selection).toMatchObject({start:5,rowId:'a'});
});

it('expands a collapsed group to reveal the selected variant',async()=>{
  const {viewer}=await make();viewer.addVariants([{rowId:'b',position:3}]);
  viewer.setGroups({a:'one',b:'two',c:'two'});viewer.toggleGroup('two',true);
  expect(viewer.getVisibleRows()).not.toContain('b');
  expect(viewer.nextVariant()).toMatchObject({rowId:'b',start:3});expect(viewer.getVisibleRows()).toContain('b');
});

it('selects the first variant after load with focusFirstVariant',async()=>{
  const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false,focusFirstVariant:true});disposers.push(()=>viewer.destroy());
  const a=alignment();a.annotations.push({id:'v',rowId:'b',start:6,end:6,label:'p.K6E',kind:'missense',mapping:'mapped'});
  await viewer.setAlignment(a);expect(viewer.getState().selection).toEqual({start:6,end:6,rowId:'b'});
});

it('selects and pins a variant clicked in the track',async()=>{
  const {el,viewer}=await make({labelWidth:200,cellWidth:16});viewer.addVariants([{rowId:'b',hgvs:'p.Leu3Pro',consequence:'missense_variant'}]);
  const top=trackLayout(viewer.getVisibility(),36,[],'protein',1).offsets.variants!;
  el.querySelector('.ak-tracks canvas')!.dispatchEvent(new MouseEvent('click',{clientX:200+2*16+8,clientY:top+9,bubbles:true}));
  expect(viewer.getState().selection).toEqual({start:3,end:3,rowId:'b'});
  const card=el.querySelector<HTMLElement>('.ak-tooltip')!;expect(card.dataset.pinned).toBe('true');
  expect(card.textContent).toContain('p.Leu3Pro');expect(card.textContent).toContain('Missense');expect(card.textContent).toContain('L → P');
  el.querySelector<HTMLElement>('.ak-scroll')!.scrollLeft=0;
  el.querySelector('.ak-tracks canvas')!.dispatchEvent(new MouseEvent('click',{clientX:200+6*16+8,clientY:top+9,bubbles:true}));
  expect(viewer.getState().selection).toEqual({start:7,end:7});
});

it('shows the consequence legend in the Colors tab when variants exist',async()=>{
  const {el,viewer}=await make();
  const legend=()=>{el.querySelector<HTMLButtonElement>('[data-tab="legend"]')!.click();renderPanel(viewer as any);return el.querySelector('.ak-variant-legend');};
  expect(legend()).toBeNull();viewer.addVariants(variants);
  const list=legend()!;expect(list.querySelectorAll('li')).toHaveLength(7);expect(list.textContent).toContain('Frameshift');
  expect((list.querySelector('[data-variant-class="nonsense"]') as HTMLElement).style.background).toBe('rgb(213, 94, 0)');
});
