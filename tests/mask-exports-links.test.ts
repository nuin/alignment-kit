// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {computeColumnMask} from '../src/mask';
import {exportClustal,exportStockholm,exportPhylip,exportNexus,exportStatistics,exportSvg} from '../src/export';
import {calculateStats} from '../src/analysis';
import {parseViewerConfig} from '../src/config';
import {encodeViewLink,decodeViewLink,isViewLink} from '../src/link';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.restoreAllMocks();});
// Gap counts per column 1..10: 0 0 2 4 0 0 3 4 0 0; gapFraction 0.5 hides columns 3, 4, 7 and 8.
const FASTA='>a\nAC--GT--AC\n>b\nACG-GT--AC\n>c\nAC--GTT-AC\n>d\nACG-GT--AC';
const align=()=>parseAlignment(FASTA,{alphabet:'dna'});
const viewerFor=async(options={})=>{const el=document.createElement('div');document.body.append(el);const v=createViewer(el,{worker:false,...options});disposers.push(()=>v.destroy());await v.setAlignment(align());return v;};
const rootOf=(v:unknown)=>(v as any).root as HTMLElement;
const read=(blob:Blob)=>new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(blob);});
function capture(){
  const files:{name:string;blob:Blob}[]=[];let pending:Blob|undefined;
  URL.createObjectURL=(blob:Blob|MediaSource)=>{pending=blob as Blob;return 'blob:test';};URL.revokeObjectURL=()=>{};
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){files.push({name:this.download,blob:pending!});});
  return files;
}
const base={version:1,alignmentId:'a',referenceId:null,query:'',sort:'input',start:1,rowOffset:0,cellWidth:16,selection:null,colorScheme:'soft',colorMode:'all',statisticsScope:'all',annotationFilter:{}} as any;

