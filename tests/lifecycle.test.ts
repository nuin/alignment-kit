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
  const state=viewer.getState();viewer.setSelection(null);await viewer.setState(state);expect(viewer.getState().selection?.start).toBe(1);
  await expect(viewer.setState({...state,alignmentId:'wrong'})).rejects.toThrow(/different alignment/);
});
it('clears reactive alignment props and refuses A3M URL input',async()=>{
  const controller=mountViewer(host(),{alignment:data(),options:{worker:false}});disposers.push(()=>controller.destroy());
  await vi.waitFor(()=>expect(controller.viewer.getAlignment()).toBeDefined());
  controller.update({alignment:undefined,options:{worker:false}});
  expect(controller.viewer.getAlignment()).toBeUndefined();
  await expect(controller.viewer.loadUrl('https://example.org/test.a3m')).rejects.toThrow(/A3M/);
});
