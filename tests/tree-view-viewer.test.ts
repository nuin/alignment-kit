// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createAlignment} from '../src/model';
import {createViewer} from '../src/viewer';

const disposers:(()=>void)[]=[];
const ops:string[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
  const ctx=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:5}):(...args:unknown[])=>{ops.push(String(k));return undefined;},set:()=>true});
  HTMLCanvasElement.prototype.getContext=(()=>ctx) as any;
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const rows=[{id:'a',name:'a',sequence:'ACGTACGT'},{id:'b',name:'b',sequence:'ACGAACG-'},{id:'c',name:'c',sequence:'TTGTACGT'},{id:'d',name:'d',sequence:'TTGAACGT'}];
async function make(){
  const el=document.createElement('div');document.body.append(el);
  const viewer=createViewer(el,{worker:false,visibility:{reference:false}});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(createAlignment(rows,{alphabet:'dna'}));
  return {viewer,el,overlay:()=>el.querySelector<HTMLElement>('.ak-tree-view')!,box:()=>el.querySelector<HTMLInputElement>('.ak-tree-view input')!};
}
const NEWICK='((a:1,b:1):1,(c:1,d:1):1);';

it('throws without a tree',async()=>{
  const {viewer}=await make();
  expect(()=>viewer.openTreeView()).toThrow('Set or build a tree before opening the tree view.');
});
it('syncs the button data-empty with the tree',async()=>{
  const {viewer,el}=await make();const btn=el.querySelector<HTMLElement>('[data-action="tree-view"]')!;
  expect(btn.dataset.empty).toBe('true');viewer.setTree(NEWICK);expect(btn.dataset.empty).toBe('false');
});
it('opens on the selected column and follows selection',async()=>{
  const {viewer,overlay,box}=await make();viewer.setTree(NEWICK);
  expect(overlay().hidden).toBe(true);
  viewer.setSelection({start:3,end:3});viewer.openTreeView();
  expect(overlay().hidden).toBe(false);expect(box().value).toBe('3');
  viewer.setSelection({start:2,end:2});expect(box().value).toBe('2');
});
it('clamps typed columns',async()=>{
  const {viewer,box}=await make();viewer.setTree(NEWICK);viewer.openTreeView();
  box().value='999';box().dispatchEvent(new Event('change'));expect(box().value).toBe('8');
  box().value='0';box().dispatchEvent(new Event('change'));expect(box().value).toBe('1');
});
it('closes on Escape, closeTreeView, null tree and load',async()=>{
  const {viewer,overlay}=await make();viewer.setTree(NEWICK);
  viewer.openTreeView();overlay().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(overlay().hidden).toBe(true);
  viewer.openTreeView();viewer.closeTreeView();expect(overlay().hidden).toBe(true);
  viewer.openTreeView();viewer.setTree(null);expect(overlay().hidden).toBe(true);
  viewer.setTree(NEWICK);viewer.openTreeView();await viewer.setAlignment(createAlignment(rows,{alphabet:'dna'}));expect(overlay().hidden).toBe(true);
});
it('stays open and rebuilds when the tree is replaced',async()=>{
  const {viewer,overlay}=await make();viewer.setTree(NEWICK);viewer.openTreeView();
  viewer.setTree('((a:1,c:1):1,(b:1,d:1):1);');expect(overlay().hidden).toBe(false);
  expect(((viewer as any).treeView.geometry.leaves as number[]).length).toBe(4);
});
it('draws chips for a column and selects a clade on click',async()=>{
  const {viewer,overlay}=await make();viewer.setTree(NEWICK);ops.length=0;viewer.openTreeView(1);expect(ops).toContain('fillText');
  const canvas=overlay().querySelector('canvas')!;
  const tv=(viewer as any).treeView,layout=(viewer as any).tree.layout;
  const root=0,x=8+layout.x[root]*Math.max(1,canvas.clientWidth-260-16),y=tv.geometry.y[root];
  canvas.getBoundingClientRect=()=>({left:0,top:0,right:0,bottom:0,width:0,height:0,x:0,y:0,toJSON(){}}) as DOMRect;
  canvas.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
  expect(viewer.getSelectedRowIds().sort()).toEqual(['a','b','c','d']);
});
it('returns focus to the Tree view button after Esc when nothing was focused at open',async()=>{
  const {viewer,el,overlay}=await make();viewer.setTree(NEWICK);
  const btn=el.querySelector<HTMLElement>('[data-action="tree-view"]')!;btn.hidden=false;
  viewer.openTreeView();expect(el.contains(document.activeElement)).toBe(true);
  overlay().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  expect(overlay().hidden).toBe(true);expect(document.activeElement).toBe(btn);
});
it('closes on Esc dispatched on the root and keeps the selection',async()=>{
  const {viewer,el,overlay}=await make();viewer.setTree(NEWICK);viewer.setSelection({start:3,end:3});viewer.openTreeView();
  el.querySelector<HTMLElement>('.ak-viewer')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  expect(overlay().hidden).toBe(true);expect(viewer.getState().selection).toMatchObject({start:3,end:3});
});
it('closes on clear()',async()=>{
  const {viewer,overlay}=await make();viewer.setTree(NEWICK);viewer.openTreeView();expect(overlay().hidden).toBe(false);
  viewer.clear();expect(overlay().hidden).toBe(true);expect(()=>viewer.openTreeView()).toThrow();
});
it('ignores Esc that was already handled',async()=>{
  const {viewer,el,overlay}=await make();viewer.setTree(NEWICK);viewer.openTreeView();
  const root=el.querySelector<HTMLElement>('.ak-viewer')!;root.addEventListener('keydown',e=>e.preventDefault(),true);
  root.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  expect(overlay().hidden).toBe(false);
});
it('closes when the tree is hidden by visibility',async()=>{
  const {viewer,overlay}=await make();viewer.setTree(NEWICK);viewer.openTreeView();
  viewer.setOptions({visibility:{tree:false}});expect(overlay().hidden).toBe(true);
});
it('restores the column box on empty input',async()=>{
  const {viewer,box}=await make();viewer.setTree(NEWICK);viewer.setSelection({start:3,end:3});viewer.openTreeView();
  box().value='';box().dispatchEvent(new Event('change'));expect(box().value).toBe('3');
});
it('hides and restores the small tree with the checkbox',async()=>{
  const {viewer,el}=await make();const box=el.querySelector<HTMLInputElement>('[aria-label="Show tree beside names"]')!,canvas=el.querySelector<HTMLElement>('.ak-tree-canvas')!;
  expect(box.closest('label')!.hidden).toBe(true);
  viewer.setTree(NEWICK);(viewer as any).render();expect(box.closest('label')!.hidden).toBe(false);expect(box.checked).toBe(true);expect(canvas.hidden).toBe(false);
  viewer.setOptions({treeWidth:200});box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));(viewer as any).render();
  expect(canvas.hidden).toBe(true);expect((viewer as any).options.treeWidth).toBe(0);
  viewer.openTreeView();expect(el.querySelector<HTMLElement>('.ak-tree-view')!.hidden).toBe(false);viewer.closeTreeView();
  box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));(viewer as any).render();
  expect(canvas.hidden).toBe(false);expect((viewer as any).options.treeWidth).toBe(200);
});
