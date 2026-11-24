// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createApp,h,nextTick,reactive,ref,shallowRef,toRaw} from 'vue';
import {AlignmentViewer} from '../src/vue';
import {parseAlignment} from '../src/parsers';
import type {AlignmentViewer as Viewer} from '../src/viewer';
import type {Alignment,Selection} from '../src/types';
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>document.body.replaceChildren());
const data=()=>parseAlignment('>a\nA-CG\n>b\nATCG\n>c\nAT-G',{alphabet:'dna'});
const root=()=>{const el=document.createElement('div');document.body.append(el);return el;};
it('mounts one viewer, forwards class and id, and emits ready with the viewer',async()=>{
  const a=data(),ready=vi.fn(),el=root();
  const app=createApp(()=>h(AlignmentViewer,{alignment:a,options:{worker:false},class:'embedded',id:'msa',onReady:ready}));app.mount(el);
  const viewer:Viewer=ready.mock.calls[0][0];expect(ready).toHaveBeenCalledOnce();
  expect(el.querySelector('#msa.embedded > .ak-viewer')).not.toBeNull();
  await vi.waitFor(()=>expect(viewer.getAlignment()).toBe(a));
  app.unmount();expect(el.querySelector('.ak-viewer')).toBeNull();expect(()=>viewer.clear()).toThrow();
});
it('passes the raw alignment when the parent holds it in a deep ref',async()=>{
  const a=data(),held=ref<Alignment|undefined>(a),ready=vi.fn(),el=root();
  expect(held.value).not.toBe(a);
  const app=createApp(()=>h(AlignmentViewer,{alignment:held.value,options:{worker:false},onReady:ready}));app.mount(el);
  const viewer:Viewer=ready.mock.calls[0][0];
  await vi.waitFor(()=>expect(viewer.getAlignment()).toBe(a));expect(viewer.getAlignment()!.codes).toBe(toRaw(a).codes);
  app.unmount();
});
it('updates on replaced props, clears on undefined and emits selection changes',async()=>{
  const a=data(),b=parseAlignment('>x\nAC\n>y\nAT',{alphabet:'dna'}),alignment=shallowRef<Alignment|undefined>(a),options=shallowRef<object>({worker:false}),ready=vi.fn(),selected=vi.fn(),el=root();
  const app=createApp(()=>h(AlignmentViewer,{alignment:alignment.value,options:options.value,onReady:ready,onSelectionChange:selected}));app.mount(el);
  const viewer:Viewer=ready.mock.calls[0][0];await vi.waitFor(()=>expect(viewer.getAlignment()).toBe(a));
  viewer.setSelection({start:1,end:2});expect((selected.mock.calls.at(-1)![0] as Selection)).toMatchObject({start:1,end:2});
  alignment.value=b;await nextTick();await vi.waitFor(()=>expect(viewer.getAlignment()).toBe(b));
  options.value=reactive({worker:false,theme:'dark'});await nextTick();expect(el.querySelector<HTMLElement>('.ak-viewer')!.dataset.theme).toBe('dark');
  alignment.value=undefined;await nextTick();expect(viewer.getAlignment()).toBeUndefined();
  expect(ready).toHaveBeenCalledOnce();app.unmount();
});
it('exposes the viewer on the component instance',()=>{
  const inner=shallowRef<any>(null),el=root(),app=createApp(()=>h(AlignmentViewer,{ref:inner,options:{worker:false}}));app.mount(el);
  expect(typeof inner.value.viewer.getState).toBe('function');app.unmount();
});
