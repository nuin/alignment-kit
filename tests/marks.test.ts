// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {createAlignment} from '../src/model';
import {Renderer,type RenderView} from '../src/renderer';
import {AnnotationIndex} from '../src/annotations';
import {calculateStats} from '../src/analysis';
import {defaultVisibility} from '../src/visibility';
import {parseViewerConfig} from '../src/config';
import {encodeViewLink,decodeViewLink,isViewLink} from '../src/link';
import {renderPanel} from '../src/viewer/panel';
import {addMarks,removeMarks,unmarked,marksFromRanges,defaultMarkColor} from '../src/marks';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.restoreAllMocks();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const FASTA='>a\nACGTACGTACGTACGTACGT\n>b\nACGTACGTACGTACGTACGA\n>c\nACGAACGTACGTACGTACGT';
const align=()=>parseAlignment(FASTA,{alphabet:'dna'});
const viewerFor=async(options={}):Promise<any>=>{const v=createViewer(host(),{worker:false,...options});disposers.push(()=>v.destroy());await v.setAlignment(align());return v;};
const P=defaultMarkColor;
const click=(target:HTMLElement,x:number,y:number,altKey=false)=>target.dispatchEvent(new MouseEvent('click',{clientX:x,clientY:y,altKey,bubbles:true}));
const cellX=(v:any,column:number)=>v.gutter+(column-1)*v.options.cellWidth+2;

