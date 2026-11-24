// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import type {Core} from '../src/viewer/core';
import type {ViewerOptions} from '../src/types';

const cleanup:(()=>void)[]=[];
const frames=vi.fn(()=>0);
beforeEach(()=>{frames.mockClear();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',frames);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{cleanup.splice(0).forEach(dispose=>dispose());document.body.replaceChildren();vi.unstubAllGlobals();});
const tick=()=>new Promise(resolve=>setTimeout(resolve));
function system(dark:boolean) {
  const listeners:(()=>void)[]=[],query={matches:dark,addEventListener:(_:string,fn:()=>void)=>listeners.push(fn)};
  vi.stubGlobal('matchMedia',()=>query);
  return (next:boolean)=>{query.matches=next;listeners.forEach(fn=>fn());};
}
async function mounted(options:ViewerOptions={},parent:Node=document.body) {
  const host=document.createElement('div');parent.appendChild(host);
  const viewer=createViewer(host,{worker:false,...options});cleanup.push(()=>viewer.destroy());
  await viewer.load('>r1\nACGT\n>r2\nACGA',{alphabet:'dna'});
  const core=(viewer as unknown as {core:Core}).core;
  return {viewer,core,root:core.root,button:core.root.querySelector<HTMLElement>('[data-action="theme"]')!};
}

it('draws the canvas dark for theme auto on a dark system and light on a light system',async()=>{
  const change=system(true),{viewer,core}=await mounted({theme:'auto'});
  expect(core.view().dark).toBe(true);
  change(false);expect(core.view().dark).toBe(false);
  viewer.setOptions({theme:'dark'});expect(core.view().dark).toBe(true);
  viewer.setOptions({theme:'light'});change(true);expect(core.view().dark).toBe(false);
});
it('redraws the canvas and the overview when the system scheme changes under theme auto only',async()=>{
  const change=system(false),{viewer,core}=await mounted({theme:'auto'});
  core.overviewDirty=false;frames.mockClear();change(true);
  expect(frames).toHaveBeenCalledTimes(1);expect(core.overviewDirty).toBe(true);
  viewer.setOptions({theme:'light'});core.overviewDirty=false;frames.mockClear();change(false);
  expect(frames).not.toHaveBeenCalled();expect(core.overviewDirty).toBe(false);
});
it('switches the theme button from auto to the opposite of the resolved theme',async()=>{
  system(false);const light=await mounted({theme:'auto'});
  await tick();expect(light.button.getAttribute('aria-pressed')).toBe('false');
  light.button.click();await tick();
  expect(light.core.options.theme).toBe('dark');expect(light.root.dataset.theme).toBe('dark');expect(light.button.getAttribute('aria-pressed')).toBe('true');
  system(true);const dark=await mounted({theme:'auto'});
  await tick();expect(dark.button.getAttribute('aria-pressed')).toBe('true');
  dark.button.click();await tick();
  expect(dark.core.options.theme).toBe('light');expect(dark.button.getAttribute('aria-pressed')).toBe('false');
});
it('keeps the explicit light and dark toggle working',async()=>{
  const {core,button}=await mounted();
  button.click();await tick();expect(core.options.theme).toBe('dark');
  button.click();await tick();expect(core.options.theme).toBe('light');
});
it('moves focus off a control that setOptions hides inside a shadow root',async()=>{
  const outer=document.createElement('div'),shadow=outer.attachShadow({mode:'open'});document.body.append(outer);
  const {viewer,core,root}=await mounted({},shadow),fit=root.querySelector<HTMLElement>('[data-action="fit"]')!;
  fit.focus();expect(shadow.activeElement).toBe(fit);expect(document.activeElement).toBe(outer);
  viewer.setOptions({visibility:{fit:false}});
  expect(shadow.activeElement).toBe(core.scroll);
});
