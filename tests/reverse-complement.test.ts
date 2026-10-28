// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {complementSequence,reverseComplementSequence,complementTable} from '../src/strand';
import {buildColumnMap,identityColumns,reverseColumnMap,columnSpan,columnPos,keptColumn} from '../src/mask';
import {exportFasta} from '../src/export';
import {Renderer,type RenderView} from '../src/renderer';
import {AnnotationIndex} from '../src/annotations';
import {calculateStats} from '../src/analysis';
import {parseViewerConfig} from '../src/config';
import {encodeViewLink,decodeViewLink,isViewLink} from '../src/link';
import {defaultVisibility} from '../src/visibility';
import schema from '../config/viewer-config.schema.json';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.restoreAllMocks();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const FASTA='>a\nAAGC\n>b\nAC-G\n>c\nTTGC';
const PROTEIN='>p\nMKVLA\n>q\nMKVIA';
const viewerFor=async(text=FASTA,alphabet:'dna'|'protein'='dna',options={})=>{const v=createViewer(host(),{worker:false,...options});disposers.push(()=>v.destroy());await v.setAlignment(parseAlignment(text,{alphabet}));return v;};
const priv=(v:unknown)=>v as any;
const stubCanvas=()=>vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(new Proxy({},{get:()=>()=>{},set:()=>true}) as any);
const rootOf=(v:unknown)=>priv(v).root as HTMLElement;

it('complements IUPAC codes, keeps case and gaps, and pairs A with U for RNA',()=>{
  expect(complementSequence('ACGTRYKMBDHVSWN-.','dna')).toBe('TGCAYRMKVHDBSWN-.');
  expect(complementSequence('acgt','dna')).toBe('tgca');
  expect(complementSequence('ACGU','rna')).toBe('UGCA');
  expect(reverseComplementSequence('AAGC-T','dna')).toBe('A-GCTT');
  expect(reverseComplementSequence('GAUC','rna')).toBe('GAUC');
  expect(()=>complementSequence('MKV','protein')).toThrow(/DNA or RNA/);
  expect(complementTable('dna')[65]).toBe(84);expect(complementTable('rna')[65]).toBe(85);expect(complementTable('dna')[45]).toBe(45);
});

it('maps display positions on a reversed column map with hidden columns',()=>{
  const mask=Uint8Array.from([1,1,0,1,1,0]),forward=buildColumnMap(mask),reversed=reverseColumnMap(forward);
  expect(Array.from(reversed.cols)).toEqual([4,3,1,0]);expect(reversed.reversed).toBe(true);
  expect(Array.from(forward.edges)).toEqual([2,4]);expect(Array.from(reversed.edges)).toEqual([0,2]);
  expect(columnSpan(forward,4,5)).toEqual([2,4]);expect(columnSpan(reversed,4,5)).toEqual([0,2]);
  expect(columnSpan(reversed,1,2)).toEqual([2,4]);expect(columnSpan(reversed,3,3)).toEqual([2,2]);
  expect(columnPos(reversed,0)).toBe(3);expect(columnPos(reversed,4)).toBe(0);expect(columnPos(forward,4)).toBe(3);
  expect([0,1,2,3].map(k=>keptColumn(reversed,k))).toEqual([0,1,3,4]);
});

