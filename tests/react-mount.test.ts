// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createElement,act,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {AlignmentViewer} from '../src/react';
import {parseAlignment} from '../src/parsers';
import type {AlignmentViewer as Viewer} from '../src/viewer';
beforeAll(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>document.body.replaceChildren());
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const dna=(text:string)=>parseAlignment(text,{alphabet:'dna'}),options={worker:false as const};
it('mounts into the host element, follows alignment props and unmounts',async()=>{
  const el=host(),root=createRoot(el);let viewer:Viewer|undefined;const onReady=(v:Viewer)=>{viewer=v;};
  await act(async()=>root.render(createElement(AlignmentViewer,{alignment:dna('>a\nACGT\n>b\nACGA'),options,onReady,className:'embedded',id:'msa'})));
  const div=el.querySelector<HTMLElement>('#msa.embedded')!;
  expect(div.querySelector('canvas')).not.toBeNull();
  await vi.waitFor(()=>expect(viewer!.getAlignment()?.width).toBe(4));
  const first=viewer;
  await act(async()=>root.render(createElement(AlignmentViewer,{alignment:dna('>a\nACGTAC\n>b\nACGAAC'),options,onReady,className:'embedded',id:'msa'})));
  await vi.waitFor(()=>expect(viewer!.getAlignment()?.width).toBe(6));expect(viewer).toBe(first);
  await act(async()=>root.render(createElement(AlignmentViewer,{options,onReady,id:'msa'})));
  expect(viewer!.getAlignment()).toBeUndefined();
  await act(async()=>root.unmount());expect(el.querySelector('canvas')).toBeNull();
});
it('leaves one viewer after the StrictMode setup, cleanup and setup cycle',async()=>{
  const el=host(),root=createRoot(el),onReady=vi.fn();
  await act(async()=>root.render(createElement(StrictMode,null,createElement(AlignmentViewer,{options,onReady}))));
  expect(onReady).toHaveBeenCalledTimes(2);expect(el.querySelectorAll('.ak-viewer')).toHaveLength(1);
  await act(async()=>root.unmount());expect(el.querySelectorAll('.ak-viewer')).toHaveLength(0);
});
