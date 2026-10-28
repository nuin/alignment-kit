// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {computeColumnMask,buildColumnMap,mergeColumnRanges,subtractColumnRange} from '../src/mask';
import {exportFasta,exportClustal} from '../src/export';
import {Renderer,type RenderView} from '../src/renderer';
import {AnnotationIndex} from '../src/annotations';
import {calculateStats} from '../src/analysis';
import {defaultVisibility} from '../src/visibility';
import {parseViewerConfig} from '../src/config';
import {encodeViewLink,decodeViewLink,isViewLink} from '../src/link';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.restoreAllMocks();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
// Gap counts per column 1..10: 0 0 2 4 0 0 3 4 0 0
const FASTA='>a\nAC--GT--AC\n>b\nACG-GT--AC\n>c\nAC--GTT-AC\n>d\nACG-GT--AC';
const align=(text=FASTA)=>parseAlignment(text,{alphabet:'dna'});
const viewerFor=async(options={},text=FASTA)=>{const v=createViewer(host(),{worker:false,...options});disposers.push(()=>v.destroy());await v.setAlignment(align(text));return v;};
const hiddenOf=(mask:ArrayLike<number>)=>Array.from(mask).flatMap((x,i)=>x?[]:[i+1]);
const rootOf=(v:unknown)=>(v as any).root as HTMLElement;
const scrollOf=(v:unknown)=>(v as any).scroll as HTMLElement;

