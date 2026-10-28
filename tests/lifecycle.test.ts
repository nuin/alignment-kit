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
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const data=()=>parseAlignment('>a\nA-CG\n>b\nATCG\n>c\nAT-G',{alphabet:'dna'});
it('updates palette choices and colors when the alignment alphabet changes',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());expect(viewer.getState().colorScheme).toBe('soft-nucleotide');
  const palette=el.querySelector<HTMLSelectElement>('select[aria-label="Color scheme"]')!;
  expect([...palette.options].map(o=>o.value)).toContain('purine');expect([...palette.options].map(o=>o.value)).not.toContain('taylor');
  const type=el.querySelector<HTMLSelectElement>('select[aria-label="Sequence alphabet"]')!;
  type.value='protein';type.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(viewer.getAlignment()?.alphabet).toBe('protein'));
  expect(viewer.getState().colorScheme).toBe('soft');expect([...palette.options].map(o=>o.value)).toContain('taylor');
  expect(el.querySelector('[role=combobox][aria-label="Sequence alphabet"]')?.textContent).toBe('Protein');
  await viewer.setAlignment(parseAlignment('>rna\nACGU',{alphabet:'rna'}));expect(viewer.getState().colorScheme).toBe('soft-nucleotide');
  viewer.setOptions({theme:'dark',colorScheme:'soft'});expect(viewer.getState().colorScheme).toBe('soft-nucleotide');
});
it('emits ready only for the latest load of the same alignment object',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());const a=data(),ready=vi.fn(()=>expect(viewer.getStatistics()).toBeDefined());
  viewer.on('ready',ready);await Promise.all([viewer.setAlignment(a),viewer.setAlignment(a)]);expect(ready).toHaveBeenCalledOnce();
});
it('maintains exact statistics across filters, reference changes and selections',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());
  expect(viewer.getStatistics()?.total).toBe(3);
  viewer.setFilter('b');expect(viewer.getStatistics()?.total).toBe(3);
  viewer.setReference('seq-2');expect(viewer.getState().referenceId).toBe('seq-2');
  viewer.setSelection({start:2,end:3,rowId:'seq-3'});expect(viewer.getState().selection?.rowId).toBe('seq-3');
  viewer.setOptions({statisticsScope:'filtered'});await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(1));
  viewer.setFilter('missing');await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(0));
});
it('uses current callbacks and replaces data without remounting',async()=>{
  const first=vi.fn(),second=vi.fn(),a=data(),controller=mountViewer(host(),{alignment:a,options:{worker:false},onSelectionChange:first});disposers.push(()=>controller.destroy());
  await vi.waitFor(()=>expect(controller.viewer.getStatistics()).toBeDefined());
  controller.viewer.setSelection({start:1,end:1});expect(first).toHaveBeenCalledOnce();
  const b=parseAlignment('>new\nGG',{alphabet:'dna'});
  controller.update({alignment:b,options:{worker:false,theme:'dark'},onSelectionChange:second});
  await vi.waitFor(()=>expect(controller.viewer.getStatistics()?.width).toBe(2));
  controller.viewer.setSelection({start:2,end:2});expect(second).toHaveBeenCalledOnce();expect(first).toHaveBeenCalledOnce();
  expect(document.querySelectorAll('.ak-viewer')).toHaveLength(1);
});
it('cancels stale loads and removes listeners and DOM on destroy',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false}),handler=vi.fn();
  viewer.on('ready',handler);
  const one=viewer.load('>old\nAAAA'),two=viewer.load('>new\nCC');
  await Promise.all([one,two]);expect(viewer.getAlignment()?.rows[0].name).toBe('new');expect(handler).toHaveBeenCalledOnce();
  viewer.destroy();viewer.destroy();expect(el.children).toHaveLength(0);
  expect(()=>viewer.setFilter('x')).toThrow(/destroyed/);
});
it('restores state only for the correct dataset and maps ungapped motifs through gaps',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());
  viewer.findMotif('ACG');expect(viewer.getState().selection).toMatchObject({start:1,end:4,rowId:'seq-1'});
  viewer.setOptions({visibility:{overview:false}});const state=viewer.getState();viewer.setSelection(null);viewer.setOptions({visibility:{overview:true}});await viewer.setState(state);expect(viewer.getState().selection?.start).toBe(1);expect(viewer.getVisibility().overview).toBe(false);
  await viewer.setState({...state,visibility:undefined});expect(viewer.getVisibility().overview).toBe(false);
  await expect(viewer.setState({...state,alignmentId:'wrong'})).rejects.toThrow(/different alignment/);
});
it('clears reactive alignment props and refuses A3M URL input',async()=>{
  const controller=mountViewer(host(),{alignment:data(),options:{worker:false}});disposers.push(()=>controller.destroy());
  await vi.waitFor(()=>expect(controller.viewer.getAlignment()).toBeDefined());
  controller.update({alignment:undefined,options:{worker:false}});
  expect(controller.viewer.getAlignment()).toBeUndefined();
  await expect(controller.viewer.loadUrl('https://example.org/test.a3m')).rejects.toThrow(/A3M/);
});
it('merges visibility patches, preserves data, and restores the reference to the matrix when unpinned visually',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false,visibility:{open:false,overview:false}});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());viewer.setSelection({start:2,end:3,rowId:'seq-2'});
  expect(el.querySelector<HTMLElement>('[data-action="open"]')!.hidden).toBe(true);
  expect(el.querySelector<HTMLElement>('.ak-overview-wrap')!.hidden).toBe(true);
  viewer.setOptions({visibility:{labels:false,reference:false,tracks:false}});
  expect(el.querySelector<HTMLElement>('.ak-viewer')!.style.getPropertyValue('--ak-gutter')).toBe('0px');
  expect(el.querySelector<HTMLElement>('.ak-spacer')!.style.height).toBe('108px');
  expect(viewer.getStatistics()?.total).toBe(3);expect(viewer.getState().selection).toMatchObject({start:2,end:3});
  expect(viewer.getVisibility().open).toBe(false);
  viewer.setOptions({visibility:{labels:true,tracks:true,reference:true,overview:true}});
  expect(el.querySelector<HTMLElement>('.ak-spacer')!.style.height).toBe('72px');
  expect(el.querySelector<HTMLElement>('.ak-viewer')!.style.getPropertyValue('--ak-gutter')).toBe('230px');
  expect(el.querySelector<HTMLElement>('.ak-overview-wrap')!.hidden).toBe(false);
  expect(el.querySelector<HTMLElement>('[data-action="open"]')!.hidden).toBe(true);
});
it('collapses disabled track heights and supports legacy aliases and integration updates',async()=>{
  const el=host(),alignment=data(),controller=mountViewer(el,{alignment,options:{worker:false,visibility:{ruler:false,modalFrequency:false,gapFraction:false,consensus:false,reference:false}}});disposers.push(()=>controller.destroy());
  await vi.waitFor(()=>expect(controller.viewer.getStatistics()).toBeDefined());
  expect(el.querySelector<HTMLElement>('.ak-tracks')!.hidden).toBe(true);
  controller.update({alignment,options:{visibility:{logo:true,tools:false},showToolbar:true}});
  expect(el.querySelector<HTMLElement>('.ak-tracks')!.style.height).toBe('45px');
  expect(el.querySelector<HTMLElement>('.ak-tools')!.hidden).toBe(true);
  expect(el.querySelector<HTMLElement>('.ak-toolbar')!.hidden).toBe(false);
  controller.viewer.setOptions({showLogo:false,showInspector:false,showToolbar:false});
  expect(el.querySelector<HTMLElement>('.ak-tracks')!.hidden).toBe(true);
  expect(el.querySelector<HTMLElement>('.ak-inspector')!.hidden).toBe(true);
  expect(controller.viewer.getVisibility().logo).toBe(false);
});
it('lists every export choice in the toolbar menu',()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  const exportMenu=el.querySelector<HTMLSelectElement>('select[aria-label="Export alignment"]')!;
  expect([...exportMenu.options].map(o=>o.value)).toEqual(['','fasta-all','fasta','clustal-all','clustal','stockholm-all','stockholm','phylip-all','phylip','nexus-all','nexus','svg','png','consensus','tsv','state','fasta-options']);
});
it('keeps identity ordering when a pairwise comparison starts during the sort',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());const internal=viewer as any;
  await viewer.setAlignment(parseAlignment('>a\nACGT\n>b\nTTTT\n>c\nACGA',{alphabet:'dna'}));
  internal.selectedRows.add('seq-1');internal.selectedRows.add('seq-2');internal.tab='compare';
  const sorted=viewer.setSort('identity'),compared=internal.action('compare');internal.tab='position';
  await Promise.all([sorted,compared]);
  expect(internal.rows.map((i:number)=>viewer.getAlignment()!.rows[i].name)).toEqual(['c','b']);
  expect(document.querySelector('.ak-message')!.textContent).toBe('');
});
it('copies the clicked row, else checked rows in display order with filtered-out rows last',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());
  viewer.setSelection({start:2,end:3,rowId:'seq-2'});expect(viewer.getSelectionText()).toBe('>consensus columns 2-3; all rows (3); threshold 0\nTC\n>b\nTC\n');
  (viewer as any).selectedRows=new Set(['seq-3','seq-2','seq-1']);
  viewer.setFilter('c');viewer.setSelection({start:1,end:4});
  expect(viewer.getSelectionText()).toBe('>consensus columns 1-4; all rows (3); threshold 0\nATCG\n>a\nA-CG\n>c\nAT-G\n>b\nATCG\n');
});
it('writes the copy to the clipboard on Ctrl/Cmd+C and reports clipboard failures',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());viewer.setSelection({start:1,end:2,rowId:'seq-3'});
  const writeText=vi.fn(async(_:string)=>{});Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
  const scroll=el.querySelector<HTMLElement>('.ak-scroll')!,key=new KeyboardEvent('keydown',{key:'c',metaKey:true,bubbles:true,cancelable:true});
  scroll.dispatchEvent(key);expect(key.defaultPrevented).toBe(true);expect(writeText).toHaveBeenCalledWith('>consensus columns 1-2; all rows (3); threshold 0\nAT\n>c\nAT\n');
  await vi.waitFor(()=>expect(el.querySelector('.ak-live')!.textContent).toBe('Copied 1 sequence, columns 1–2, as FASTA.'));
  Reflect.deleteProperty(navigator,'clipboard');const errors=vi.fn();viewer.on('error',errors);
  await expect(viewer.copySelection()).rejects.toThrow('secure');expect(errors).toHaveBeenCalledOnce();
});
it('copies at least one column in a zero-width viewer and ignores Ctrl+Shift+C',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());(viewer as any).selectedRows=new Set(['seq-2']);
  expect(viewer.getSelectionText()).toBe('>consensus columns 1-1; all rows (3); threshold 0\nA\n>b\nA\n');
  const key=new KeyboardEvent('keydown',{key:'C',code:'KeyC',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true});
  el.querySelector('.ak-scroll')!.dispatchEvent(key);expect(key.defaultPrevented).toBe(false);
});
it('applies a view link leniently and reports settings that do not fit',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());
  const skipped=await viewer.applyViewLink('aln=other&sel=2-3&row=seq-2&ref=seq-9&scheme=taylor&mode=consensus-matches&zoom=20&q=b');
  expect(skipped).toEqual(['scheme','ref']);
  const state=viewer.getState();
  expect([state.selection,state.colorMode,state.cellWidth,state.query,state.colorScheme]).toEqual([{start:2,end:3,rowId:'seq-2'},'consensus-matches',20,'b','soft-nucleotide']);
  expect(document.querySelector('.ak-message')!.textContent).toBe('This link was made for a different version of this alignment. Skipped link settings: scheme, ref.');
  expect(await viewer.applyViewLink('sel=9')).toEqual(['sel']);expect(viewer.getState().selection).toBeNull();
});
it('restores a link from location.hash on load and keeps the hash in sync',async()=>{
  history.replaceState(null,'','/#sel=3&row=seq-3&zoom=10');
  const viewer=createViewer(host(),{worker:false,urlSync:true});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());
  expect(viewer.getState().selection).toEqual({start:3,end:3,rowId:'seq-3'});expect(viewer.getState().cellWidth).toBe(10);
  viewer.setSelection({start:1,end:2,rowId:'seq-1'});
  await vi.waitFor(()=>expect(location.hash).toContain('sel=1-2&row=seq-1'),{timeout:2000});
  expect(location.hash).not.toContain('src=');
  history.replaceState(null,'','/');
});
it('includes src only for alignments loaded from a URL',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());
  const original=globalThis.fetch;vi.stubGlobal('fetch',vi.fn(async()=>new Response('>a\nACGT\n>b\nACGA')));
  await viewer.loadUrl('https://example.org/data/a.fasta');
  expect(new URLSearchParams(viewer.getViewLink()).get('src')).toBe('https://example.org/data/a.fasta');
  await viewer.setAlignment(data());expect(viewer.getViewLink()).not.toContain('src=');
  vi.stubGlobal('fetch',original);
});
it('ignores in-page anchors and resets missing scroll fields when applying a link',async()=>{
  history.replaceState(null,'','/');
  const el=host(),viewer=createViewer(el,{worker:false,urlSync:true});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(data());viewer.setSelection({start:2,end:2,rowId:'seq-2'});
  history.replaceState(null,'','/#viewer');window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(viewer.getState().selection).toEqual({start:2,end:2,rowId:'seq-2'});
  const scroll=el.querySelector<HTMLElement>('.ak-scroll')!;Object.defineProperty(scroll,'scrollLeft',{value:96,writable:true});
  await viewer.applyViewLink('sel=1');expect(scroll.scrollLeft).toBe(0);
  history.replaceState(null,'','/');
});
it('exposes the consensus through the API with an overridable threshold',async()=>{
  const viewer=createViewer(host(),{worker:false,consensusThreshold:1});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment('>a\nACGT\n>b\nACGA\n>c\nTCG-',{alphabet:'dna'}));
  expect(viewer.getConsensus()).toBe('NCGN');expect(viewer.getConsensus({threshold:0})).toBe('ACGW');
});
it('applies FASTA options from the export panel to copy, consensus included',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment('>a sp\nAc-G\n>b\nACTG',{alphabet:'dna'}));viewer.setSelection({start:1,end:4,rowId:'seq-1'});
  const menu=el.querySelector<HTMLSelectElement>('select[aria-label="Export alignment"]')!,panel=el.querySelector<HTMLElement>('.ak-fasta-options')!;
  menu.value='fasta-options';menu.dispatchEvent(new Event('change',{bubbles:true}));expect(panel.hidden).toBe(false);
  for(const [label,value] of [['FASTA gaps','remove'],['FASTA letter case','lower'],['FASTA header','id-name']]){const select=el.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}
  expect(viewer.getSelectionText()).toBe('>consensus columns 1-4; all rows (2); threshold 0\nactg\n>seq-1 a sp\nacg\n');
  panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(panel.hidden).toBe(true);
  viewer.setOptions({fasta:{lineWidth:120}});expect(el.querySelector<HTMLSelectElement>('select[aria-label="FASTA line width"]')!.value).toBe('120');
  expect(()=>viewer.setOptions({fasta:{lineWidth:5}})).toThrow('line width');
});
