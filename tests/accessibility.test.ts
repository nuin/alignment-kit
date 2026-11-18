// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createViewer } from '../src/viewer';
import { syncAccessibleCell } from '../src/viewer/accessibility';
import type { Core } from '../src/viewer/core';

const cleanup:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{cleanup.splice(0).forEach(dispose=>dispose());document.body.replaceChildren();});
async function mounted() {
  const host=document.createElement('div');document.body.append(host);
  const viewer=createViewer(host,{worker:false});cleanup.push(()=>viewer.destroy());
  await viewer.load('>reference\nAC-G\n>sample\nATGG',{alphabet:'dna'});
  const core=(viewer as unknown as {core:Core}).core;
  syncAccessibleCell(core);
  return {host,viewer,core};
}

it('gives simultaneous viewers distinct active cells and clears stale accessible data',async()=>{
  const first=await mounted(),second=await mounted();
  const cell=first.host.querySelector('.ak-active-cell')!;
  expect(cell.id).not.toBe(second.host.querySelector('.ak-active-cell')!.id);
  first.viewer.setSelection({start:3,end:3,rowId:'seq-1'});syncAccessibleCell(first.core);
  expect(cell.textContent).toBe('reference, Column 3, gap');
  first.viewer.clear();
  expect(cell.textContent).toBe('');
  expect(first.host.querySelector('.ak-scroll')!.hasAttribute('aria-activedescendant')).toBe(false);
});

it('announces the complemented symbol while preserving source coordinates',async()=>{
  const {host,viewer,core}=await mounted();
  viewer.setSelection({start:2,end:2,rowId:'seq-2'});viewer.setOptions({reverseComplement:true});syncAccessibleCell(core);
  const cell=host.querySelector('.ak-active-cell')!;
  expect(cell.textContent).toBe('sample, Column 2, residue A, sequence position 2');
  expect(cell.getAttribute('aria-colindex')).toBe('2');
  expect(cell.parentElement!.getAttribute('aria-rowindex')).toBe('2');
});

it('announces the first visible column when a panned selection is cleared',async()=>{
  const {host,viewer,core}=await mounted();
  viewer.setSelection({start:1,end:1});syncAccessibleCell(core);
  core.scroll.scrollLeft=core.options.cellWidth*3;
  viewer.setSelection(null);syncAccessibleCell(core);
  expect(host.querySelector('.ak-active-cell')!.textContent).toBe('reference, Column 4, residue G, sequence position 3');
});

it('keeps the active cell stable and counts only traversed residues while panning',async()=>{
  const {host,viewer,core}=await mounted();
  let reads=0;
  core.a!.codes=new Proxy(core.a!.codes,{get(target,key){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,target);}});
  viewer.setSelection({start:4,end:4,rowId:'seq-1'});syncAccessibleCell(core);
  const text=host.querySelector('.ak-active-cell')!.firstChild;
  reads=0;syncAccessibleCell(core);
  expect(reads).toBe(0);
  expect(host.querySelector('.ak-active-cell')!.firstChild).toBe(text);
  core.scroll.scrollLeft=core.options.cellWidth*2;viewer.setSelection(null);syncAccessibleCell(core);
  expect(host.querySelector('.ak-active-cell')!.textContent).toBe('reference, Column 3, gap');
  reads=0;core.scroll.scrollLeft=core.options.cellWidth*3;syncAccessibleCell(core);
  expect(reads).toBeLessThanOrEqual(2);
  expect(host.querySelector('.ak-active-cell')!.textContent).toBe('reference, Column 4, residue G, sequence position 3');
});
