// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {mountViewer} from '../src/integration';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const data=()=>parseAlignment('>a\nA-CG\n>b\nATCG\n>c\nAT-G',{alphabet:'dna'});
it('updates palette choices and colors when the alignment alphabet changes',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());expect(viewer.getState().colorScheme).toBe('soft-nucleotide');
  const palette=el.querySelector<HTMLSelectElement>('select[aria-label="Color scheme"]')!;
  expect([...palette.options].map(o=>o.value)).toContain('purine');expect([...palette.options].map(o=>o.value)).not.toContain('taylor');
  const type=el.querySelector<HTMLSelectElement>('select[aria-label="Sequence alphabet"]')!;
  type.value='protein';type.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(viewer.getAlignment()?.alphabet).toBe('protein'));
  expect(viewer.getState().colorScheme).toBe('soft');expect([...palette.options].map(o=>o.value)).toContain('taylor');
  expect(el.querySelector('[role=combobox][aria-label="Sequence alphabet"]')?.textContent).toBe('Protein');
  await viewer.setAlignment(parseAlignment('>rna\nACGU',{alphabet:'rna'}));expect(viewer.getState().colorScheme).toBe('soft-nucleotide');
  viewer.setOptions({theme:'dark',colorScheme:'soft'});expect(viewer.getState().colorScheme).toBe('soft-nucleotide');
});
it('emits ready only for the latest load of the same alignment object',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());const a=data(),ready=vi.fn(()=>expect(viewer.getStatistics()).toBeDefined());
  viewer.on('ready',ready);await Promise.all([viewer.setAlignment(a),viewer.setAlignment(a)]);expect(ready).toHaveBeenCalledOnce();
});
it('maintains exact statistics across filters, reference changes and selections',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());
  expect(viewer.getStatistics()?.total).toBe(3);
  viewer.setFilter('b');expect(viewer.getStatistics()?.total).toBe(3);
  viewer.setReference('seq-2');expect(viewer.getState().referenceId).toBe('seq-2');
  viewer.setSelection({start:2,end:3,rowId:'seq-3'});expect(viewer.getState().selection?.rowId).toBe('seq-3');
  viewer.setOptions({statisticsScope:'filtered'});await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(1));
  viewer.setFilter('missing');await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(0));
});
it('uses current callbacks and replaces data without remounting',async()=>{
  const first=vi.fn(),second=vi.fn(),a=data(),controller=mountViewer(host(),{alignment:a,options:{worker:false},onSelectionChange:first});disposers.push(()=>controller.destroy());
  await vi.waitFor(()=>expect(controller.viewer.getStatistics()).toBeDefined());
  controller.viewer.setSelection({start:1,end:1});expect(first).toHaveBeenCalledOnce();
  const b=parseAlignment('>new\nGG',{alphabet:'dna'});
  controller.update({alignment:b,options:{worker:false,theme:'dark'},onSelectionChange:second});
  await vi.waitFor(()=>expect(controller.viewer.getStatistics()?.width).toBe(2));
  controller.viewer.setSelection({start:2,end:2});expect(second).toHaveBeenCalledOnce();expect(first).toHaveBeenCalledOnce();
  expect(document.querySelectorAll('.ak-viewer')).toHaveLength(1);
});
it('cancels stale loads and removes listeners and DOM on destroy',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false}),handler=vi.fn();
  viewer.on('ready',handler);
  const one=viewer.load('>old\nAAAA'),two=viewer.load('>new\nCC');
  await Promise.all([one,two]);expect(viewer.getAlignment()?.rows[0].name).toBe('new');expect(handler).toHaveBeenCalledOnce();
  viewer.destroy();viewer.destroy();expect(el.children).toHaveLength(0);
  expect(()=>viewer.setFilter('x')).toThrow(/destroyed/);
});
it('restores state only for the correct dataset and maps ungapped motifs through gaps',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());
  viewer.findMotif('ACG');expect(viewer.getState().selection).toMatchObject({start:1,end:4,rowId:'seq-1'});
  viewer.setOptions({visibility:{overview:false}});const state=viewer.getState();viewer.setSelection(null);viewer.setOptions({visibility:{overview:true}});await viewer.setState(state);expect(viewer.getState().selection?.start).toBe(1);expect(viewer.getVisibility().overview).toBe(false);
  await viewer.setState({...state,visibility:undefined});expect(viewer.getVisibility().overview).toBe(false);
  await expect(viewer.setState({...state,alignmentId:'wrong'})).rejects.toThrow(/different alignment/);
});
it('clears reactive alignment props and refuses A3M URL input',async()=>{
  const controller=mountViewer(host(),{alignment:data(),options:{worker:false}});disposers.push(()=>controller.destroy());
  await vi.waitFor(()=>expect(controller.viewer.getAlignment()).toBeDefined());
  controller.update({alignment:undefined,options:{worker:false}});
  expect(controller.viewer.getAlignment()).toBeUndefined();
  await expect(controller.viewer.loadUrl('https://example.org/test.a3m')).rejects.toThrow(/A3M/);
});
it('merges visibility patches, preserves data, and restores the reference to the matrix when unpinned visually',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false,visibility:{open:false,overview:false}});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());viewer.setSelection({start:2,end:3,rowId:'seq-2'});
  expect(el.querySelector<HTMLElement>('[data-action="open"]')!.hidden).toBe(true);
  expect(el.querySelector<HTMLElement>('.ak-overview-wrap')!.hidden).toBe(true);
  viewer.setOptions({visibility:{labels:false,reference:false,tracks:false}});
  expect(el.querySelector<HTMLElement>('.ak-viewer')!.style.getPropertyValue('--ak-gutter')).toBe('0px');
  expect(el.querySelector<HTMLElement>('.ak-spacer')!.style.height).toBe('108px');
  expect(viewer.getStatistics()?.total).toBe(3);expect(viewer.getState().selection).toMatchObject({start:2,end:3});
  expect(viewer.getVisibility().open).toBe(false);
  viewer.setOptions({visibility:{labels:true,tracks:true,reference:true,overview:true}});
  expect(el.querySelector<HTMLElement>('.ak-spacer')!.style.height).toBe('72px');
  expect(el.querySelector<HTMLElement>('.ak-viewer')!.style.getPropertyValue('--ak-gutter')).toBe('230px');
  expect(el.querySelector<HTMLElement>('.ak-overview-wrap')!.hidden).toBe(false);
  expect(el.querySelector<HTMLElement>('[data-action="open"]')!.hidden).toBe(true);
});
it('collapses disabled track heights and supports legacy aliases and integration updates',async()=>{
  const el=host(),alignment=data(),controller=mountViewer(el,{alignment,options:{worker:false,visibility:{ruler:false,modalFrequency:false,gapFraction:false,consensus:false,reference:false}}});disposers.push(()=>controller.destroy());
  await vi.waitFor(()=>expect(controller.viewer.getStatistics()).toBeDefined());
  expect(el.querySelector<HTMLElement>('.ak-tracks')!.hidden).toBe(true);
  controller.update({alignment,options:{visibility:{logo:true,tools:false},showToolbar:true}});
  expect(el.querySelector<HTMLElement>('.ak-tracks')!.style.height).toBe('45px');
  expect(el.querySelector<HTMLElement>('.ak-tools')!.hidden).toBe(true);
  expect(el.querySelector<HTMLElement>('.ak-toolbar')!.hidden).toBe(false);
  controller.viewer.setOptions({showLogo:false,showInspector:false,showToolbar:false});
  expect(el.querySelector<HTMLElement>('.ak-tracks')!.hidden).toBe(true);
  expect(el.querySelector<HTMLElement>('.ak-inspector')!.hidden).toBe(true);
  expect(controller.viewer.getVisibility().logo).toBe(false);
});
