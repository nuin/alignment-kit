// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment,detectAlphabet} from '../src/model';
import {parseAlignment} from '../src/parsers';
import {calculateStats} from '../src/analysis';
import {AnnotationIndex} from '../src/annotations';
import {Renderer,type RenderView} from '../src/renderer';
import {applyVisibility,defaultVisibility,trackLayout} from '../src/visibility';
import {colorSchemes} from '../src/colors';
import type {Alphabet,CustomTrack} from '../src/types';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const make=async(text:string,alphabet?:Alphabet,options={})=>{
  const el=host(),viewer=createViewer(el,{worker:false,...options});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment(text,alphabet?{alphabet}:{}));return {el,viewer};
};
const stockholm='# STOCKHOLM 1.0\na ACGU\nb ACGA\n#=GR a PP 9876\n#=GC SS_cons <<>>\n//\n';
const message=(el:HTMLElement)=>el.querySelector<HTMLElement>('.ak-message')!;

it('places Stockholm GC and registered tracks above the pinned reference row, with GR tracks next to it',async()=>{
  const {el,viewer}=await make(stockholm,'rna',{tracks:[{id:'score',label:'Score',type:'bar'}]});
  viewer.setSelection({start:1,end:1,rowId:viewer.getAlignment()!.rows[0].id});
  const drawn=(viewer as any).drawnTracks() as CustomTrack[];
  expect(drawn.map(t=>t.label)).toEqual(['SS_cons','Score','PP a']);
  const layout=trackLayout(defaultVisibility,36,drawn.map(t=>({height:t.height??26})),'rna');
  expect(layout.offsets.reference).toBe(layout.height-36);
  expect(layout.custom.at(-1)!.offset+layout.custom.at(-1)!.height).toBe(layout.offsets.reference);
  const labels=[...el.querySelectorAll<HTMLElement>('.ak-custom-label')].map(n=>[n.textContent,parseFloat(n.style.top)]);
  expect(labels.map(l=>l[0])).toEqual(['SS_cons','Score','PP a']);
  expect(labels.map(l=>l[1])).toEqual(layout.custom.map(c=>c.offset+Math.max(0,(c.height-20)/2)));
  expect(el.querySelector<HTMLElement>('.ak-reference-label')!.style.top).toBe(layout.offsets.reference+'px');
  expect(el.querySelector<HTMLElement>('.ak-tracks')!.style.height).toBe(layout.height+'px');
});
it('hit-tests the reference row below Stockholm tracks',async()=>{
  const {el,viewer}=await make(stockholm,'rna',{cellWidth:16,labelWidth:230});
  const ref=trackLayout(defaultVisibility,36,[{height:20},{height:20}],'rna').offsets.reference!;
  el.querySelector('.ak-tracks')!.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:230+16+3,clientY:ref+5}));
  expect(viewer.getState().selection).toEqual({start:2,end:2,rowId:viewer.getAlignment()!.rows[0].id});
});
it('scales a bits logo so full information fills the track and relabels it',async()=>{
  const a=parseAlignment(Array.from({length:8},(_,i)=>`>r${i}\nA${'ACGT'[i%4]}`).join('\n'),{alphabet:'dna'}),stats=calculateStats(a),scales:number[]=[];
  const ctx=new Proxy({},{get:(_,k)=>(...args:any[])=>{if(k==='scale'&&args[0]===1)scales.push(args[1]*16);},set:()=>true});
  const spy=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  const v:RenderView={a,stats,rows:[],reference:0,x:0,y:0,cw:16,rh:36,gutter:0,scheme:'soft-nucleotide',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:true,logoMode:'bits',visibility:{...defaultVisibility,logo:true}};
  new Renderer().tracks(document.createElement('canvas'),v,32);spy.mockRestore();
  expect(scales[0]).toBeCloseTo(41*stats.information[0]/2,5);expect(scales[0]).toBeGreaterThan(30);
  const {el,viewer}=await make('>a\nACGT\n>b\nACGA','dna',{showLogo:true});
  const label=el.querySelector('.ak-logo-label')!;expect(label.textContent).toBe('Frequency logo · non-gap');
  viewer.setOptions({logoMode:'bits'});expect(label.textContent).toBe('Information logo · bits');
});
it('clears tree warnings when the tree is removed or replaced',async()=>{
  const {el,viewer}=await make('>a\nACGT\n>b\nACGA\n>c\nACGG','dna');
  viewer.setTree('(a,b);');expect(message(el).textContent).toBe('Tree: 1 sequences have no leaf in the tree.');
  viewer.setTree(null);expect(message(el).textContent).toBe('');expect(message(el).hidden).toBe(true);
  viewer.setTree('(a,b);');viewer.setTree('(a,b,c);');expect(message(el).textContent).toBe('');
});
it('collapses the tree column while groups are active and says so once',async()=>{
  const {el,viewer}=await make('>a\nACGT\n>b\nACGA\n>c\nACGG','dna');
  viewer.setTree('(a,(b,c));');expect((viewer as any).gutter).toBe(350);
  viewer.setGroups({a:'one',b:'two'});
  expect((viewer as any).gutter).toBe(230);expect(el.querySelector<HTMLElement>('.ak-tree-canvas')!.hidden).toBe(true);
  expect(message(el).textContent).toMatch(/tree column is hidden while rows are grouped/);
  viewer.setFilter('a');expect(message(el).textContent).toMatch(/tree column is hidden/);
  (viewer as any).message('other');viewer.setFilter('');expect(message(el).textContent).toBe('other');
  viewer.setGroups(null);expect((viewer as any).gutter).toBe(350);
});
it('keeps an element hidden by its own selector when it is also an action container',()=>{
  const root=document.createElement('section');
  root.innerHTML='<aside class="ak-inspector"><div class="ak-tabs"><button data-tab="position"></button></div></aside><div class="ak-gutter-resize"></div><div class="ak-inspector-actions ak-feature-pagination"><button data-action="features-prev">Previous</button></div>';
  applyVisibility(root,{...defaultVisibility,featurePagination:false});
  expect(root.querySelector<HTMLElement>('.ak-feature-pagination')!.hidden).toBe(true);
  applyVisibility(root,{...defaultVisibility});
  expect(root.querySelector<HTMLElement>('.ak-feature-pagination')!.hidden).toBe(false);
});
it('clears the selection when the only selected cell is clicked again',async()=>{
  const {el,viewer}=await make('>a\nACGTACGT\n>b\nACGAACGA\n>c\nACGAACGA','dna',{cellWidth:16,labelWidth:230,rowHeight:36});
  const scroll=el.querySelector<HTMLElement>('.ak-scroll')!,click=(x:number,y:number,shiftKey=false)=>scroll.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y,shiftKey}));
  const rowB=viewer.getAlignment()!.rows[1].id;
  click(230+16*2+3,5);expect(viewer.getState().selection).toEqual({start:3,end:3,rowId:rowB});
  click(230+16*2+3,5);expect(viewer.getState().selection).toBeNull();
  click(230+16*2+3,5);click(230+16*5+3,5,true);expect(viewer.getState().selection).toEqual({start:3,end:6,rowId:rowB});
  click(230+16*5+3,5);expect(viewer.getState().selection).toEqual({start:6,end:6,rowId:rowB});
  click(230+16*5+3,5,true);expect(viewer.getState().selection).toEqual({start:6,end:6,rowId:rowB});
  click(230+16*5+3,41);expect(viewer.getState().selection?.rowId).toBe(viewer.getAlignment()!.rows[2].id);
  const tracks=el.querySelector('.ak-tracks')!,track=()=>tracks.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:230+16+3,clientY:10}));
  track();expect(viewer.getState().selection).toEqual({start:2,end:2});track();expect(viewer.getState().selection).toBeNull();
});
it('ignores the click that ends a drag-to-pan, even on the selected cell',async()=>{
  const {el,viewer}=await make('>a\nACGTACGT\n>b\nACGAACGA','dna',{cellWidth:16,labelWidth:230});
  const scroll=el.querySelector<HTMLElement>('.ak-scroll')!,rowB=viewer.getAlignment()!.rows[1].id;viewer.setSelection({start:3,end:3,rowId:rowB},false);
  const pointer=(type:string,x:number)=>{const e=new MouseEvent(type,{clientX:x,clientY:5,button:0,bubbles:true});Object.defineProperty(e,'pointerId',{value:1});scroll.dispatchEvent(e);};
  pointer('pointerdown',230+16*2+3);pointer('pointermove',230+16*2+23);pointer('pointermove',230+16*2+3);pointer('pointerup',230+16*2+3);
  scroll.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:230+16*2+3,clientY:5}));
  expect(viewer.getState().selection).toEqual({start:3,end:3,rowId:rowB});
});
it('detects the alphabet from residues regardless of the chosen alphabet',()=>{
  expect(detectAlphabet(createAlignment([{name:'a',sequence:'ACGT-N'}],{alphabet:'protein'}))).toEqual({alphabet:'dna',other:0});
  expect(detectAlphabet(createAlignment([{name:'a',sequence:'ACGU'}]))).toEqual({alphabet:'rna',other:0});
  const p=detectAlphabet(createAlignment([{name:'a',sequence:'MKVLE-A'}]));expect(p.alphabet).toBe('protein');expect(p.other).toBeCloseTo(5/6);
  expect(detectAlphabet(createAlignment([{name:'a',sequence:'ACGTACGTACGTRY'}],{alphabet:'dna'})).alphabet).toBe('protein');
  expect(detectAlphabet(createAlignment([{name:'a',sequence:'ACGTACGTACGTACGTACGR'}],{alphabet:'dna'})).alphabet).toBe('dna');
});
it('asks before switching a protein alignment to DNA, and Cancel restores the select',async()=>{
  const {el,viewer}=await make('>a\nMKVLEA\n>b\nMKVLDA');
  expect(viewer.getDetectedAlphabet()).toBe('protein');
  const type=el.querySelector<HTMLSelectElement>('select[aria-label="Sequence alphabet"]')!;
  type.value='dna';type.dispatchEvent(new Event('change',{bubbles:true}));
  expect(message(el).hidden).toBe(false);
  expect(message(el).textContent).toContain('This alignment looks like protein (83.3% of residues are not A, C, G, T/U, N). Treat it as DNA?');
  expect(viewer.getAlignment()!.alphabet).toBe('protein');
  type.value='rna';type.dispatchEvent(new Event('change',{bubbles:true}));
  expect(message(el).textContent).toContain('Treat it as RNA?');expect(type.value).toBe('rna');expect(el.querySelectorAll('[data-action="alphabet-switch"]')).toHaveLength(1);
  el.querySelector<HTMLButtonElement>('[data-action="alphabet-cancel"]')!.click();
  await vi.waitFor(()=>expect(message(el).hidden).toBe(true));
  expect(type.value).toBe('protein');expect(el.querySelector('[role=combobox][aria-label="Sequence alphabet"]')!.textContent).toBe('Protein');
  expect(viewer.getAlignment()!.alphabet).toBe('protein');
});
it('switches after confirmation, filters the scheme list and falls back to a compatible scheme',async()=>{
  const {el,viewer}=await make('>a\nACGTAC\n>b\nACGAAC','dna',{colorScheme:'purine'});
  expect(viewer.getDetectedAlphabet()).toBe('dna');expect(viewer.getState().colorScheme).toBe('purine');
  const palette=()=>[...el.querySelector<HTMLSelectElement>('select[aria-label="Color scheme"]')!.options].map(o=>o.value);
  expect(palette()).toEqual(colorSchemes('dna').map(s=>s.id));expect(palette()).not.toContain('taylor');
  const type=el.querySelector<HTMLSelectElement>('select[aria-label="Sequence alphabet"]')!;
  type.value='protein';type.dispatchEvent(new Event('change',{bubbles:true}));
  expect(message(el).textContent).toContain('This alignment looks like DNA (100% of residues are A, C, G, T/U or N). Treat it as protein?');
  el.querySelector<HTMLButtonElement>('[data-action="alphabet-switch"]')!.click();
  await vi.waitFor(()=>expect(viewer.getAlignment()!.alphabet).toBe('protein'));
  expect(viewer.getState().colorScheme).toBe('soft');expect(palette()).toEqual(colorSchemes('protein').map(s=>s.id));
  expect(palette()).not.toContain('purine');expect(palette()).not.toContain('soft-nucleotide');
  expect(viewer.getDetectedAlphabet()).toBe('dna');
  type.value='protein';type.dispatchEvent(new Event('change',{bubbles:true}));expect(el.querySelector('[data-action="alphabet-switch"]')).toBeNull();
});
it('switches between DNA and RNA without asking, and does not gate programmatic alphabets',async()=>{
  const {el,viewer}=await make('>a\nACGTAC\n>b\nACGAAC','dna');
  const type=el.querySelector<HTMLSelectElement>('select[aria-label="Sequence alphabet"]')!;
  type.value='rna';type.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(viewer.getAlignment()!.alphabet).toBe('rna'));expect(el.querySelector('[data-action="alphabet-switch"]')).toBeNull();
  await viewer.setAlignment(parseAlignment('>a\nMKVLEA',{alphabet:'dna'}));
  expect(viewer.getAlignment()!.alphabet).toBe('dna');expect(viewer.getDetectedAlphabet()).toBe('protein');
  viewer.clear();expect(()=>viewer.getDetectedAlphabet()).toThrow(/No alignment/);
});
it('shows the alphabet confirmation even when messages are hidden',async()=>{
  const {el}=await make('>a\nMKVLEA',undefined,{visibility:{messages:false}});
  const type=el.querySelector<HTMLSelectElement>('select[aria-label="Sequence alphabet"]')!;
  type.value='dna';type.dispatchEvent(new Event('change',{bubbles:true}));
  expect(message(el).hidden).toBe(false);
});
