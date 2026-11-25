// @vitest-environment jsdom
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {createViewer,type AlignmentViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {fromPavi} from '../src/pavi';
import {parseViewerConfig} from '../src/config';
import {render} from '../src/viewer/draw';
import type {Core} from '../src/viewer/core';
import type {Alignment,Annotation,ViewerOptions} from '../src/types';

const viewers:AlignmentViewer[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{viewers.splice(0).forEach(v=>v.destroy());document.body.replaceChildren();});
const variant=(id:string,start?:number,rowId='b'):Annotation=>({id,rowId,label:id,kind:'substitution',mapping:start?'mapped':'unmapped',...(start?{start,end:start}:{}),consequence:['missense_variant'],metadata:{variant:{type:'substitution',consequenceClass:'missense'}}});
const data=(annotations:Annotation[]=[]):Alignment=>{
  const a=createAlignment([{id:'a',name:'Alpha',sequence:'MKLAVRST',species:'Mus musculus'},{id:'b',name:'Beta',sequence:'MKLAVKST',species:'Homo sapiens'}],{alphabet:'protein'});
  a.annotations.push(...annotations);return a;
};
async function mount(a:Alignment=data(),options:ViewerOptions={},shadow=false){
  const host=document.createElement('div'),container=document.createElement('div');document.body.append(container);
  (shadow?container.attachShadow({mode:'open'}):container).append(host);
  const viewer=createViewer(host,{worker:false,...options});viewers.push(viewer);await viewer.setAlignment(a);
  const draw=()=>render(viewer as unknown as Core);
  const cards=()=>[...host.querySelectorAll<HTMLButtonElement>('[data-variant-card]')];
  const click=(id:string)=>{const card=cards().find(b=>b.dataset.variantCard===id);expect(card,`card ${id}`).toBeDefined();card!.click();draw();};
  return {host,viewer,draw,cards,click};
}
const action=(host:HTMLElement,name:string)=>{const button=host.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);expect(button).not.toBeNull();button!.click();};

it('shows mapped cards in navigation order and retains unmapped variants',async()=>{
  const {host,cards}=await mount(data([variant('late',6),variant('unmapped'),variant('early',2)]));
  expect(cards().map(b=>b.dataset.variantCard)).toEqual(['early','late','unmapped']);
  expect(cards()[2].textContent).toContain('No protein position');
  expect(cards()[2].textContent).not.toContain('Noncoding');
  expect(host.querySelector('.ak-variant-cards')?.textContent).toContain('2 mapped');
});

it('selects an exact coincident variant and opens its position inspector',async()=>{
  const {host,viewer,click,cards}=await mount(data([variant('one',3),variant('two',3),variant('three',5)]),{showInspector:false});
  let selected:Annotation|undefined;viewer.on('annotation',a=>selected=a);
  click('two');
  expect(viewer.getState().selection).toEqual({start:3,end:3,rowId:'b'});
  expect(viewer.getVisibility().inspector).toBe(true);
  expect(selected?.id).toBe('two');
  expect(cards().find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.variantCard).toBe('two');
  expect(host.querySelector('.ak-variant-nav output')?.textContent).toBe('2 / 3');
  expect(viewer.nextVariant()?.id).toBe('three');
});

it('shows unmapped details without changing the selected residue',async()=>{
  const a=fromPavi('>p\nMKLAVRST\n',{p:{non_coding_variants:[{variant_id:'utr',molecular_consequences:['3_prime_UTR_variant'],impact:'MODIFIER',genomic_seq_id:'11',genomic_start_pos:50,genomic_end_pos:50,genomic_ref_seq:'A',genomic_alt_seq:'C'}]}});
  const {host,viewer,cards,click}=await mount(a);viewer.setSelection({start:4,end:4,rowId:a.rows[0].id});
  click(a.annotations[0].id);
  expect(viewer.getState().selection).toEqual({start:4,end:4,rowId:a.rows[0].id});
  expect(cards()[0].textContent).toContain('Noncoding');
  const details=host.querySelector<HTMLElement>('.ak-variant-details');expect(details?.hidden).toBe(false);
  expect(details?.textContent).toContain('11:50');expect(details?.textContent).toContain('A → C');
});

it('keeps unknown evidence unknown and metadata as text',async()=>{
  const a=variant('unsafe',2);a.label='<img src=x onerror=alert(1)>';
  a.metadata={...a.metadata,details:[{label:'Impact',value:'<b>HIGH</b>'},{label:'bad',value:{html:'invalid'}}]};
  const {cards}=await mount(data([a]));
  expect(cards()).toHaveLength(1);expect(cards()[0].textContent).toContain('<img src=x onerror=alert(1)>');
  expect(cards()[0].textContent).toContain('<b>HIGH</b>');
  expect(cards()[0].querySelector('img,b')).toBeNull();
  expect(cards()[0].textContent).not.toMatch(/Disease|Phenotype|No evidence/);
});

it('uses alignment wording for unmapped nucleotide variants',async()=>{
  const a=createAlignment([{id:'b',name:'DNA',sequence:'ACGT'}],{alphabet:'dna'});a.annotations.push(variant('dna'));
  const {cards}=await mount(a);expect(cards()).toHaveLength(1);
  expect(cards()[0].textContent).toContain('No alignment position');expect(cards()[0].textContent).not.toContain('protein');
});