it('computes the mask from gap fraction, all-gap columns and manual ranges',()=>{
  const a=align();
  expect(hiddenOf(computeColumnMask(a))).toEqual([]);
  expect(hiddenOf(computeColumnMask(a,{gapFraction:0.5}))).toEqual([3,4,7,8]);
  expect(hiddenOf(computeColumnMask(a,{gapFraction:0.75}))).toEqual([4,7,8]);
  expect(hiddenOf(computeColumnMask(a,{gapFraction:0.8}))).toEqual([4,8]);
  expect(hiddenOf(computeColumnMask(a,{gapFraction:1}))).toEqual([4,8]);
  expect(hiddenOf(computeColumnMask(a,{allGap:true}))).toEqual([4,8]);
  expect(hiddenOf(computeColumnMask(a,{gapFraction:0.25,hidden:[[1,2]]}))).toEqual([1,2,3,4,7,8]);
  expect(hiddenOf(computeColumnMask(a,{hidden:[[9,10]]}))).toEqual([9,10]);
});
it('keeps every column when the mask would hide them all and rejects bad thresholds',()=>{
  const a=align();
  expect(hiddenOf(computeColumnMask(a,{gapFraction:0}))).toEqual([]);
  expect(hiddenOf(computeColumnMask(a,{hidden:[[1,10]]}))).toEqual([]);
  expect(()=>computeColumnMask(a,{gapFraction:1.5})).toThrow(/0 to 1/);
  expect(()=>computeColumnMask(a,{gapFraction:-0.1})).toThrow(/0 to 1/);
});
it('merges overlapping and adjacent ranges and subtracts a range',()=>{
  expect(mergeColumnRanges([[10,12],[1,3],[4,5],[11,20]])).toEqual([[1,5],[10,20]]);
  expect(subtractColumnRange([[1,10],[20,30]],4,22)).toEqual([[1,3],[23,30]]);
  expect(subtractColumnRange([[5,6]],1,4)).toEqual([[5,6]]);
});
it('maps display columns to original columns and back',()=>{
  const m=buildColumnMap(computeColumnMask(align(),{gapFraction:0.5}));
  expect(m.count).toBe(6);expect([...m.cols]).toEqual([0,1,4,5,8,9]);
  expect([...m.before]).toEqual([0,1,2,2,2,3,4,4,4,5,6]);
  expect([...m.edges]).toEqual([2,4]);
  const edge=buildColumnMap(Uint8Array.from([0,0,1,1,0]));
  expect([...edge.cols]).toEqual([2,3]);expect([...edge.edges]).toEqual([0,2]);
});
it('hides gap columns from options and reports the mask',async()=>{
  const v=await viewerFor({hideGapColumns:0.5});
  expect(hiddenOf(v.getColumnMask())).toEqual([3,4,7,8]);
  v.setOptions({hideGapColumns:null,hideAllGapColumns:true});expect(hiddenOf(v.getColumnMask())).toEqual([4,8]);
  v.setOptions({hideAllGapColumns:false});expect(hiddenOf(v.getColumnMask())).toEqual([]);
  expect(()=>v.setOptions({hideGapColumns:2})).toThrow(/hideGapColumns/);
  expect(()=>v.setOptions({hideAllGapColumns:'yes' as any})).toThrow(/hideAllGapColumns/);
  expect(v.getColumnMask()).toBeInstanceOf(Uint8Array);expect(v.getColumnMask().length).toBe(10);
});
it('hides and shows columns manually and keeps merged ranges in the state',async()=>{
  const v=await viewerFor();
  v.hideColumns(3,4);v.hideColumns(5,6);v.hideColumns(9,9);
  expect(v.getState().hiddenColumns).toEqual([[3,6],[9,9]]);expect(hiddenOf(v.getColumnMask())).toEqual([3,4,5,6,9]);
  v.showColumns(4,5);expect(v.getState().hiddenColumns).toEqual([[3,3],[6,6],[9,9]]);
  v.showColumns();expect(v.getState().hiddenColumns).toEqual([]);expect(hiddenOf(v.getColumnMask())).toEqual([]);
  expect(()=>v.hideColumns(0,2)).toThrow(/range/);expect(()=>v.hideColumns(5,3)).toThrow(/range/);expect(()=>v.hideColumns(1,11)).toThrow(/range/);expect(()=>v.hideColumns(1,10)).toThrow(/visible/);
});
it('showColumns with no arguments also clears gap-based hiding',async()=>{
  const v=await viewerFor({hideGapColumns:0.5});v.hideColumns(1,1);
  v.showColumns();expect(hiddenOf(v.getColumnMask())).toEqual([]);
});
it('keeps the same column at the left edge when the mask changes',async()=>{
  const v=await viewerFor({cellWidth:16}),scroll=scrollOf(v);
  scroll.scrollLeft=8*16;expect(v.getState().start).toBe(9);
  v.hideColumns(1,4);expect(scroll.scrollLeft).toBe(4*16);expect(v.getState().start).toBe(9);
  v.showColumns();expect(scroll.scrollLeft).toBe(8*16);
});
it('sizes the scroll area by visible columns and labels the show control',async()=>{
  const v=await viewerFor({cellWidth:10,hideGapColumns:0.5}),root=rootOf(v),gutter=(v as any).gutter as number;
  expect(root.querySelector<HTMLElement>('.ak-spacer')!.style.width).toBe(`${gutter+6*10}px`);
  expect(root.querySelector('[data-action="show-columns"]')!.hasAttribute('hidden')).toBe(false);
  expect(root.querySelector('[data-action="show-columns"]')!.textContent).toBe('Show all columns (4 hidden)');
  v.showColumns();expect(root.querySelector('[data-action="show-columns"]')!.hasAttribute('hidden')).toBe(true);
});
it('selects and moves across a collapsed boundary in original coordinates',async()=>{
  const v=await viewerFor({hideGapColumns:0.5}),scroll=scrollOf(v);
  const press=(key:string,shiftKey=false)=>scroll.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true}));
  v.setSelection({start:2,end:5});expect(v.getState().selection).toEqual({start:2,end:5});
  v.setSelection({start:2,end:2});press('ArrowRight');expect(v.getState().selection).toMatchObject({start:5,end:5});
  press('ArrowLeft');expect(v.getState().selection).toMatchObject({start:2,end:2});
  press('ArrowRight',true);expect(v.getState().selection).toMatchObject({start:2,end:5});
  press('End');expect(v.getState().selection).toMatchObject({start:10});press('Home');expect(v.getState().selection).toMatchObject({start:1});
});
it('maps pointer positions to original columns',async()=>{
  const v=await viewerFor({cellWidth:16,hideGapColumns:0.5}),gutter=(v as any).gutter as number;
  scrollOf(v).getBoundingClientRect=()=>({left:0,top:0,right:500,bottom:500,width:500,height:500,x:0,y:0,toJSON(){}}) as DOMRect;
  const at=(display:number)=>(v as any).eventAt({clientX:gutter+display*16+4,clientY:4});
  expect(at(1)?.start).toBe(2);expect(at(2)?.start).toBe(5);expect(at(5)?.start).toBe(10);expect(at(6)).toBeNull();
});
it('refuses go-to on a hidden column and goes to visible ones',async()=>{
  const v=await viewerFor({hideGapColumns:0.5}),root=rootOf(v);
  expect((v as any).goTo('3')).toBe(false);expect(root.querySelector('.ak-message')!.textContent).toMatch(/Column 3 is hidden/);
  expect((v as any).goTo('5')).toBe(true);expect(v.getState().selection).toMatchObject({start:5,end:5});
  expect(v.goToResidue('seq-2',3)).toBe(false);
  expect(v.goToResidue('seq-2',4)).toBe(true);
});
it('scrolls a selection to its display position',async()=>{
  const v=await viewerFor({cellWidth:16,hideGapColumns:0.5}),scroll=scrollOf(v);
  Object.defineProperty(scroll,'clientWidth',{value:(v as any).gutter+48,configurable:true});
  v.setSelection({start:10,end:10});expect(scroll.scrollLeft).toBe(Math.max(0,5*16-24));
});
it('hides the selected columns from the toolbar control and shows them again',async()=>{
  const v=await viewerFor(),root=rootOf(v);
  const click=(action:string)=>root.querySelector<HTMLElement>(`[data-action="${action}"]`)!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  click('hide-columns');expect(v.getState().hiddenColumns).toEqual([]);expect(root.querySelector('.ak-message')!.textContent).toMatch(/Select columns/);
  v.setSelection({start:3,end:4});click('hide-columns');
  expect(v.getState().hiddenColumns).toEqual([[3,4]]);expect(v.getState().selection).toBeNull();
  click('show-columns');expect(v.getState().hiddenColumns).toEqual([]);
});
it('hides the controls with the columnMasking visibility flag',async()=>{
  const v=await viewerFor({visibility:{columnMasking:false}}),root=rootOf(v);
  expect(root.querySelector('[data-action="hide-columns"]')!.hasAttribute('hidden')).toBe(true);
  v.setOptions({visibility:{columnMasking:true}});expect(root.querySelector('[data-action="hide-columns"]')!.hasAttribute('hidden')).toBe(false);
});
it('restores hidden columns through setState and keeps them after removeRows',async()=>{
  const v=await viewerFor();v.hideColumns(3,4);const state=v.getState();
  v.showColumns();await v.setState(state);expect(hiddenOf(v.getColumnMask())).toEqual([3,4]);
  await v.removeRows(['seq-1']);expect(hiddenOf(v.getColumnMask())).toEqual([3,4]);
  await expect(v.setState({...v.getState(),hiddenColumns:[[1,99]]})).rejects.toThrow(/hidden columns/);
  await expect(v.setState({...v.getState(),hiddenColumns:[[1,10]]})).rejects.toThrow(/hidden columns/);
});
it('drops manual hiding when a different alignment loads',async()=>{
  const v=await viewerFor();v.hideColumns(3,4);await v.setAlignment(align('>x\nACGT\n>y\nACGA'));
  expect(v.getState().hiddenColumns).toEqual([]);expect(v.getColumnMask().length).toBe(4);
});
it('writes and reads hide in view links',async()=>{
  const v=await viewerFor();v.hideColumns(2,3);v.hideColumns(7,7);
  const link=v.getViewLink();expect(new URLSearchParams(link).get('hide')).toBe('2-3,7');
  expect(decodeViewLink(link).hiddenColumns).toEqual([[2,3],[7,7]]);expect(isViewLink('hide=1-2')).toBe(true);
  expect(decodeViewLink('hide=10-20,30-35').hiddenColumns).toEqual([[10,20],[30,35]]);
  expect(decodeViewLink('hide=5,1-3,2-4').hiddenColumns).toEqual([[1,5]]);expect(decodeViewLink('hide=7,1-3').hiddenColumns).toEqual([[1,3],[7,7]]);
  for(const bad of ['hide=a','hide=3-1','hide=0-2','hide=1-2,x','hide='])expect(decodeViewLink(bad)).toMatchObject({ignored:['hide']});
  expect(encodeViewLink({...v.getState(),hiddenColumns:[]})).not.toContain('hide');
  v.showColumns();expect(await v.applyViewLink(link)).toEqual([]);expect(hiddenOf(v.getColumnMask())).toEqual([2,3,7]);
  expect(await v.applyViewLink('scheme=soft-nucleotide&zoom=16')).toEqual([]);expect(hiddenOf(v.getColumnMask())).toEqual([]);
  expect(await v.applyViewLink('hide=5-99')).toEqual(['hide']);expect(hiddenOf(v.getColumnMask())).toEqual([]);
});
it('exports visible columns only on request and leaves default exports unmasked',async()=>{
  const a=align(),mask=computeColumnMask(a,{gapFraction:0.5});
  expect(exportFasta(a,{rowIds:['seq-2'],columns:mask},{lineWidth:0})).toBe('>b\nACGTAC\n');
  expect(exportFasta(a,{rowIds:['seq-2']},{lineWidth:0})).toBe('>b\nACG-GT--AC\n');
  expect(exportFasta(a,{rowIds:['seq-2'],start:2,end:6,columns:mask},{lineWidth:0})).toBe('>b\nCGT\n');
  expect(exportClustal(a,{rowIds:['seq-1','seq-2'],columns:mask})).toContain('ACGTAC');
  expect(()=>exportFasta(a,{start:3,end:4,columns:mask})).toThrow(/No visible columns/);
  expect(()=>exportFasta(a,{columns:[1,0]})).toThrow(/one entry per alignment column/);
  const v=await viewerFor({hideGapColumns:0.5});
  v.setSelection({start:2,end:5,rowId:'seq-2'});
  expect(v.getSelectionText()).toContain('>b\nCG-G\n');
  v.setOptions({fasta:{columns:'visible'}});
  expect(v.getSelectionText()).toContain('>b\nCG\n');
  expect(v.getState().hiddenColumns).toEqual([]);
});
it('writes the FASTA download for visible columns and the full alignment otherwise',async()=>{
  const v=await viewerFor({hideGapColumns:0.5}),files:{name:string;blob:Blob}[]=[];
  let pending:Blob|undefined;
  URL.createObjectURL=(blob:Blob|MediaSource)=>{pending=blob as Blob;return 'blob:test';};URL.revokeObjectURL=()=>{};
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){files.push({name:this.download,blob:pending!});});
  await (v as any).export('fasta-all');await (v as any).export('fasta-visible');
  expect(files.map(f=>f.name)).toEqual(['alignment.fasta','visible-columns.fasta']);
  const read=(blob:Blob)=>new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(blob);});
  expect((await read(files[0].blob)).split('\n')[1]).toBe('AC--GT--AC');
  expect((await read(files[1].blob)).split('\n')[1]).toBe('ACGTAC');
});
it('lists the visible-columns export and FASTA option in the menus',async()=>{
  const v=await viewerFor(),root=rootOf(v);
  expect([...root.querySelector<HTMLSelectElement>('select[aria-label="Export alignment"]')!.options].map(o=>o.value)).toContain('fasta-visible');
  v.setOptions({fasta:{columns:'visible'}});expect(root.querySelector<HTMLSelectElement>('select[aria-label="FASTA columns"]')!.value).toBe('visible');
  expect(()=>v.setOptions({fasta:{columns:'some' as any}})).toThrow(/columns/);
});
it('validates masking options in configuration',()=>{
  expect(parseViewerConfig({hideGapColumns:0.8,hideAllGapColumns:true,fasta:{columns:'visible'},visibility:{columnMasking:false}})).toEqual({hideGapColumns:0.8,hideAllGapColumns:true,fasta:{columns:'visible'},visibility:{columnMasking:false}});
  expect(parseViewerConfig({hideGapColumns:null})).toEqual({hideGapColumns:null});
  expect(()=>parseViewerConfig({hideGapColumns:1.1})).toThrow(/hideGapColumns/);expect(()=>parseViewerConfig({hideGapColumns:'0.5'})).toThrow(/hideGapColumns/);
  expect(()=>parseViewerConfig({hideAllGapColumns:1})).toThrow(/hideAllGapColumns/);expect(()=>parseViewerConfig({fasta:{columns:'x'}})).toThrow(/columns/);
  expect(defaultVisibility.columnMasking).toBe(true);
});

