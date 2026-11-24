// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {mountWire} from '../src/integration';
import * as bundle from '../src/global';
import {createAlignment,toJson,type ViewState,type Selection} from '../src/index';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const data=(name='first')=>createAlignment([{id:'r1',name:'one',sequence:'A-CG'},{id:'r2',name:'two',sequence:'ATCG'},{id:'r3',name:'three',sequence:'AT-G'}],{name,alphabet:'dna'});
const open=(...args:Parameters<typeof mountWire>)=>{const view=mountWire(...args);disposers.push(()=>view.destroy());return view;};
it('exposes mountWire, fromJson and toJson on the global bundle entry',()=>{expect(bundle.mountWire).toBe(mountWire);expect(typeof bundle.fromJson).toBe('function');expect(typeof bundle.toJson).toBe('function');expect(typeof bundle.fillTemplate).toBe('function');});
it('loads the alignment, then the tree and the state of a document made elsewhere',async()=>{
  const a=data(),ready=vi.fn(),errors=vi.fn();
  const state:ViewState={version:1,alignmentId:'made-in-python',referenceId:'r2',query:'',sort:'tree',start:1,rowOffset:0,cellWidth:18,selection:{start:2,end:3,rowId:'r1'},colorScheme:'soft-nucleotide',colorMode:'all',statisticsScope:'all',annotationFilter:{}};
  const view=open(host(),JSON.stringify({...toJson(a,{tree:'((three,one),two);',config:{worker:false,cellWidth:10}}),state}),{onReady:ready,onError:errors},{height:480,cellWidth:20});
  await view.ready;expect(errors).not.toHaveBeenCalled();expect(ready).toHaveBeenCalledOnce();expect(ready.mock.calls[0][0].id).toBe(a.id);
  const now=view.viewer.getState();expect(now).toMatchObject({alignmentId:a.id,referenceId:'r2',sort:'tree',cellWidth:18,selection:{start:2,end:3,rowId:'r1'}});
  expect(view.viewer.getRowOrder()).toEqual(['r3','r1','r2']);
});
it('lets the document configuration win over the host defaults',async()=>{
  const view=open(host(),toJson(data(),{config:{worker:false,cellWidth:10}}),{},{cellWidth:20,theme:'dark'});await view.ready;
  expect(view.viewer.getState().cellWidth).toBe(10);expect(document.querySelector('.ak-viewer')?.getAttribute('data-theme')??document.querySelector('.ak-viewer')?.className).toContain('dark');
});
it('reports selection and state, and replaces the document on update',async()=>{
  const selections:(Selection|null)[]=[],states:ViewState[]=[],view=open(host(),toJson(data(),{config:{worker:false}}),{onSelection:s=>selections.push(s),onState:s=>states.push(s)});
  await view.ready;view.viewer.setSelection({start:1,end:2});expect(selections.at(-1)).toEqual({start:1,end:2});expect(states.at(-1)?.selection).toEqual({start:1,end:2});
  const next=createAlignment([{name:'x',sequence:'MKVLE'},{name:'y',sequence:'MKILE'}],{name:'second'});
  await view.update(toJson(next,{config:{worker:false,cellWidth:9}}));expect(view.viewer.getAlignment()?.name).toBe('second');expect(view.viewer.getState().cellWidth).toBe(9);
  await view.setState({...states.at(-1)!,alignmentId:'stale',selection:{start:2,end:4},referenceId:null,colorScheme:'soft'});expect(view.viewer.getState().selection).toEqual({start:2,end:4});
});
it('throws on an invalid document and sends a failed state to onError',async()=>{
  expect(()=>mountWire(host(),{format:'msa-canvas',version:3})).toThrow('version 3 is not supported');
  const errors:Error[]=[],doc=toJson(data(),{config:{worker:false}}),bad={version:1,referenceId:null,query:'',sort:'input',start:1,rowOffset:0,cellWidth:14,selection:null,colorScheme:'soft-nucleotide',colorMode:'all',statisticsScope:'all',annotationFilter:{},hiddenColumns:[[1,99]]};
  const view=open(host(),{...doc,state:bad},{onError:e=>errors.push(e)});await view.ready;expect(errors.map(e=>e.message)).toEqual(['Invalid hidden columns in view state.']);
  expect(()=>view.update('{')).toThrow('the text is not JSON');expect(view.viewer.getAlignment()?.name).toBe('first');
});
