// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import * as MsaCanvas from '../src/global';
import {createAlignment,toJson,type ViewState} from '../src/index';
// The Python and R front ends are plain scripts that expect the `MsaCanvas` global; they run here against the source of that bundle.
const widgetSource=readFileSync('python/msa_canvas/static/widget.js','utf8'),rSource=readFileSync('r/msacanvas/inst/htmlwidgets/msacanvas.js','utf8');
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren();});
const doc=(name='first')=>toJson(createAlignment([{id:'r1',name:'one',sequence:'A-CG'},{id:'r2',name:'two',sequence:'ATCG'}],{name,alphabet:'dna'}));
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function model(values:Record<string,unknown>) {
  const listeners=new Map<string,Set<()=>void>>(),saved:Record<string,unknown>[]=[];let pending:Record<string,unknown>={};
  return {
    saved,listeners,get:(key:string)=>values[key],set:(key:string,value:unknown)=>{values[key]=value;pending[key]=value;},save_changes:()=>{saved.push(pending);pending={};},
    on:(event:string,cb:()=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(cb);},off:(event:string,cb:()=>void)=>{listeners.get(event)?.delete(cb);},
    // What the kernel does: change a trait, then notify.
    receive:(key:string,value:unknown)=>{values[key]=value;for(const cb of listeners.get(`change:${key}`)??[])cb();},
  };
}
const render=new Function('MsaCanvas',widgetSource.replace('export default { render };','return render;'))(MsaCanvas) as (ctx:{model:ReturnType<typeof model>;el:HTMLElement})=>()=>void;
it('the Python front end is one module after the bundle, with no import and no URL',()=>{
  expect(widgetSource).toContain('export default { render };');expect(widgetSource).not.toMatch(/\bimport\b\s*[({'"]|https?:|fetch\(|\bsrc\s*=/);
  expect(readFileSync('python/msa_canvas/widget.py','utf8')).toContain('_esm = static_text("msa-canvas.global.js") + "\\n" + static_text("widget.js")');
});
it('the anywidget render function shows the alignment and syncs selection, state, config and errors',async()=>{
  const el=document.createElement('div');document.body.append(el);
  const m=model({alignment:doc(),config:{worker:false,cellWidth:10},state:null,selection:null,error:''}),dispose=render({model:m,el});
  await settle();await settle();const viewer=()=>el.querySelector('.ak-viewer');expect(viewer()).not.toBeNull();expect(m.get('error')).toBe('');
  vi.useFakeTimers();
  const wanted={version:1,referenceId:null,query:'',sort:'name',start:1,rowOffset:0,cellWidth:12,selection:{start:2,end:3},colorScheme:'soft-nucleotide',colorMode:'all',statisticsScope:'all',annotationFilter:{}} satisfies Omit<ViewState,'alignmentId'>;
  m.receive('state',wanted);await vi.advanceTimersByTimeAsync(300);
  expect(m.get('selection')).toEqual({start:2,end:3});expect(m.get('state')).toMatchObject({sort:'name',cellWidth:12,alignmentId:doc().alignment.id});expect(m.saved.some(s=>'state' in s)).toBe(true);
  m.receive('config',{worker:false,cellWidth:16});await vi.advanceTimersByTimeAsync(300);expect((m.get('state') as ViewState).cellWidth).toBe(16);
  m.receive('config',{worker:false,height:1});expect(m.get('error')).toBe('height must be a number between 360 and 2000.');m.receive('config',{worker:false});
  const second=toJson(createAlignment([{name:'x',sequence:'MKVLE'},{name:'y',sequence:'MKILE'}],{name:'second'}));
  m.receive('state',null);m.receive('alignment',second);await vi.advanceTimersByTimeAsync(300);expect(m.get('error')).toBe('');
  m.receive('state',{...wanted,colorScheme:'soft',selection:{start:4,end:5}});await vi.advanceTimersByTimeAsync(300);expect(m.get('state')).toMatchObject({alignmentId:second.alignment.id,selection:{start:4,end:5}});
  m.receive('alignment',{format:'msa-canvas',version:2});expect(m.get('error')).toContain('version 2 is not supported');
  m.receive('alignment',null);expect(viewer()).toBeNull();
  m.receive('state',null);m.receive('alignment',doc('third'));await vi.advanceTimersByTimeAsync(300);expect(viewer()).not.toBeNull();
  dispose();expect([...m.listeners.values()].every(set=>set.size===0)).toBe(true);
});
function widget(shinyMode:boolean) {
  const inputs:Record<string,unknown>={};let definition:any;
  new Function('HTMLWidgets','MsaCanvas','Shiny','window',rSource)({shinyMode,widget:(d:unknown)=>{definition=d;}},MsaCanvas,{setInputValue:(key:string,value:unknown)=>{inputs[key]=value;}},{Shiny:{}});
  const el=document.createElement('div');el.id='aln';document.body.append(el);
  return {inputs,definition,el,instance:definition.factory(el,800,500)};
}
it('the htmlwidgets binding renders wire JSON text and forwards selection, state and errors to Shiny',async()=>{
  const {inputs,definition,el,instance}=widget(true);expect(definition.name).toBe('msacanvas');expect(definition.type).toBe('output');
  instance.renderValue({wire:JSON.stringify({...doc(),config:{worker:false}})});await instance.getView().ready;
  expect(el.querySelector('.ak-viewer')).not.toBeNull();const viewer=instance.getView().viewer;
  vi.useFakeTimers();viewer.setSelection({start:1,end:2,rowId:'r1'});expect(inputs.aln_selection).toEqual({start:1,end:2,rowId:'r1'});
  await vi.advanceTimersByTimeAsync(300);expect(typeof inputs.aln_state).toBe('string');expect(JSON.parse(inputs.aln_state as string)).toMatchObject({version:1,selection:{start:1,end:2,rowId:'r1'},annotationFilter:{}});
  vi.useRealTimers();
  // The state text goes back through R unchanged, as msa_wire(state = input$aln_state) embeds it.
  instance.renderValue({wire:JSON.stringify({...doc(),config:{worker:false},state:JSON.parse(inputs.aln_state as string)})});await instance.getView().ready;
  expect(instance.getView().viewer).not.toBe(viewer);expect(instance.getView().viewer.getState().selection).toEqual({start:1,end:2,rowId:'r1'});expect(el.querySelectorAll('.ak-viewer')).toHaveLength(1);
  instance.resize(800,5000);instance.resize(800,100);
  instance.renderValue({wire:'{"format":"msa-canvas","version":1,"alignment":{"rows":[]}}'});expect(el.querySelector('[role=alert]')?.textContent).toBe('Invalid msa-canvas document: alignment.rows must be a non-empty array.');expect(inputs.aln_error).toContain('alignment.rows');
});
it('the htmlwidgets binding sends nothing outside Shiny and keeps a configured height on resize',async()=>{
  const {inputs,instance}=widget(false);
  instance.renderValue({wire:JSON.stringify({...doc(),config:{worker:false,height:400}})});await instance.getView().ready;
  const setOptions=vi.spyOn(instance.getView().viewer,'setOptions');instance.resize(800,900);expect(setOptions).not.toHaveBeenCalled();
  instance.getView().viewer.setSelection({start:1,end:1});expect(inputs).toEqual({});
  const yaml=readFileSync('r/msacanvas/inst/htmlwidgets/msacanvas.yaml','utf8');expect(yaml).toContain('script: msa-canvas.global.js');expect(yaml).toContain('stylesheet: style.inline.css');expect(yaml).not.toMatch(/https?:/);
});
