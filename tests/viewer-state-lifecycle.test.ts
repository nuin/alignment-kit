// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {mountViewer} from '../src/integration';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const FASTA='>a\nAAGC\n>b\nAC-G\n>c\nTTGC';
const data=(text=FASTA)=>parseAlignment(text,{alphabet:'dna'});
const viewerFor=async(options={})=>{const v=createViewer(host(),{worker:false,...options});disposers.push(()=>v.destroy());await v.setAlignment(data());return v;};
const priv=(v:unknown)=>v as any;
const rootOf=(v:unknown)=>priv(v).root as HTMLElement;
const stubCanvas=()=>vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(new Proxy({},{get:()=>()=>{},set:()=>true}) as any);
/** Give the grid a size so render() runs past its width check. */
const sized=(v:unknown)=>{Object.defineProperty(priv(v).scroll,'clientHeight',{value:300,configurable:true});Object.defineProperty(rootOf(v).querySelector('.ak-main'),'clientWidth',{value:400,configurable:true});stubCanvas();};
const pointer=(target:Element,type:string,clientX:number)=>{const event=new MouseEvent(type,{clientX,clientY:5,bubbles:true,cancelable:true});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);};

it('emits viewport once per distinct viewport, and again after a filter or a load',async()=>{
  const v=await viewerFor(),seen:any[]=[];sized(v);v.on('viewport',e=>seen.push(e));
  priv(v).render();priv(v).render();priv(v).render();expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({start:1,end:4,firstRow:0,totalRows:3});
  v.setFilter('b');priv(v).render();expect(seen).toHaveLength(2);expect(seen[1].lastRow).toBe(1);
  priv(v).render();expect(seen).toHaveLength(2);
  await v.setAlignment(data('>x\nAAGC\n>y\nAC-G'));priv(v).render();expect(seen).toHaveLength(3);expect(seen[2].totalRows).toBe(2);
  await v.setAlignment(data('>p\nAAGC\n>q\nAC-G'));priv(v).render();expect(seen).toHaveLength(4);
});
it('skips setOptions when mountViewer.update receives an equal options object',async()=>{
  const c=mountViewer(host(),{alignment:data(),options:{worker:false,height:500,visibility:{overview:false},fasta:{lineWidth:60}}});disposers.push(()=>c.destroy());
  await vi.waitFor(()=>expect(c.viewer.getStatistics()).toBeDefined());
  const layout=vi.spyOn(priv(c.viewer),'layout'),close=vi.spyOn(priv(c.viewer).menus,'close'),alignment=c.viewer.getAlignment();
  for(let i=0;i<5;i++)c.update({alignment,options:{worker:false,height:500,visibility:{overview:false},fasta:{lineWidth:60}},onViewportChange:()=>{}});
  expect(layout).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  c.update({alignment,options:{worker:false,height:520,visibility:{overview:false},fasta:{lineWidth:60}}});
  expect(layout).toHaveBeenCalledTimes(1);expect(rootOf(c.viewer).style.height).toBe('520px');
  c.update({alignment,options:{worker:false,height:520,visibility:{overview:true},fasta:{lineWidth:60}}});expect(layout).toHaveBeenCalledTimes(2);
});
it('merges options: a key dropped from the next options object keeps its value',async()=>{
  const c=mountViewer(host(),{options:{worker:false,theme:'dark',cellWidth:20}});disposers.push(()=>c.destroy());
  c.update({options:{worker:false,cellWidth:10}});
  expect(rootOf(c.viewer).dataset.theme).toBe('dark');expect(priv(c.viewer).options.cellWidth).toBe(10);
});
it('rebuilds row labels when row checks or strand flags change, and not on a plain redraw',async()=>{
  const v=await viewerFor(),root=rootOf(v);sized(v);priv(v).render();
  const box=()=>root.querySelector<HTMLInputElement>('[data-select-row="seq-2"]')!,first=box();
  priv(v).render();expect(box()).toBe(first);
  first.checked=true;first.dispatchEvent(new Event('change',{bubbles:true}));priv(v).render();
  expect(box()).not.toBe(first);expect(box().checked).toBe(true);expect(v.getSelectedRowIds()).toEqual(['seq-2']);
  await priv(v).action('clear-rows');priv(v).render();expect(box().checked).toBe(false);
  v.setRowStrand('seq-2','-');priv(v).render();expect(root.querySelector('[data-strand="seq-2"]')!.getAttribute('aria-pressed')).toBe('true');
  await v.setState({...v.getState(),reverseStrandRowIds:[]});priv(v).render();expect(root.querySelector('[data-strand="seq-2"]')!.getAttribute('aria-pressed')).toBe('false');
  v.clear();expect(priv(v).labelKey).toBe('');
});
it('keeps filter, hidden rows, reference, selection, marks and strands across an alphabet switch',async()=>{
  const v=await viewerFor();
  v.setFilter('b');v.hideRows(['seq-3']);v.setReference('seq-2');v.setSelection({start:2,end:3,rowId:'seq-2'});v.markColumns([[1,2]]);v.hideColumns(4,4);v.setRowStrand('seq-1','-');
  const before=v.getState(),selection=vi.fn();v.on('selection',selection);
  priv(v).applyAlphabet('rna');await vi.waitFor(()=>expect(v.getAlignment()?.alphabet).toBe('rna'));await vi.waitFor(()=>expect(v.getStatistics()).toBeDefined());
  const after=v.getState();
  expect(after.query).toBe('b');expect(after.hiddenRowIds).toEqual(['seq-3']);expect(after.referenceId).toBe('seq-2');expect(after.selection).toEqual({start:2,end:3,rowId:'seq-2'});
  expect(after.columnMarks).toEqual(before.columnMarks);expect(after.hiddenColumns).toEqual([[4,4]]);expect(after.reverseStrandRowIds).toEqual(['seq-1']);
  expect(rootOf(v).querySelector<HTMLInputElement>('[aria-label="Filter sequences"]')!.value).toBe('b');
  expect(selection).not.toHaveBeenCalled();
});
it('emits selection when a new alignment or a row removal drops the selection',async()=>{
  const v=await viewerFor(),seen:any[]=[];
  v.setSelection({start:1,end:2,rowId:'seq-2'});v.on('selection',s=>seen.push(s));
  await v.removeRows(['seq-3']);expect(seen).toEqual([]);
  await v.removeRows(['seq-2']);expect(seen).toEqual([null]);
  await v.setAlignment(data());expect(seen).toEqual([null]);
  v.setSelection({start:3,end:3});expect(seen).toHaveLength(2);
  let ready=false;v.on('ready',()=>{ready=true;});v.on('selection',()=>expect(ready).toBe(false));
  await v.setAlignment(data('>x\nAAGC'));expect(seen).toEqual([null,{start:3,end:3},null]);expect(ready).toBe(true);
});
it('rejects a bad setOptions call with an error event and applies none of it',async()=>{
  const v=await viewerFor({theme:'light'}),errors:Error[]=[];v.on('error',e=>errors.push(e));
  const track={id:'t',label:'T',type:'bar' as const,values:[1,2,3,4]};
  expect(()=>v.setOptions({theme:'dark',colorScheme:'no-such-scheme'})).toThrow();expect(errors).toHaveLength(1);
  expect(()=>v.setOptions({theme:'dark',rulerCoordinates:'bogus' as any})).toThrow('Unknown ruler coordinate mode.');expect(errors).toHaveLength(2);
  expect(()=>v.setOptions({theme:'dark',cellWidth:30,annotationLinks:{uniprot:'https://example.org/{id}'},tracks:[track],fasta:{gaps:'bogus' as any}})).toThrow();expect(errors).toHaveLength(3);
  expect(()=>v.setOptions({annotationLinks:{uniprot:'https://example.org/{id}'},tracks:[track],export:{columns:'bogus' as any}})).toThrow();expect(errors).toHaveLength(4);
  expect(rootOf(v).dataset.theme).toBe('light');expect(priv(v).options.cellWidth).toBe(16);expect(priv(v).options.annotationLinks).toEqual({});expect(v.getTracks()).toEqual([]);
  expect(rootOf(v).querySelector('.ak-message')!.textContent).not.toBe('');
});
it('mountViewer.update reports a bad options prop through onError once and does not throw',async()=>{
  const onError=vi.fn(),c=mountViewer(host(),{options:{worker:false},onError});disposers.push(()=>c.destroy());
  expect(()=>c.update({options:{worker:false,colorScheme:'no-such-scheme'},onError})).not.toThrow();expect(onError).toHaveBeenCalledTimes(1);
  c.update({options:{worker:false,colorScheme:'no-such-scheme'},onError});expect(onError).toHaveBeenCalledTimes(1);
  c.update({options:{worker:false,theme:'dark'},onError});expect(onError).toHaveBeenCalledTimes(1);expect(rootOf(c.viewer).dataset.theme).toBe('dark');
});
it('clears loading when a load is superseded by a URL load that fails',async()=>{
  const v=await viewerFor(),first=v.load(FASTA);expect(priv(v).loading).toBe(true);
  await expect(v.loadUrl('ftp://example.org/a.fasta')).rejects.toThrow('HTTP or HTTPS');await first;
  expect(priv(v).loading).toBe(false);
});
it('clears loading when a load is superseded by an invalid setAlignment',async()=>{
  const v=await viewerFor(),first=v.load(FASTA);expect(priv(v).loading).toBe(true);
  await expect(v.setAlignment({...data(),rows:[]})).rejects.toThrow('Invalid alignment model');await first;
  expect(priv(v).loading).toBe(false);
});
it('keeps loading set while a newer load is still running after an older URL load fails',async()=>{
  const v=await viewerFor();let fail!:(e:Error)=>void;
  vi.stubGlobal('fetch',()=>new Promise((_,reject)=>{fail=reject;}));
  const url=v.loadUrl('https://example.org/a.fasta'),second=v.load(FASTA);fail(new Error('network'));
  await expect(url).rejects.toThrow('network');expect(priv(v).loading).toBe(true);
  await second;expect(priv(v).loading).toBe(false);
});
it('restores the previous order and rebuilds rows when the identity comparison fails',async()=>{
  const v=await viewerFor(),errors:Error[]=[];v.on('error',e=>errors.push(e));await v.setSort('name');
  priv(v).ranking.identities=()=>Promise.reject(new Error('identity failed'));
  await v.setState({...v.getState(),sort:'identity',hiddenRowIds:['seq-2']});
  expect(errors.map(e=>e.message)).toEqual(['identity failed']);
  expect(v.getState().sort).toBe('name');expect(rootOf(v).querySelector<HTMLSelectElement>('[aria-label="Sequence order"]')!.value).toBe('name');
  expect(v.getVisibleRows()).not.toContain('seq-2');expect(priv(v).rows.map((i:number)=>v.getAlignment()!.rows[i].id)).not.toContain('seq-2');
});
it('ends an overview drag and a label resize on pointercancel and lostpointercapture',async()=>{
  const v=await viewerFor(),root=rootOf(v),overview=root.querySelector<HTMLElement>('.ak-overview')!,separator=root.querySelector<HTMLElement>('.ak-gutter-resize')!,scroll=priv(v).scroll as HTMLElement;
  for(const node of [overview,separator])(node as any).setPointerCapture=()=>{};
  overview.getBoundingClientRect=()=>({left:0,top:0,width:100,height:10,right:100,bottom:10,x:0,y:0,toJSON(){}});
  for(const end of ['pointercancel','lostpointercapture','pointerup']){
    pointer(overview,'pointerdown',50);const at=scroll.scrollLeft;pointer(overview,'pointermove',100);expect(scroll.scrollLeft).not.toBe(at);
    pointer(overview,end,100);const rest=scroll.scrollLeft;pointer(overview,'pointermove',0);expect(scroll.scrollLeft).toBe(rest);
    pointer(separator,'pointerdown',100);pointer(separator,'pointermove',120);const width=priv(v).options.labelWidth;expect(width).toBe(250);
    pointer(separator,end,120);pointer(separator,'pointermove',200);expect(priv(v).options.labelWidth).toBe(width);v.setOptions({labelWidth:230});
  }
});
it('loadUrl keeps the parser message for a fetched file that does not parse, and the CORS hint for a fetch failure',async()=>{
  const v=await viewerFor(),errors:Error[]=[];v.on('error',e=>errors.push(e));
  vi.stubGlobal('fetch',async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode('this is not an alignment').buffer}));
  const parse=await v.loadUrl('https://example.org/a.txt').then(()=>new Error('resolved'),e=>e as Error);
  expect(parse).toBeInstanceOf(Error);expect(parse.message).not.toMatch(/CORS|Could not load this URL/);expect(errors).toHaveLength(1);expect(errors[0].message).toBe(parse.message);expect(priv(v).loading).toBe(false);
  vi.stubGlobal('fetch',async()=>{throw new TypeError('Failed to fetch');});
  await expect(v.loadUrl('https://example.org/a.fasta')).rejects.toThrow(/Could not load this URL: Failed to fetch.*CORS/);expect(errors).toHaveLength(2);
});

it('passes limit Infinity through the viewer summary request without the 50,000 cap',async()=>{
  const v=await viewerFor(),core=priv(v).core??priv(v);
  const r=await v.getVariableColumns({limit:Infinity});expect(r.truncated).toBe(false);
  expect([...core.summaryCache.values()].map((e:any)=>e.limit)).toContain(Infinity);
});
