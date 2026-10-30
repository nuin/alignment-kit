// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import type {ViewerOptions} from '../src/types';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.useRealTimers();});
const make=async(options:ViewerOptions={})=>{
  const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false,...options});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(createAlignment([{id:'a',name:'Alpha',sequence:'MKLA'},{id:'b',name:'Beta',sequence:'MKLV'}],{alphabet:'protein'}));
  return {el,zoom:el.querySelector<HTMLButtonElement>('[data-action="zoom-in"]')!};
};
const over=(target:Element)=>target.dispatchEvent(new MouseEvent('pointerover',{bubbles:true}));

it('shows a hint after the hover delay and links it to the button',async()=>{
  const {el,zoom}=await make();vi.useFakeTimers();
  over(zoom);expect(el.querySelector('.ak-hint')).toBeNull();
  vi.advanceTimersByTime(400);const hint=el.querySelector('.ak-hint')!;
  expect(hint.textContent).toBe('Zoom in');expect(hint.getAttribute('role')).toBe('tooltip');expect(zoom.getAttribute('aria-describedby')).toBe(hint.id);
  el.querySelector('.ak-viewer')!.dispatchEvent(new MouseEvent('pointerleave'));
  expect(el.querySelector('.ak-hint')).toBeNull();expect(zoom.hasAttribute('aria-describedby')).toBe(false);
});

it('shows a hint at once on keyboard focus and hides it on Escape',async()=>{
  const {el,zoom}=await make();
  zoom.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));zoom.focus();
  expect(el.querySelector('.ak-hint')?.textContent).toBe('Zoom in');
  zoom.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(el.querySelector('.ak-hint')).toBeNull();
});

it('shows no hint on mouse focus or when tooltips are hidden',async()=>{
  const {el,zoom}=await make();zoom.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));zoom.focus();expect(el.querySelector('.ak-hint')).toBeNull();
  const off=await make({visibility:{tooltip:false}});vi.useFakeTimers();over(off.zoom);vi.advanceTimersByTime(400);expect(off.el.querySelector('.ak-hint')).toBeNull();
});