it('marks, merges, recolors and unmarks column ranges',async()=>{
  const v=await viewerFor();
  v.markColumns([3,[5,6],4]);
  expect(v.getColumnMarks()).toEqual([{start:3,end:6,color:P}]);
  v.markColumns([[5,8]],'#ff0000');
  expect(v.getColumnMarks()).toEqual([{start:3,end:4,color:P},{start:5,end:8,color:'#ff0000'}]);
  v.unmarkColumns([[4,5]]);
  expect(v.getColumnMarks()).toEqual([{start:3,end:3,color:P},{start:6,end:8,color:'#ff0000'}]);
  v.getColumnMarks()[0].start=1;expect(v.getColumnMarks()[0].start).toBe(3);
  v.unmarkColumns();expect(v.getColumnMarks()).toEqual([]);
});
it('rejects ranges outside the alignment, bad colors and calls before a load',async()=>{
  const v=await viewerFor();
  for(const bad of [[0],[21],[[5,4]],[[1.5,3]]])expect(()=>v.markColumns(bad as any)).toThrow(/1 to 20/);
  expect(()=>v.markColumns([1],'red')).toThrow(/hex/);expect(()=>v.unmarkColumns([25])).toThrow(/1 to 20/);
  expect(v.getColumnMarks()).toEqual([]);
  const empty=createViewer(host(),{worker:false});disposers.push(()=>empty.destroy());
  expect(()=>empty.markColumns([1])).toThrow(/Load an alignment/);expect(empty.getColumnMarks()).toEqual([]);
});
it('computes mark algebra on ranges',()=>{
  const m=addMarks([],[[2,4],[8,9]],'#111111');
  expect(unmarked(m,1,10)).toEqual([[1,1],[5,7],[10,10]]);expect(unmarked(m,2,4)).toEqual([]);
  expect(removeMarks(m,[[3,8]])).toEqual([{start:2,end:2,color:'#111111'},{start:9,end:9,color:'#111111'}]);
  expect(marksFromRanges([[1,3],[9,9]],[{start:2,end:2,color:'#abcdef'}])).toEqual([{start:1,end:1,color:P},{start:2,end:2,color:'#abcdef'},{start:3,end:3,color:P},{start:9,end:9,color:P}]);
});
it('toggles a mark with Alt-click on the grid and the ruler and ignores plain clicks',async()=>{
  const v=await viewerFor(),scroll=v.scroll as HTMLElement;
  click(scroll,cellX(v,4),5);expect(v.getColumnMarks()).toEqual([]);const picked=v.getState().selection;expect(picked?.start).toBe(4);
  click(scroll,cellX(v,4),5,true);expect(v.getColumnMarks()).toEqual([{start:4,end:4,color:P}]);
  expect(v.getState().selection).toEqual(picked);
  click(scroll,cellX(v,5),5,true);expect(v.getColumnMarks()).toEqual([{start:4,end:5,color:P}]);
  click(scroll,cellX(v,4),5,true);expect(v.getColumnMarks()).toEqual([{start:5,end:5,color:P}]);
  const tracks=v.root.querySelector('.ak-tracks') as HTMLElement;
  click(tracks,cellX(v,9),5,true);expect(v.getColumnMarks()).toEqual([{start:5,end:5,color:P},{start:9,end:9,color:P}]);
  expect(v.root.querySelector('.ak-live').textContent).toBe('Marked column 9');
});
it('disables Alt-click when visibility.columnMarks is false',async()=>{
  const v=await viewerFor({visibility:{columnMarks:false}});
  click(v.scroll,cellX(v,4),5,true);expect(v.getColumnMarks()).toEqual([]);
  v.markColumns([2]);expect(v.getColumnMarks()).toHaveLength(1);
  expect(defaultVisibility.columnMarks).toBe(true);expect(parseViewerConfig({visibility:{columnMarks:false}})).toEqual({visibility:{columnMarks:false}});
});
it('marks and unmarks the selection from the Position tab button',async()=>{
  const v=await viewerFor(),button=()=>v.root.querySelector('[data-action="mark-columns"]') as HTMLButtonElement;
  expect(button()).toBeNull();
  v.setSelection({start:3,end:5});renderPanel(v);
  expect(button().textContent).toBe('Mark columns');button().click();
  expect(v.getColumnMarks()).toEqual([{start:3,end:5,color:P}]);
  renderPanel(v);expect(button().textContent).toBe('Unmark columns');
  v.setSelection({start:4,end:4});renderPanel(v);expect(button().textContent).toBe('Unmark column');
  button().click();expect(v.getColumnMarks()).toEqual([{start:3,end:3,color:P},{start:5,end:5,color:P}]);
  renderPanel(v);expect(button().textContent).toBe('Mark column');
  v.setOptions({visibility:{columnMarks:false}});renderPanel(v);v.layout();expect(button().hidden).toBe(true);
});
it('keeps existing mark colors when the button marks a range',async()=>{
  const v=await viewerFor();v.markColumns([4],'#00ff00');v.setSelection({start:3,end:5});renderPanel(v);
  (v.root.querySelector('[data-action="mark-columns"]') as HTMLButtonElement).click();
  expect(v.getColumnMarks()).toEqual([{start:3,end:3,color:P},{start:4,end:4,color:'#00ff00'},{start:5,end:5,color:P}]);
});
it('round-trips marks through view state and tolerates older states',async()=>{
  const v=await viewerFor();v.markColumns([[2,3]],'#112233');v.markColumns([10]);
  const state=v.getState();expect(state.columnMarks).toEqual([{start:2,end:3,color:'#112233'},{start:10,end:10,color:P}]);
  const w=await viewerFor();await w.setState(JSON.parse(JSON.stringify(state)));
  expect(w.getColumnMarks()).toEqual(state.columnMarks);
  const {columnMarks:_,...old}=state;await w.setState(old);expect(w.getColumnMarks()).toEqual([]);
  await expect(w.setState({...state,columnMarks:[{start:5,end:30,color:P}]})).rejects.toThrow(/column marks/);
  await expect(w.setState({...state,columnMarks:[{start:5,end:6,color:'blue'}]})).rejects.toThrow(/hex/);
});
it('carries marks in the link as marks=10-12,40 and applies them',async()=>{
  const v=await viewerFor();v.markColumns([[10,12],[13,13],15]);v.markColumns([[2,2]]);
  const link=v.getViewLink();expect(new URLSearchParams(link).get('marks')).toBe('2,10-13,15');
  expect(decodeViewLink('marks=10-12,40').marks).toEqual([[10,12],[40,40]]);
  expect(isViewLink('marks=3')).toBe(true);
  expect(decodeViewLink('marks=x').ignored).toEqual(['marks']);expect(decodeViewLink('marks=5-3').marks).toBeUndefined();
  expect(encodeViewLink({...v.getState(),columnMarks:[]})).not.toContain('marks');
  const w=await viewerFor();expect(await w.applyViewLink(link)).toEqual([]);
  expect(w.getColumnMarks().map((m:any)=>[m.start,m.end])).toEqual([[2,2],[10,13],[15,15]]);
  expect(await w.applyViewLink('scheme=soft-nucleotide&zoom=16')).toEqual([]);expect(w.getColumnMarks()).toEqual([]);
  expect(await w.applyViewLink('marks=3,99')).toEqual(['marks']);expect(w.getColumnMarks()).toEqual([]);
});
it('keeps the color of existing marks that a link re-applies',async()=>{
  const v=await viewerFor();v.markColumns([[3,4]],'#ff00ff');
  await v.applyViewLink('marks=3-6');
  expect(v.getColumnMarks()).toEqual([{start:3,end:4,color:'#ff00ff'},{start:5,end:6,color:P}]);
});
it('keeps marks through column masking and row removal and clears them on a new alignment',async()=>{
  const v=await viewerFor();v.markColumns([[3,5]]);
  v.hideColumns(4,10);expect(v.getColumnMarks()).toEqual([{start:3,end:5,color:P}]);
  expect(v.getState().columnMarks).toEqual([{start:3,end:5,color:P}]);
  v.markColumns([12]);expect(v.getColumnMarks()).toHaveLength(2);
  await v.removeRows(['seq-3']);expect(v.getColumnMarks()).toHaveLength(2);
  await v.setAlignment(createAlignment([{id:'x',name:'x',sequence:'ACGT'}],{alphabet:'dna'}));expect(v.getColumnMarks()).toEqual([]);
});
type Call={fn:string;args:any[]};
const recorder=(calls:Call[])=>{
  const ctx:any=new Proxy({canvas:{}},{get:(t:any,k)=>k in t?t[k]:(...args:any[])=>{calls.push({fn:String(k),args});},set:(t,k,val)=>{t[k]=val;return true;}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx);return document.createElement('canvas');
};
it('draws mark outlines at original-column positions after masking and a marker in the ruler',async()=>{
  const {buildColumnMap,computeColumnMask}=await import('../src/mask');
  const a=align(),columns=buildColumnMap(computeColumnMask(a,{hidden:[[3,4]]}));
  const base:RenderView={a,stats:calculateStats(a),rows:[],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'soft-nucleotide',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,columns,
    marks:[{start:2,end:6,color:'#ff0000'},{start:3,end:4,color:'#00ff00'},{start:19,end:19,color:'#0000ff'}]};
  const calls:Call[]=[];new Renderer().body(recorder(calls),base,400,44);
  const boxes=calls.filter(c=>c.fn==='strokeRect');
  // Columns 3-4 are hidden: the 2-6 mark covers kept columns 2,5,6 at display 1-3; the fully hidden mark is skipped; column 19 sits at display 16.
  expect(boxes.map(c=>c.args)).toEqual([[17,1,46,42],[16*16+1,1,14,42]]);
  const tracks:Call[]=[];new Renderer().tracks(recorder(tracks),{...base,visibility:{...defaultVisibility,modalFrequency:false,gapFraction:false,consensus:false,reference:false}},400);
  expect(tracks.filter(c=>c.fn==='fillRect'&&c.args[3]===7).map(c=>[c.args[0],c.args[2]])).toEqual([[16,48],[256,16]]);
  expect(tracks.filter(c=>c.fn==='strokeRect')).toHaveLength(2);
});