type Call={fn:string;args:any[]};
const fakeCanvas=(calls:Call[])=>{
  const ctx:any=new Proxy({canvas:{}},{get:(t:any,k)=>k in t?t[k]:(...args:any[])=>{calls.push({fn:String(k),args});},set:(t,k,val)=>{t[k]=val;return true;}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx);return document.createElement('canvas');
};
const baseView=(a:ReturnType<typeof align>,hidden:[number,number][],extra:Partial<RenderView>={}):RenderView=>({a,stats:calculateStats(a),rows:[1],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'soft',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,columns:buildColumnMap(computeColumnMask(a,{hidden})),...extra});
it('draws only kept columns at display positions',()=>{
  const a=align(),calls:Call[]=[],canvas=fakeCanvas(calls);
  new Renderer().body(canvas,baseView(a,[[3,8]]),64,22);
  const xs=calls.filter(c=>c.fn==='drawImage').map(c=>c.args[5]);
  expect(xs).toEqual([0,16,32,48]);
  const atlas=calls.filter(c=>c.fn==='drawImage').map(c=>c.args[1]/c.args[3]);
  expect(atlas.map(n=>String.fromCharCode(n))).toEqual([...'ACAC']);
});
it('draws a boundary line only when columns are hidden',()=>{
  const a=align(),dash=(hidden:[number,number][])=>{const calls:Call[]=[];new Renderer().body(fakeCanvas(calls),baseView(a,hidden),160,22);return calls.filter(c=>c.fn==='setLineDash'&&c.args[0].length).length;};
  expect(dash([])).toBe(0);expect(dash([[3,4]])).toBeGreaterThan(0);
});
it('places search hit boxes and selections across hidden columns',()=>{
  const a=align(),calls:Call[]=[],canvas=fakeCanvas(calls);
  const hit={rowId:'seq-2',row:1,start:2,end:5,seqStart:2,seqEnd:4,strand:'+' as const,match:'CG-G'}
  new Renderer().body(canvas,baseView(a,[[3,4]],{hits:new Map([[1,[hit]]]),selection:{start:1,end:6}}),160,22);
  const box=calls.find(c=>c.fn==='strokeRect'&&c.args[0]===17);
  expect(box?.args[2]).toBe(2*16-2);
  const selection=calls.filter(c=>c.fn==='strokeRect').at(-1)!;
  expect(selection.args[0]).toBe(.75);expect(selection.args[2]).toBe(4*16-1.5);
});
it('skips hit boxes and annotation marks that lie entirely in hidden columns',()=>{
  const a=align(),calls:Call[]=[],canvas=fakeCanvas(calls);
  const hit={rowId:'seq-2',row:1,start:3,end:4,seqStart:3,seqEnd:3,strand:'+' as const,match:'G-'};
  const note={id:'n',rowId:'seq-2',label:'x',start:3,end:4,mapping:'mapped' as const},inside={id:'m',rowId:'seq-2',label:'y',start:2,end:5,mapping:'mapped' as const};
  new Renderer().body(canvas,baseView(a,[[3,4]],{hits:new Map([[1,[hit]]]),annotations:new AnnotationIndex([note,inside])}),160,22);
  const rects=calls.filter(c=>c.fn==='strokeRect');
  expect(rects).toHaveLength(1);expect(rects[0].args.slice(0,3)).toEqual([17,1,2*16-2]);
});
const rulerLabels=(a:ReturnType<typeof align>,hidden:[number,number][],ruler:'alignment'|'reference',cw=16)=>{
  const out:[string,number][]=[],ctx:any=new Proxy({fillText:(t:string,x:number)=>out.push([t,x])},{get:(t:any,k)=>k in t?t[k]:()=>{},set:(t,k,val)=>{t[k]=val;return true;}});
  const canvas:any={width:0,height:0,style:{},getContext:()=>ctx};
  new Renderer().tracks(canvas,{...baseView(a,hidden),cw,rows:[],visibility:{...defaultVisibility,modalFrequency:false,gapFraction:false,consensus:false,reference:false},ruler},500);
  return out;
};
it('labels the ruler with original column numbers and marks each collapsed boundary',()=>{
  const a=align('>r\n'+'ACGTACGTAC'.repeat(3)+'\n>s\n'+'ACGTACGTAC'.repeat(3));
  expect(rulerLabels(a,[],'alignment').map(l=>l[0])).toEqual(['1','10','20','30']);
  const masked=rulerLabels(a,[[11,20]],'alignment');
  expect(masked.map(l=>l[0])).toEqual(['1','10','30']);expect(masked.map(l=>l[1])).toEqual([8,9*16+8,19*16+8]);
  const wide=rulerLabels(a,[[5,20]],'alignment');
  expect(wide.map(l=>l[0])).toEqual(['1','21','30']);expect(wide.map(l=>l[1])).toEqual([8,4*16+8,13*16+8]);
  const calls:Call[]=[];const canvas=fakeCanvas(calls);
  new Renderer().tracks(canvas,baseView(a,[[5,20]],{visibility:{...defaultVisibility,modalFrequency:false,gapFraction:false,consensus:false,reference:false}}),400);
  const caps=calls.filter(c=>c.fn==='fillRect'&&c.args[2]===4&&c.args[3]===9);
  expect(caps).toHaveLength(1);expect(caps[0].args[0]).toBe(4*16-2);
});
it('numbers reference residues through hidden columns',()=>{
  const a=align('>ref\nACGTACGTAC'+'ACGTA-----'+'ACGTACGTAC'+'\n>s\n'+'ACGTACGTAC'.repeat(3));
  const labels=rulerLabels(a,[[11,20]],'reference');
  expect(labels.map(l=>l[0])).toEqual(['1','10','20']);expect(labels[2][1]).toBe(14*16+8);
});
it('maps the overview to visible columns',()=>{
  const a=align(),calls:Call[]=[],canvas=fakeCanvas(calls);
  new Renderer().overview(canvas,baseView(a,[[3,8]]),4);
  expect(calls.filter(c=>c.fn==='fillRect').length).toBeGreaterThan(1);
});
it('calls custom track renderers once per run of adjacent kept columns',()=>{
  const a=align(),calls:Call[]=[],canvas=fakeCanvas(calls),seen:[number,number,number][]=[];
  const track={id:'t',label:'t',type:'custom' as const,render:(_c:CanvasRenderingContext2D,i:{start:number;end:number;offsetX:number})=>{seen.push([i.start,i.end,i.offsetX]);}};
  new Renderer().tracks(canvas,baseView(a,[[3,4],[8,8]],{tracks:[track],visibility:{...defaultVisibility,ruler:false,modalFrequency:false,gapFraction:false,consensus:false,reference:false}}),400);
  expect(seen).toEqual([[1,2,0],[5,7,32],[9,10,80]]);
  seen.length=0;new Renderer().tracks(canvas,baseView(a,[],{tracks:[track],visibility:{...defaultVisibility,ruler:false,modalFrequency:false,gapFraction:false,consensus:false,reference:false}}),400);
  expect(seen).toEqual([[1,10,0]]);
});
it('draws built-in and value tracks at original columns',()=>{
  const a=align(),calls:Call[]=[],canvas=fakeCanvas(calls);
  const track={id:'v',label:'v',type:'bar' as const,values:[0,0,0,0,1,0,0,0,0,0]};
  new Renderer().tracks(canvas,baseView(a,[[3,4]],{tracks:[track],visibility:{...defaultVisibility,ruler:false,modalFrequency:false,gapFraction:false,consensus:false,reference:false}}),400);
  const bars=calls.filter(c=>c.fn==='fillRect'&&c.args[1]>0&&c.args[3]>10);
  expect(bars.map(c=>c.args[0])).toEqual([2*16]);
});
it('keeps the JSON schema in step with the masking options',async()=>{
  const {readFileSync}=await import('node:fs'),schema=JSON.parse(readFileSync('config/viewer-config.schema.json','utf8'));
  expect(schema.properties.hideGapColumns).toMatchObject({type:['number','null'],minimum:0,maximum:1});
  expect(schema.properties.hideAllGapColumns.type).toBe('boolean');
  expect(schema.properties.visibility.properties.columnMasking.type).toBe('boolean');
  expect(schema.properties.fasta.properties.columns.enum).toEqual(['all','visible']);
  expect(Object.keys(schema.properties.visibility.properties).sort()).toEqual(Object.keys(defaultVisibility).sort());
});
it('keeps gap hiding when manual ranges would hide the rest',async()=>{
  const a=align();
  expect(hiddenOf(computeColumnMask(a,{gapFraction:0.5,hidden:[[1,2],[5,6],[9,10]]}))).toEqual([3,4,7,8]);
  expect(hiddenOf(computeColumnMask(a,{gapFraction:0,hidden:[[2,3]]}))).toEqual([2,3]);
  const v=await viewerFor({hideGapColumns:0.5});
  v.hideColumns(1,2);v.hideColumns(5,6);expect(()=>v.hideColumns(9,10)).toThrow(/visible/);
  expect(hiddenOf(v.getColumnMask())).toEqual([1,2,3,4,5,6,7,8]);expect(v.getState().hiddenColumns).toEqual([[1,2],[5,6]]);
  await expect(v.setState({...v.getState(),hiddenColumns:[[1,2],[5,6],[9,10]]})).rejects.toThrow(/hidden columns/);
});
it('rejects showColumns ranges that stay hidden or exceed the width',async()=>{
  const v=await viewerFor({hideGapColumns:0.5});
  expect(()=>v.showColumns(3,3)).toThrow(/hideGapColumns/);expect(()=>v.showColumns(5,9999)).toThrow(/range/);
  v.hideColumns(1,1);v.showColumns(1,1);expect(v.getState().hiddenColumns).toEqual([]);
});