it('shares row, annotation and column filtering with the variant navigation',async()=>{
  const global={...variant('global',4),rowId:undefined};
  const {viewer,cards,host}=await mount(data([variant('ref',2,'a'),variant('hidden',5),variant('unmapped'),global]));
  viewer.hideColumns(2,2);expect(cards().map(b=>b.dataset.variantCard)).toEqual(['global','hidden','unmapped']);
  viewer.hideRows(['b']);expect(cards().map(b=>b.dataset.variantCard)).toEqual(['global']);
  viewer.setAnnotationFilter({consequences:['stop_gained']});expect(cards()).toHaveLength(0);
  expect(host.querySelector('.ak-variant-cards')?.textContent).toContain('No variants match');
  viewer.setAnnotationFilter({});viewer.showRows();viewer.showColumns();
  expect(cards().map(b=>b.dataset.variantCard)).toEqual(['ref','global','hidden','unmapped']);
});

it('retains cards for collapsed groups and expands a clicked variant row',async()=>{
  const {viewer,cards,click}=await mount(data([variant('grouped',3)]));
  viewer.setGroups({a:'reference',b:'other'});viewer.toggleGroup('other',true);
  expect(cards().map(b=>b.dataset.variantCard)).toEqual(['grouped']);click('grouped');
  expect(viewer.getVisibleRows()).toContain('b');
});

it('bounds card rendering and follows navigation across pages',async()=>{
  const {host,viewer,cards,draw}=await mount(data(Array.from({length:45},(_,i)=>variant(`v${i}`,3))));
  expect(cards()).toHaveLength(20);action(host,'variant-cards-next');draw();
  expect(cards()).toHaveLength(20);expect(cards()[0].dataset.variantCard).toBe('v20');
  for(let i=0;i<41;i++)viewer.nextVariant();draw();
  expect(cards()).toHaveLength(5);expect(cards()[0].dataset.variantCard).toBe('v40');
  expect(cards()[0].getAttribute('aria-pressed')).toBe('true');
});

it.each([false,true])('preserves card focus across evidence updates (shadow root: %s)',async(shadow)=>{
  const {host,viewer,cards}=await mount(data([variant('v',3)]),{},shadow);cards()[0].focus();
  await viewer.setAlignment(data([{...variant('v',3),disease:true}]));
  expect((host.getRootNode() as Document|ShadowRoot).activeElement).toBe(cards()[0]);expect(cards()[0].textContent).toContain('Disease');
  action(host,'variant-cards-toggle');
  await viewer.setAlignment(data([{...variant('v',3),phenotype:true}]));
  expect(host.querySelector('[data-action="variant-cards-toggle"]')?.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector<HTMLElement>('.ak-variant-cards-content')?.hidden).toBe(true);
});

it('hides the strip without variants and obeys its independent visibility option',async()=>{
  const {host,viewer}=await mount();const strip=host.querySelector<HTMLElement>('.ak-variant-cards');expect(strip).not.toBeNull();expect(strip!.hidden).toBe(true);
  viewer.addVariants([{rowId:'b',position:2}]);expect(strip!.hidden).toBe(false);
  viewer.setOptions(parseViewerConfig({visibility:{variantCards:false}}));expect(strip!.hidden).toBe(true);
  viewer.setOptions(parseViewerConfig({visibility:{variantCards:true}}));expect(strip!.hidden).toBe(false);
  await viewer.setAlignment(data());expect(strip!.hidden).toBe(true);
});

it('reveals the active card when filters move it onto another page',async()=>{
  const variants=Array.from({length:45},(_,i)=>({...variant(`v${i}`,3),disease:i>=20}));
  const {viewer,cards,draw}=await mount(data(variants));
  for(let i=0;i<26;i++)viewer.nextVariant();draw();expect(cards()[5].dataset.variantCard).toBe('v25');
  viewer.setAnnotationFilter({disease:true});
  expect(cards().find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.variantCard).toBe('v25');
});

it('updates annotation evidence atomically without resetting selection or focused unmapped details',async()=>{
  const {host,viewer,cards,click}=await mount(data([variant('first',2),variant('second',5),variant('utr')]),{focusFirstVariant:true});
  click('second');click('utr');cards()[2].focus();
  const selection=viewer.getState().selection;
  viewer.updateAnnotations([{...variant('utr'),phenotype:true},{...variant('second',5),disease:true}]);
  expect(viewer.getState().selection).toEqual(selection);expect(document.activeElement).toBe(cards()[2]);
  expect(cards()[2].getAttribute('aria-pressed')).toBe('true');expect(host.querySelector('.ak-variant-details')?.textContent).toContain('phenotype');
  expect(viewer.getAlignment()!.annotations.find(n=>n.id==='first')).toBeDefined();
  expect(()=>viewer.updateAnnotations([variant('second',6),variant('unknown',1)])).toThrow(/Unknown annotation/);
  expect(viewer.getAlignment()!.annotations.find(n=>n.id==='second')?.start).toBe(5);
  expect(()=>viewer.updateAnnotations([variant('second',99)])).toThrow(/invalid alignment coordinates/);
  expect(()=>viewer.updateAnnotations([variant('second',2),variant('second',3)])).toThrow(/Duplicate/);
});

it('keeps a manually browsed page and focus when evidence changes without reordering cards',async()=>{
  const {host,viewer,cards,draw}=await mount(data(Array.from({length:45},(_,i)=>variant(`v${i}`,3))));
  for(let i=0;i<41;i++)viewer.nextVariant();draw();
  action(host,'variant-cards-prev');action(host,'variant-cards-prev');const focused=cards()[5];focused.focus();
  viewer.updateAnnotations([{...variant('v5',3),disease:true}]);
  expect(cards()[0].dataset.variantCard).toBe('v0');expect(document.activeElement).toBe(focused);expect(focused.textContent).toContain('Disease');
});
