// @vitest-environment jsdom
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {fromPavi} from '../src/pavi';
import {renderPanel} from '../src/viewer/panel';
import type {Core} from '../src/viewer/core';
import type {Alignment,ViewerOptions} from '../src/types';

const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(dispose=>dispose());document.body.replaceChildren();});
async function mount(a:Alignment,options:ViewerOptions={}) {
  const host=document.createElement('div');document.body.append(host);
  const viewer=createViewer(host,{worker:false,...options});disposers.push(()=>viewer.destroy());await viewer.setAlignment(a);
  const refresh=()=>renderPanel(viewer as unknown as Core);
  const select=(rowId:string,column:number)=>{viewer.setSelection({rowId,start:column,end:column});refresh();};
  return {host,viewer,refresh,select};
}
const protein=()=>createAlignment([
  {id:'a',name:'Alpha',sequence:'AR-X*'},
  {id:'b',name:'Beta',sequence:'AKDBZ',metadata:{start:10}},
  {id:'c',name:'Gamma',sequence:'A-QJL'},
],{alphabet:'protein'});
const cells=(host:HTMLElement)=>[...host.querySelectorAll('.ak-column-residues tbody tr')].map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent));

it('lists each visible sequence with its own residue and ungapped offset position',async()=>{
  const {host,select}=await mount(protein());select('b',3);
  expect(cells(host)).toEqual([['Alpha','Gap','—'],['Beta','D','12'],['Gamma','Q','2']]);
});
it('keeps the column list in display order after filtering, hiding and grouping',async()=>{
  const {host,viewer,select,refresh}=await mount(protein());select('b',2);
  viewer.setReference('b');await viewer.setSort('name');viewer.hideRows(['a']);refresh();
  expect(cells(host).map(row=>row[0])).toEqual(['Beta','Gamma']);
  viewer.setFilter('Alpha');refresh();expect(cells(host).map(row=>row[0])).toEqual(['Beta']);
  viewer.setFilter('');viewer.setGroups({c:'Other'});viewer.toggleGroup('Other',true);refresh();
  expect(cells(host).map(row=>row[0])).toEqual(['Beta']);
});
it('schedules a fresh column list when the row filter changes',async()=>{
  const {viewer,select}=await mount(protein());select('b',2);
  expect((viewer as unknown as Core).inspectorDirty).toBe(false);
  viewer.setFilter('Gamma');expect((viewer as unknown as Core).inspectorDirty).toBe(true);
});
it('paginates long column lists without losing the last sequence',async()=>{
  const a=createAlignment(Array.from({length:61},(_,i)=>({id:`r${i}`,name:`Sequence ${i+1}`,sequence:'A'})),{alphabet:'protein'});
  const {host,select}=await mount(a);select('r0',1);
  expect(cells(host).length).toBeGreaterThan(0);expect(cells(host).length).toBeLessThan(61);
  const next=host.querySelector<HTMLButtonElement>('[aria-label="Next column sequences"]')!;
  expect(next).not.toBeNull();while(!next.disabled)next.click();
  expect(cells(host).at(-1)).toEqual(['Sequence 61','A','1']);
});
it('uses the displayed nucleotide strand without amino-acid descriptions',async()=>{
  const {host,select}=await mount(createAlignment([{id:'a',name:'DNA',sequence:'AC-G'}],{alphabet:'dna'}),{reverseComplement:true});select('a',2);
  expect(cells(host)).toEqual([['DNA','G','2']]);
  expect(host.querySelector('.ak-residue-description')).toBeNull();
});
it.each([
  ['a',2,'Arginine','Basic'],['b',3,'Aspartic acid','Acidic'],['a',3,'Gap',''],
  ['a',4,'Unknown amino acid',''],['a',5,'Stop',''],['b',4,'Asparagine or aspartic acid','Ambiguous'],
  ['b',5,'Glutamine or glutamic acid','Ambiguous'],['c',4,'Isoleucine or leucine','Ambiguous'],
] as const)('describes protein %s column %i without assigning unknowns a chemical class',async(row,column,name,property)=>{
  const {host,select}=await mount(protein());select(row,column);
  const detail=host.querySelector('.ak-residue-description');expect(detail).not.toBeNull();
  expect(detail!.textContent).toBe(property?`${name} · ${property}`:name);
});
it('shows PAVI genomic context and non-coding details even without an alignment position',async()=>{
  const a=fromPavi('CLUSTAL W\n\nprot ARK\n',{prot:{embedded_variants:[{
    variant_id:'V:1',alignment_start_pos:2,alignment_end_pos:2,hgvs_protein:'p.Arg2Trp',impact:'MODERATE',
    genomic_seq_id:'chr2',genomic_start_pos:101,genomic_end_pos:101,genomic_ref_seq:'C',genomic_alt_seq:'T',
  }],non_coding_variants:[{variant_id:'V:2',impact:'MODIFIER',molecular_consequences:['intron_variant'],alignment_start_pos:1,alignment_end_pos:1} ]}});
  const {host,select,refresh}=await mount(a);select(a.rows[0].id,2);
  let details=host.querySelector('.ak-annotation-details')!;expect(details).not.toBeNull();
  for(const value of ['V:1','MODERATE','chr2:101','C → T'])expect(details.textContent).toContain(value);
  host.querySelector<HTMLButtonElement>('[data-tab="annotations"]')!.click();refresh();
  details=host.querySelectorAll<HTMLElement>('.ak-annotation-details')[1];
  expect(details.textContent).toContain('Non-coding');expect(details.textContent).toContain('MODIFIER');
  expect(details.textContent).not.toMatch(/undefined|NaN/);expect(a.annotations[1].mapping).toBe('unmapped');
});
it('renders application detail fields as text and ignores malformed or missing values',async()=>{
  const a=protein();a.annotations=[{id:'note',label:'Study note',rowId:'a',start:2,end:2,mapping:'mapped',metadata:{details:[
    {label:'Sample',value:'<img src=x onerror=alert(1)>'},{label:'Count',value:0},{label:'Missing',value:null},{label:'Invalid',value:{}},
  ]}}];
  const {host,select}=await mount(a);select('a',2);
  const details=host.querySelector('.ak-annotation-details')!;expect(details).not.toBeNull();
  expect(details.textContent).toContain('<img src=x onerror=alert(1)>');expect(details.textContent).toContain('0');
  expect(details.textContent).not.toMatch(/Missing|Invalid/);expect(details.querySelector('img')).toBeNull();
});
