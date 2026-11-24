// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {MsaCanvasElement} from '../src/element';
import {parseAlignment} from '../src/parsers';
import type {AlignmentViewer} from '../src/viewer';
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>document.body.replaceChildren());
const data=()=>parseAlignment('>a\nA-CG\n>b\nATCG\n>c\nAT-G',{alphabet:'dna'});
const make=(options:MsaCanvasElement['options']={worker:false})=>{const el=document.createElement('msa-canvas');el.options=options;return el;};
const once=<T>(el:HTMLElement,type:string)=>new Promise<T>(resolve=>el.addEventListener(type,e=>resolve((e as CustomEvent<T>).detail),{once:true}));
it('registers msa-canvas and mounts the viewer in the light DOM on connect',async()=>{
  expect(customElements.get('msa-canvas')).toBe(MsaCanvasElement);
  const el=make(),ready=once<AlignmentViewer>(el,'msa-ready');el.alignment=data();
  expect(el.viewer).toBeUndefined();document.body.append(el);
  expect(await ready).toBe(el.viewer);expect(el.shadowRoot).toBeNull();expect(el.style.display).toBe('block');
  expect(el.querySelector(':scope > .ak-viewer')).not.toBeNull();
  await vi.waitFor(()=>expect(el.viewer!.getAlignment()?.rows.length).toBe(3));
});
it('keeps an author display value',()=>{const el=make();el.style.display='inline-block';document.body.append(el);expect(el.style.display).toBe('inline-block');});
it('applies alignment and options set after connect and clears on undefined',async()=>{
  const el=make();document.body.append(el);const a=data();el.alignment=a;
  await vi.waitFor(()=>expect(el.viewer!.getAlignment()).toBe(a));expect(el.alignment).toBe(a);
  el.options={worker:false,theme:'dark'};expect(el.querySelector<HTMLElement>('.ak-viewer')!.dataset.theme).toBe('dark');
  el.alignment=undefined;expect(el.viewer!.getAlignment()).toBeUndefined();
});
it('parses a source string and reports its warnings',async()=>{
  const el=make(),warnings=once<unknown[]>(el,'msa-warnings');el.source='>a\nACGT\n>b\nAC-T\n';document.body.append(el);
  expect(Array.isArray(await warnings)).toBe(true);
  await vi.waitFor(()=>expect(el.viewer!.getAlignment()?.width).toBe(4));
  el.source='>c\nAC\n>d\nAT\n';await vi.waitFor(()=>expect(el.viewer!.getAlignment()?.width).toBe(2));
  el.source=null;expect(el.viewer!.getAlignment()?.width).toBe(2);
});
it('sends one bubbling CustomEvent per integration callback',async()=>{
  const el=make(),seen:string[]=[],box=document.createElement('section');document.body.append(box);
  for(const type of ['msa-ready','msa-selection','msa-viewport','msa-annotation','msa-hover','msa-cellclick','msa-error','msa-search','msa-warnings'])box.addEventListener(type,e=>{if(!seen.includes(type))seen.push(type);expect(e.target).toBe(el);expect(e).toBeInstanceOf(CustomEvent);});
  el.alignment=data();box.append(el);await vi.waitFor(()=>expect(el.viewer!.getAlignment()).toBeDefined());
  const selection=once<{start:number;end:number}|null>(el,'msa-selection');el.viewer!.setSelection({start:2,end:3});
  expect(await selection).toMatchObject({start:2,end:3});
  const callbacks=(el as any).callbacks,click={row:0,column:1} as any,annotation={id:'x'} as any;
  callbacks.onAnnotationClick(annotation);callbacks.onHover(null);callbacks.onCellClick(click);callbacks.onSearch(null);callbacks.onViewportChange({} as any);
  const error=once<Error>(el,'msa-error');el.source='not an alignment';expect(await error).toBeInstanceOf(Error);
  expect(seen.sort()).toEqual(['msa-annotation','msa-cellclick','msa-error','msa-hover','msa-ready','msa-search','msa-selection','msa-viewport','msa-warnings']);
});
it('destroys the viewer on disconnect and mounts a new one on reconnect',async()=>{
  const el=make(),a=data();el.alignment=a;document.body.append(el);const first=el.viewer!;
  el.remove();expect(el.viewer).toBeUndefined();expect(el.querySelector('.ak-viewer')).toBeNull();expect(()=>first.clear()).toThrow();
  document.body.append(el);expect(el.viewer).not.toBe(first);await vi.waitFor(()=>expect(el.viewer!.getAlignment()).toBe(a));
});
it('reads properties that were assigned before the element upgraded',async()=>{
  const el=new MsaCanvasElement(),a=data();
  Object.defineProperty(el,'alignment',{value:a,writable:true,configurable:true,enumerable:true});
  Object.defineProperty(el,'options',{value:{worker:false},writable:true,configurable:true,enumerable:true});
  document.body.append(el);expect(Object.hasOwn(el,'alignment')).toBe(false);
  await vi.waitFor(()=>expect(el.viewer!.getAlignment()).toBe(a));
});
