// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {parseViewerConfig} from '../src/config';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const rows=Array.from({length:20},(_,i)=>({id:`r${i}`,name:`r${i}`,sequence:'ACGT'.repeat(25)}));
const viewerFor=async(options={}):Promise<any>=>{const v=createViewer(host(),{worker:false,...options});disposers.push(()=>v.destroy());await v.setAlignment(createAlignment(rows,{alphabet:'dna'}));return v;};
const pointer=(target:HTMLElement,type:string,clientX:number,clientY:number,button=0)=>{
  const event=new MouseEvent(type,{clientX,clientY,button,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);
};
const gesture=(v:any,dx:number,dy:number,button=0)=>{
  const scroll=v.scroll as HTMLElement,x=v.gutter+100,y=100;
  pointer(scroll,'pointerdown',x,y,button);pointer(scroll,'pointermove',x+dx/2,y+dy/2,button);pointer(scroll,'pointermove',x+dx,y+dy,button);pointer(scroll,'pointerup',x+dx,y+dy,button);
  scroll.dispatchEvent(new MouseEvent('click',{clientX:x+dx,clientY:y+dy,button,bubbles:true}));
};

it('pans the grid with the pointer and keeps the selection',async()=>{
  const v=await viewerFor(),scroll=v.scroll as HTMLElement;scroll.scrollLeft=200;scroll.scrollTop=100;
  v.setSelection({start:3,end:3,rowId:'r1'},false);
  gesture(v,-60,-30);
  expect(scroll.scrollLeft).toBe(260);expect(scroll.scrollTop).toBe(130);
  expect(v.getState().selection).toEqual({start:3,end:3,rowId:'r1'});
  expect(v.root.dataset.panning).toBeUndefined();
});
it('treats a press that moves under 4 px as a click',async()=>{
  const v=await viewerFor(),scroll=v.scroll as HTMLElement;
  gesture(v,2,2);
  expect(scroll.scrollLeft).toBe(0);expect(scroll.scrollTop).toBe(0);
  expect(v.getState().selection).toEqual({start:7,end:7,rowId:'r3'});
});
it('selects with the next click after a pan',async()=>{
  const v=await viewerFor();gesture(v,-40,0);expect(v.getState().selection).toBeNull();
  gesture(v,0,0);expect(v.getState().selection).not.toBeNull();
});
it('ignores other buttons, the label gutter and the option switch',async()=>{
  const v=await viewerFor(),scroll=v.scroll as HTMLElement;
  gesture(v,-50,-50,2);expect(scroll.scrollLeft).toBe(0);
  pointer(scroll,'pointerdown',10,10);pointer(scroll,'pointermove',60,60);pointer(scroll,'pointerup',60,60);expect(scroll.scrollLeft).toBe(0);
  const off=await viewerFor({dragToPan:false});gesture(off,-50,-50);expect((off.scroll as HTMLElement).scrollLeft).toBe(0);expect(off.root.dataset.dragPan).toBe('false');
  expect(v.root.dataset.dragPan).toBe('true');
});
it('accepts dragToPan in the JSON configuration',async()=>{
  expect(parseViewerConfig({dragToPan:false})).toEqual({dragToPan:false});expect(()=>parseViewerConfig({dragToPan:1})).toThrow(/boolean/);
  const {readFileSync}=await import('node:fs');expect(JSON.parse(readFileSync('config/viewer-config.schema.json','utf8')).properties.dragToPan.type).toBe('boolean');
});