const letters=(rows:number[],extra:Partial<RenderView>)=>{
  const a=parseAlignment(FASTA,{alphabet:'dna'}),calls:string[]=[];
  const ctx=new Proxy({},{get:(_,k)=>(...args:any[])=>{if(k==='fillText')calls.push(args[0]);},set:()=>true});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  const v:RenderView={a,stats:calculateStats(a),rows,reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'conservation',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,...extra};
  new Renderer().body(document.createElement('canvas'),v,64,22*rows.length);return calls.slice(-4*rows.length).join('');
};
it('draws complemented letters right to left in the reverse-complement view',()=>{
  const reversed=reverseColumnMap(identityColumns(4));
  expect(letters([0],{})).toBe('AAGC');
  expect(letters([0],{reverse:true,columns:reversed})).toBe('GCTT');
  expect(letters([1],{reverse:true,columns:reversed})).toBe('C·GT');
});
it('draws a flagged row complemented in place and twice complemented in the reverse view',()=>{
  expect(letters([0],{strands:new Set(['seq-1'])})).toBe('TTCG');
  expect(letters([0],{strands:new Set(['seq-1']),reverse:true,columns:reverseColumnMap(identityColumns(4))})).toBe('CGAA');
  expect(letters([0],{strands:new Set(['seq-2'])})).toBe('AAGC');
});
it('ignores strand flags and the reverse view for protein',()=>{
  const a=parseAlignment(PROTEIN,{alphabet:'protein'}),calls:string[]=[];
  const ctx=new Proxy({},{get:(_,k)=>(...args:any[])=>{if(k==='fillText')calls.push(args[0]);},set:()=>true});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  new Renderer().body(document.createElement('canvas'),{a,stats:calculateStats(a),rows:[0],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'conservation',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,reverse:true,strands:new Set(['seq-1'])},80,22);
  expect(calls.slice(-5).join('')).toBe('MKVLA');
});
it('compares against the displayed reference letters in difference mode',()=>{
  const a=parseAlignment('>r\nACGT\n>s\nACGA',{alphabet:'dna'}),alphas:number[]=[];
  const ctx=new Proxy({},{get:()=>()=>{},set:(_,k,value)=>{if(k==='globalAlpha')alphas.push(value as number);return true;}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  const base={a,stats:calculateStats(a),rows:[1],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'conservation',mode:'reference-differences' as const,dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false};
  new Renderer().body(document.createElement('canvas'),{...base,reverse:true,columns:reverseColumnMap(identityColumns(4))},64,22);
  expect(alphas.filter(x=>x!==1).length).toBe(3);
  alphas.length=0;
  new Renderer().body(document.createElement('canvas'),{...base,strands:new Set(['seq-2'])},64,22);
  expect(alphas.filter(x=>x===1).length).toBeGreaterThan(0);
});

it('toggles the view, reverses the column map and keeps coordinates',async()=>{
  const v=await viewerFor(FASTA,'dna',{});
  expect(v.getReverseComplement()).toBe(false);expect(priv(v).columns.reversed).toBeUndefined();
  v.setSelection({start:2,end:3},false);
  v.setReverseComplement(true);
  expect(v.getReverseComplement()).toBe(true);expect(priv(v).options.reverseComplement).toBe(true);
  expect(Array.from(priv(v).columns.cols)).toEqual([3,2,1,0]);
  expect(v.getState().selection).toEqual({start:2,end:3});expect(v.getState().reverseComplement).toBe(true);
  expect(exportFasta(v.getAlignment()!,{},{lineWidth:0})).toBe('>a\nAAGC\n>b\nAC-G\n>c\nTTGC\n');
  v.setReverseComplement(false);expect(Array.from(priv(v).columns.cols)).toEqual([0,1,2,3]);expect(v.getReverseComplement()).toBe(false);
});
it('steps selection with the arrow keys in display order',async()=>{
  const v=await viewerFor(FASTA,'dna',{reverseComplement:true});
  expect(v.getReverseComplement()).toBe(true);
  expect(priv(v).stepColumn(3,1)).toBe(2);expect(priv(v).stepColumn(3,-1)).toBe(4);expect(priv(v).stepColumn(4,-1)).toBe(4);expect(priv(v).stepColumn(1,1)).toBe(1);
  expect(priv(v).firstColumn()).toBe(3);
});
it('checks the toolbar box and enables it only for nucleotides',async()=>{
  const v=await viewerFor(),box=rootOf(v).querySelector<HTMLInputElement>('[aria-label="Reverse complement"]')!;
  expect(box.disabled).toBe(false);expect(box.checked).toBe(false);
  box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));
  expect(v.getReverseComplement()).toBe(true);expect(box.checked).toBe(true);
  expect(rootOf(v).querySelector('.ak-track-labels span')!.textContent).toContain('reverse complement');
  const p=await viewerFor(PROTEIN,'protein'),pbox=rootOf(p).querySelector<HTMLInputElement>('[aria-label="Reverse complement"]')!;
  expect(pbox.disabled).toBe(true);
});
it('refuses the reverse view and strand flags for protein with a message',async()=>{
  const v=await viewerFor(PROTEIN,'protein'),message=()=>rootOf(v).querySelector('.ak-message')!.textContent;
  v.setReverseComplement(true);
  expect(v.getReverseComplement()).toBe(false);expect(message()).toMatch(/DNA or RNA alignment/);
  priv(v).message('');v.setOptions({reverseComplement:true});
  expect(priv(v).options.reverseComplement).toBe(false);expect(message()).toMatch(/DNA or RNA alignment/);
  priv(v).message('');v.setRowStrand('seq-1','-');
  expect(v.getRowStrand('seq-1')).toBe('+');expect(message()).toMatch(/DNA or RNA alignment/);
  expect(rootOf(v).querySelector('[data-strand]')).toBeNull();
});
it('flags rows as reverse strand, validates input and shows a marker in the label',async()=>{
  const v=await viewerFor();
  expect(v.getRowStrand('seq-2')).toBe('+');
  v.setRowStrand('seq-2','-');
  expect(v.getRowStrand('seq-2')).toBe('-');expect(v.getState().reverseStrandRowIds).toEqual(['seq-2']);
  expect(()=>v.setRowStrand('nope','-')).toThrow(/Unknown sequence/);
  expect(()=>v.setRowStrand('seq-1','x' as any)).toThrow(/Strand/);
  v.setRowStrand('seq-1','-');v.setRowStrand('seq-1','+');
  expect(v.getState().reverseStrandRowIds).toEqual(['seq-2']);
  expect(v.getAlignment()!.rows[1].sequence).toBe('AC-G');
});
it('toggles a strand flag from the label button',async()=>{
  const v=await viewerFor(),root=rootOf(v);
  Object.defineProperty(priv(v).scroll,'clientHeight',{value:300,configurable:true});Object.defineProperty(root.querySelector('.ak-main'),'clientWidth',{value:400,configurable:true});
  stubCanvas();priv(v).render();
  const button=root.querySelector<HTMLButtonElement>('[data-strand="seq-2"]')!;
  expect(button.getAttribute('aria-pressed')).toBe('false');button.click();
  expect(v.getRowStrand('seq-2')).toBe('-');stubCanvas();priv(v).render();
  const label=root.querySelector<HTMLElement>('[data-strand="seq-2"]')!;
  expect(label.getAttribute('aria-pressed')).toBe('true');expect(label.closest<HTMLElement>('.ak-row-label')!.dataset.reverseStrand).toBe('true');
  expect(root.querySelector('[data-strand="seq-3"]')!.closest<HTMLElement>('.ak-row-label')!.dataset.reverseStrand).toBeUndefined();
});
it('emits viewport columns in ascending order in the reverse view',async()=>{
  const v=await viewerFor(FASTA,'dna',{reverseComplement:true}),root=rootOf(v),seen:any[]=[];
  Object.defineProperty(priv(v).scroll,'clientHeight',{value:300,configurable:true});Object.defineProperty(root.querySelector('.ak-main'),'clientWidth',{value:400,configurable:true});
  v.on('viewport',e=>seen.push(e));stubCanvas();priv(v).render();
  expect(seen[0].start).toBe(1);expect(seen[0].end).toBe(4);
  expect(root.querySelector('.ak-status-detail')!.textContent).toMatch(/^4–1 /);
});
it('keeps search hits in source coordinates in the reverse view',async()=>{
  const v=await viewerFor('>a\nACGTAC\n>b\nACGTAC'),forward=await v.search('CGT');
  v.setReverseComplement(true);
  const reversed=await v.search('CGT');
  expect(reversed.hits.map(h=>[h.rowId,h.start,h.end,h.strand])).toEqual(forward.hits.map(h=>[h.rowId,h.start,h.end,h.strand]));
  expect(forward.hits.find(h=>h.strand==='+')).toMatchObject({start:2,end:4});
});
it('exports in source orientation unless the orientation option asks for reverse complement',async()=>{
  const a=parseAlignment(FASTA,{alphabet:'dna'});
  expect(exportFasta(a,{},{lineWidth:0})).toBe('>a\nAAGC\n>b\nAC-G\n>c\nTTGC\n');
  expect(exportFasta(a,{},{lineWidth:0,orientation:'reverse-complement'})).toBe('>a (reverse complement)\nGCTT\n>b (reverse complement)\nC-GT\n>c (reverse complement)\nGCAA\n');
  expect(exportFasta(a,{start:2,end:3,rowIds:['seq-1']},{lineWidth:0,orientation:'reverse-complement',header:'id-name'})).toBe('>seq-1 a (reverse complement)\nCT\n');
  expect(exportFasta(a,{},{lineWidth:0,gaps:'remove',orientation:'reverse-complement'})).toContain('\nCGT\n');
  expect(()=>exportFasta(parseAlignment(PROTEIN,{alphabet:'protein'}),{},{orientation:'reverse-complement'})).toThrow(/DNA or RNA/);
  expect(()=>exportFasta(a,{},{orientation:'sideways' as any})).toThrow(/Invalid FASTA option/);
});
it('applies the orientation option to Ctrl/Cmd+C text and the consensus line without changing the view',async()=>{
  const v=await viewerFor(FASTA,'dna',{fasta:{lineWidth:0}});
  await vi.waitFor(()=>expect(v.getStatistics()).toBeTruthy());
  v.setSelection({start:1,end:4,rowId:'seq-1'},false);
  const source=v.getSelectionText();
  v.setOptions({fasta:{orientation:'reverse-complement'}});
  const flipped=v.getSelectionText();
  expect(source).toContain('\nAAGC\n');expect(flipped).toContain('\nGCTT\n');expect(flipped).toContain('(reverse complement)');
  expect(v.getReverseComplement()).toBe(false);
  expect(rootOf(v).querySelector<HTMLSelectElement>('[aria-label="FASTA orientation"]')!.value).toBe('reverse-complement');
});
it('follows the view in copied text only through the export option',async()=>{
  const v=await viewerFor(FASTA,'dna',{fasta:{lineWidth:0}});
  v.setSelection({start:1,end:4,rowId:'seq-1'},false);v.setReverseComplement(true);
  expect(v.getSelectionText()).toContain('\nAAGC\n');
});

