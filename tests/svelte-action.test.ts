// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {alignmentViewer} from '../src/svelte';
import {parseAlignment} from '../src/parsers';
import type {AlignmentViewer} from '../src/viewer';
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>document.body.replaceChildren());
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const dna=(text:string)=>parseAlignment(text,{alphabet:'dna'});
it('mounts a viewer, forwards updated props and destroys it',async()=>{
  const el=host(),options={worker:false as const};let viewer:AlignmentViewer|undefined;const ready=(v:AlignmentViewer)=>{viewer=v;};
  const action=alignmentViewer(el,{alignment:dna('>a\nACGT\n>b\nACGA'),options,onReady:ready})!;
  expect(el.querySelector('canvas')).not.toBeNull();
  await vi.waitFor(()=>expect(viewer!.getAlignment()?.width).toBe(4));
  action.update!({alignment:dna('>a\nACGTAC\n>b\nACGAAC'),options,onReady:ready});
  await vi.waitFor(()=>expect(viewer!.getAlignment()?.width).toBe(6));
  action.update!(undefined);expect(viewer!.getAlignment()).toBeUndefined();
  action.destroy!();expect(el.querySelector('canvas')).toBeNull();
});
it('mounts without props',()=>{
  const el=host(),action=alignmentViewer(el,undefined)!;
  expect(el.querySelector('canvas')).not.toBeNull();action.destroy!();
});