it('drops hidden columns from CLUSTAL, Stockholm, PHYLIP and NEXUS',()=>{
  const a=align(),columns=computeColumnMask(a,{gapFraction:0.5}),region={rowIds:['seq-2'],columns};
  expect(exportClustal(a,region)).toContain('ACGTAC');
  expect(exportStockholm(a,region)).toContain('ACGTAC');
  expect(exportPhylip(a,region)).toBe('1 6\nb  ACGTAC\n');
  expect(exportNexus(a,region)).toContain('NCHAR=6');
  expect(exportNexus(a,{rowIds:['seq-2']})).toContain('NCHAR=10');
});
it('keeps only visible columns in statistics TSV',()=>{
  const a=align(),s=calculateStats(a),columns=computeColumnMask(a,{gapFraction:0.5});
  const rows=exportStatistics(s,{columns}).trim().split('\n');
  expect(rows).toHaveLength(7);expect(rows.slice(1).map(r=>r.split('\t')[0])).toEqual(['1','2','5','6','9','10']);
  expect(exportStatistics(s).trim().split('\n')).toHaveLength(11);
  expect(()=>exportStatistics(s,{columns:[1]})).toThrow(/one entry per alignment column/);
  expect(()=>exportStatistics(s,{columns:new Array(10).fill(0)})).toThrow(/No visible columns/);
});
it('collapses hidden columns in SVG and marks the boundaries',()=>{
  const a=align(),s=calculateStats(a),columns=computeColumnMask(a,{gapFraction:0.5});
  const plain=exportSvg(a,s,{rowIds:['seq-1']}),masked=exportSvg(a,s,{rowIds:['seq-1'],columns});
  expect(plain).not.toContain('<line');
  expect(masked.match(/<line /g)).toHaveLength(2);
  expect(masked).toContain('2 hidden columns: 3–4');
  expect(masked).toContain('(6 visible)');
  expect(masked).toContain('hiddenColumns&quot;:4');
  expect(masked.match(/<g opacity/g)).toHaveLength(6);expect(plain.match(/<g opacity/g)).toHaveLength(10);
  const wide=(svg:string)=>Number(svg.match(/<svg[^>]* width="(\d+)"/)![1]);
  expect(wide(plain)-wide(masked)).toBe(4*16);
  const edge=exportSvg(a,s,{rowIds:['seq-1'],start:4,end:6,columns});
  expect(edge.match(/<line /g)).toHaveLength(1);
});
it('splits annotation outlines at collapsed boundaries',()=>{
  const a={...align(),annotations:[{id:'x',label:'span',start:2,end:5,mapping:'mapped'}] as any},s=calculateStats(a),columns=computeColumnMask(a,{gapFraction:0.5});
  const outlines=(svg:string)=>svg.match(/stroke-width="2"><title>span/g)?.length;
  expect(outlines(exportSvg(a,s,{rowIds:['seq-1']}))).toBe(1);
  expect(outlines(exportSvg(a,s,{rowIds:['seq-1'],columns}))).toBe(2);
  const b={...a,annotations:[{...a.annotations[0],start:2,end:3}]};
  expect(outlines(exportSvg(b,s,{rowIds:['seq-1'],columns}))).toBe(1);
});
it('applies the Visible columns only checkbox to every export and copy',async()=>{
  const v=await viewerFor({hideGapColumns:0.5}),files=capture(),box=rootOf(v).querySelector<HTMLInputElement>('input[aria-label="Visible columns only"]')!;
  v.setSelection({start:1,end:10,rowId:'seq-2'});
  const kinds=['clustal-all','stockholm-all','phylip-all','nexus-all','clustal','svg','tsv'];
  for(const k of kinds)await (v as any).export(k);
  const before=await Promise.all(files.splice(0).map(f=>read(f.blob)));
  expect(before[0]).toContain('AC--GT--AC');expect(before[3]).toContain('NCHAR=10');expect(before[6].trim().split('\n')).toHaveLength(11);
  box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));
  expect(v.getSelectionText()).toContain('>b\nACGTAC\n');
  for(const k of kinds)await (v as any).export(k);
  const after=await Promise.all(files.splice(0).map(f=>read(f.blob)));
  expect(after[0]).toContain('ACGTAC');
  expect(after[1]).toContain('ACGTAC');expect(after[2].startsWith('4 6\n')).toBe(true);expect(after[3]).toContain('NCHAR=6');
  expect(after[4]).toContain('ACGTAC');expect(after[5]).toContain('<line ');expect(after[6].trim().split('\n')).toHaveLength(7);
  box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));
  expect(v.getSelectionText()).toContain('>b\nACG-GT--AC\n');
});
it('puts Visible columns only in the toolbar beside Export, outside the FASTA panel',async()=>{
  const r=rootOf(await viewerFor()),box=r.querySelector('input[aria-label="Visible columns only"]')!;
  expect(box.closest('.ak-toolbar')).not.toBeNull();expect(box.closest('.ak-fasta-options')).toBeNull();
});
it('keeps fasta.columns as an alias of export.columns and validates both',async()=>{
  const v=await viewerFor(),box=rootOf(v).querySelector<HTMLInputElement>('input[aria-label="Visible columns only"]')!;
  v.setOptions({fasta:{columns:'visible'}});expect(box.checked).toBe(true);expect((v as any).options.export.columns).toBe('visible');
  v.setOptions({export:{columns:'all'}});expect(box.checked).toBe(false);
  v.setOptions({fasta:{lineWidth:60}});expect((v as any).options.export.columns).toBe('all');expect((v as any).options.fasta).toEqual({lineWidth:60});
  expect(()=>v.setOptions({export:{columns:'some' as any}})).toThrow(/export option/i);
  expect(parseViewerConfig({export:{columns:'visible'}})).toEqual({export:{columns:'visible'}});
  expect(()=>parseViewerConfig({export:{columns:'x'}})).toThrow(/export option/i);
  expect(()=>parseViewerConfig({export:{other:1}})).toThrow(/export option/i);
});
it('encodes and decodes find, findmode and strands',()=>{
  expect(encodeViewLink(base)).not.toContain('find');
  expect(encodeViewLink({...base,find:'N-{P}-[ST]-{P}'})).toBe('aln=a&scheme=soft&zoom=16&find=N-%7BP%7D-%5BST%5D-%7BP%7D');
  const text=encodeViewLink({...base,find:'/AC+/',findMode:'regex',strands:'forward'});
  expect(text).toContain('findmode=regex&strands=forward');
  expect(decodeViewLink(text)).toMatchObject({find:'/AC+/',findMode:'regex',strands:'forward'});
  expect(encodeViewLink({...base,find:'AC',findMode:'auto',strands:'both'})).not.toMatch(/findmode|strands/);
  expect(decodeViewLink('find=ACG')).toEqual({find:'ACG'});
  expect(isViewLink('#find=ACG')).toBe(true);
});
it('lists malformed search parameters',()=>{
  expect(decodeViewLink('find=')).toEqual({ignored:['find']});
  expect(decodeViewLink('find='+'A'.repeat(501))).toEqual({ignored:['find']});
  expect(decodeViewLink('find=AC&findmode=fuzzy&strands=reverse')).toEqual({find:'AC',ignored:['findmode','strands']});
  expect(decodeViewLink('findmode=regex&strands=forward')).toEqual({ignored:['findmode','strands']});
  expect(decodeViewLink('find=AC&findmode=auto')).toEqual({find:'AC',ignored:['findmode']});
});
it('reports the active search in view state and reruns it on setState',async()=>{
  const v=await viewerFor();
  expect(v.getState().find).toBeUndefined();
  await v.search('GT',{strands:'forward'});
  expect(v.getState()).toMatchObject({find:'GT',strands:'forward'});expect(v.getState().findMode).toBeUndefined();
  await v.search('/G+T/',{mode:'regex'});expect(v.getState()).toMatchObject({find:'/G+T/',findMode:'regex'});
  const state=structuredClone(v.getState());
  v.clearSearch();expect(v.getState().find).toBeUndefined();
  await v.setState(state);
  expect((v as any).searchState.pattern).toBe('/G+T/');expect((v as any).searchState.result.hits.length).toBeGreaterThan(0);
  expect(rootOf(v).querySelector<HTMLInputElement>('[aria-label="Find motif"]')!.value).toBe('/G+T/');
  await expect(v.setState({...state,find:'/(/',findMode:'regex'})).rejects.toThrow(/Invalid search/);
  await expect(v.setState({...state,findMode:'fuzzy' as any})).rejects.toThrow(/Invalid search/);
  await v.setState({...state,find:undefined,findMode:undefined});expect((v as any).searchState).toBeUndefined();
});
it('reruns the search when a link applies and clears it when the link has none',async()=>{
  const v=await viewerFor();
  expect(await v.applyViewLink(encodeViewLink({...v.getState(),find:'AC'}))).toEqual([]);
  expect((v as any).searchState.pattern).toBe('AC');expect((v as any).searchState.result.hits.length).toBe(12);
  expect(v.getViewLink()).toContain('find=AC');
  expect(await v.applyViewLink('find=GT&strands=forward')).toEqual([]);
  expect((v as any).searchState).toMatchObject({pattern:'GT',options:{strands:'forward'}});
  expect(await v.applyViewLink('find=/(/&findmode=regex')).toEqual(['find']);
  expect((v as any).searchState).toBeUndefined();expect(rootOf(v).querySelector<HTMLInputElement>('[aria-label="Find motif"]')!.value).toBe('');
  expect(await v.applyViewLink('zoom=16')).toEqual([]);expect((v as any).searchState).toBeUndefined();expect(v.getViewLink()).not.toContain('find');
  expect(await v.applyViewLink('find=AC&findmode=bogus')).toEqual(['findmode']);expect((v as any).searchState.pattern).toBe('AC');
});
it('restores the search from a link pending during load',async()=>{
  location.hash='#find=GT&zoom=16';
  try{
    const el=document.createElement('div');document.body.append(el);
    const v=createViewer(el,{worker:false,urlSync:true});disposers.push(()=>v.destroy());
    await v.setAlignment(align());
    expect((v as any).searchState?.pattern).toBe('GT');
  }finally{location.hash='';}
});