it('round-trips the view through state and links',async()=>{
  const v=await viewerFor();
  v.setReverseComplement(true);v.setRowStrand('seq-3','-');v.setRowStrand('seq-1','-');
  const state=v.getState(),link=v.getViewLink();
  expect(state.reverseComplement).toBe(true);expect(state.reverseStrandRowIds).toEqual(['seq-3','seq-1']);
  expect(link).toContain('rc=1');expect(link).toContain('strand=seq-3%2Cseq-1');
  const w=await viewerFor();
  await w.setState(JSON.parse(JSON.stringify(state)));
  expect(w.getReverseComplement()).toBe(true);expect(w.getRowStrand('seq-3')).toBe('-');expect(w.getRowStrand('seq-2')).toBe('+');
  const x=await viewerFor();
  expect(await x.applyViewLink(link)).toEqual([]);
  expect(x.getReverseComplement()).toBe(true);expect(x.getRowStrand('seq-1')).toBe('-');expect(x.getRowStrand('seq-3')).toBe('-');
  await x.applyViewLink('scheme=soft-nucleotide&zoom=16');
  expect(x.getReverseComplement()).toBe(false);expect(x.getRowStrand('seq-1')).toBe('+');
});
it('skips link parameters that do not fit the alignment',async()=>{
  const v=await viewerFor(PROTEIN,'protein');
  expect(await v.applyViewLink('rc=1&strand=seq-1')).toEqual(expect.arrayContaining(['rc','strand']));
  expect(v.getReverseComplement()).toBe(false);
  const n=await viewerFor();
  expect(await n.applyViewLink('strand=seq-2,ghost')).toEqual(['strand']);
  expect(n.getRowStrand('seq-2')).toBe('-');
});
it('encodes and decodes the link parameters',()=>{
  const state={version:1 as const,alignmentId:'x',referenceId:null,query:'',sort:'input' as const,start:1,rowOffset:0,cellWidth:16,selection:null,colorScheme:'soft',colorMode:'all' as const,statisticsScope:'all' as const,annotationFilter:{}};
  expect(encodeViewLink(state)).not.toContain('rc=');
  const text=encodeViewLink({...state,reverseComplement:true,reverseStrandRowIds:['a,b','c d']});
  expect(isViewLink('#rc=1')).toBe(true);expect(isViewLink('#strand=a')).toBe(true);
  expect(decodeViewLink(text)).toMatchObject({reverseComplement:true,reverseStrandRowIds:['a,b','c d']});
  expect(decodeViewLink('rc=0').reverseComplement).toBe(false);
  expect(decodeViewLink('rc=yes&strand=').ignored).toEqual(['rc','strand']);
  expect(decodeViewLink('strand=%E0%A4%A').ignored).toEqual(['strand']);
});
it('validates the configuration, schema and visibility flags',()=>{
  expect(parseViewerConfig({reverseComplement:true,fasta:{orientation:'reverse-complement'},visibility:{reverseComplementToggle:false,rowStrand:false}})).toEqual({reverseComplement:true,fasta:{orientation:'reverse-complement'},visibility:{reverseComplementToggle:false,rowStrand:false}});
  expect(()=>parseViewerConfig({reverseComplement:'yes'})).toThrow(/boolean/);
  expect(()=>parseViewerConfig({fasta:{orientation:'up'}})).toThrow(/Invalid FASTA option/);
  const s=schema as any;
  expect(s.properties.reverseComplement.type).toBe('boolean');expect(s.properties.fasta.properties.orientation.enum).toEqual(['source','reverse-complement']);
  for(const key of ['reverseComplementToggle','rowStrand']){expect(s.properties.visibility.properties[key].type).toBe('boolean');expect((defaultVisibility as any)[key]).toBe(true);}
});
it('hides the toolbar box and the strand buttons with their visibility flags',async()=>{
  const v=await viewerFor(FASTA,'dna',{visibility:{reverseComplementToggle:false,rowStrand:false}}),root=rootOf(v);
  Object.defineProperty(priv(v).scroll,'clientHeight',{value:300,configurable:true});Object.defineProperty(root.querySelector('.ak-main'),'clientWidth',{value:400,configurable:true});
  stubCanvas();priv(v).render();
  expect(root.querySelector('[aria-label="Reverse complement"]')!.closest('label')!.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>('[data-strand]')!.hidden).toBe(true);
  v.setOptions({visibility:{reverseComplementToggle:true,rowStrand:true}});
  expect(root.querySelector('[aria-label="Reverse complement"]')!.closest('label')!.hidden).toBe(false);
});
it('keeps strand flags of surviving rows when rows are removed',async()=>{
  const v=await viewerFor();
  v.setRowStrand('seq-1','-');v.setRowStrand('seq-3','-');v.setReverseComplement(true);
  await v.removeRows(['seq-3']);
  expect(v.getRowStrand('seq-1')).toBe('-');expect(v.getRowStrand('seq-3')).toBe('+');expect(v.getReverseComplement()).toBe(true);
  v.clear();expect(v.getState().reverseStrandRowIds).toEqual([]);
});
it('draws custom tracks right to left in the reverse view',async()=>{
  const a=parseAlignment(FASTA,{alphabet:'dna'}),seen:any[]=[];
  const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  const track={id:'t',label:'T',type:'custom' as const,render:(_c:any,info:any)=>seen.push({start:info.start,end:info.end,offsetX:info.offsetX,reversed:info.reversed})};
  const base:RenderView={a,stats:calculateStats(a),rows:[0],reference:0,x:0,y:0,cw:16,rh:22,gutter:10,scheme:'soft',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,tracks:[track]};
  new Renderer().tracks(document.createElement('canvas'),base,100);
  expect(seen).toEqual([{start:1,end:4,offsetX:10,reversed:undefined}]);
  seen.length=0;
  new Renderer().tracks(document.createElement('canvas'),{...base,reverse:true,columns:reverseColumnMap(identityColumns(4))},100);
  expect(seen).toEqual([{start:1,end:4,offsetX:10,reversed:true}]);
});
it('ignores the FASTA orientation option on protein alignments and disables its select',async()=>{
  const v=await viewerFor(FASTA,'dna',{fasta:{lineWidth:0}}),select=rootOf(v).querySelector<HTMLSelectElement>('[aria-label="FASTA orientation"]')!;
  v.setOptions({fasta:{orientation:'reverse-complement'}});
  await v.setAlignment(parseAlignment(PROTEIN,{alphabet:'protein'}));
  Object.defineProperty(priv(v).scroll,'clientHeight',{value:300,configurable:true});Object.defineProperty(rootOf(v).querySelector('.ak-main'),'clientWidth',{value:400,configurable:true});
  stubCanvas();priv(v).render();
  v.setSelection({start:1,end:5,rowId:'seq-1'},false);
  expect(select.disabled).toBe(true);expect(()=>v.getSelectionText()).not.toThrow();
  expect(v.getSelectionText()).toContain('\nMKVLA\n');expect(v.getSelectionText()).not.toContain('reverse complement');
});
it('shows the displayed letter and the source letter in the Position tab',async()=>{
  const v=await viewerFor(),root=rootOf(v);
  Object.defineProperty(priv(v).scroll,'clientHeight',{value:300,configurable:true});Object.defineProperty(root.querySelector('.ak-main'),'clientWidth',{value:400,configurable:true});
  stubCanvas();v.setSelection({start:1,end:1,rowId:'seq-1'},false);priv(v).render();
  const text=()=>root.querySelector('.ak-selected-residue')!.textContent!;
  expect(root.querySelector('.ak-selected-residue b')!.textContent).toBe('A');expect(text()).not.toContain('Source residue');
  v.setRowStrand('seq-1','-');priv(v).render();
  expect(root.querySelector('.ak-selected-residue b')!.textContent).toBe('T');expect(text()).toContain('Source residue A');
  v.setReverseComplement(true);priv(v).render();
  expect(root.querySelector('.ak-selected-residue b')!.textContent).toBe('A');expect(text()).not.toContain('Source residue');
});
it('caches reference numbering across redraws in the reverse view',()=>{
  const a=parseAlignment('>r\nAC-GT\n>s\nACGGT',{alphabet:'dna'});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(new Proxy({},{get:()=>()=>{},set:()=>true}) as any);
  const spy=vi.spyOn(Int32Array,'from');
  const base={a,stats:calculateStats(a),rows:[0],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'soft',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,ruler:'reference',reverse:true,columns:reverseColumnMap(identityColumns(5))} as any;
  const built=()=>spy.mock.calls.filter(c=>(c[0] as any).length===a.width&&typeof c[1]==='function').length,r=new Renderer();
  r.tracks(document.createElement('canvas'),base,200);const first=built();
  r.tracks(document.createElement('canvas'),base,200);r.tracks(document.createElement('canvas'),base,200);
  expect(first).toBe(1);expect(built()).toBe(first);
});
