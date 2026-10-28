// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createAlignment} from '../src/model';
import {summarizeColumns,variableColumns,analyzeColumns} from '../src/summary';
import {exportVariableColumns} from '../src/export';
import {createViewer} from '../src/viewer';
import {renderPanel} from '../src/viewer/panel';
import {parseViewerConfig} from '../src/config';
import {defaultVisibility} from '../src/visibility';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const ROWS=['ACGT-A','ACGT-C','ACAT-G','ATA--T'];
const dna=(rows=ROWS,start?:number)=>createAlignment(rows.map((sequence,i)=>({name:`r${i+1}`,sequence,metadata:i===0&&start?{start}:undefined})),{alphabet:'dna'});

it('counts column classes by hand',()=>{
  const s=summarizeColumns(dna());
  expect(s).toMatchObject({start:1,end:6,columns:6,rows:4,referenceId:'seq-1',conserved:1,constantWithGaps:1,variable:3,singleton:2,parsimonyInformative:1,gapOnly:1});
  expect(s.conserved+s.constantWithGaps+s.variable+s.gapOnly).toBe(6);
  expect(s.gapFraction).toBeCloseTo(5/24,10);
  expect(s.meanPairwiseIdentity).toBeCloseTo(14/27,10);
  expect(s.identityToReference).toEqual({matches:8,compared:14,identity:8/14});
  expect(s.rowGc!.map(r=>r.gc)).toEqual([0.4,0.6,0.4,0]);
  expect(s.rowGc!.map(r=>r.bases)).toEqual([5,5,5,4]);
});
it('lists variable columns with reference residue numbers and allele counts',()=>{
  const v=variableColumns(dna());
  expect(v).toEqual({total:3,truncated:false,columns:[
    {column:2,referenceResidue:2,reference:'C',alleles:[{residue:'C',count:3},{residue:'T',count:1}],gapCount:0,kind:'singleton'},
    {column:3,referenceResidue:3,reference:'G',alleles:[{residue:'A',count:2},{residue:'G',count:2}],gapCount:0,kind:'informative'},
    {column:6,referenceResidue:5,reference:'A',alleles:[{residue:'A',count:1},{residue:'C',count:1},{residue:'G',count:1},{residue:'T',count:1}],gapCount:0,kind:'singleton'},
  ]});
  expect(exportVariableColumns(v)).toBe('column\treference_residue_number\treference_residue\talleles\tgap_count\tclass\n2\t2\tC\tC:3,T:1\t0\tsingleton\n3\t3\tG\tA:2,G:2\t0\tinformative\n6\t5\tA\tA:1,C:1,G:1,T:1\t0\tsingleton\n');
});
it('honors the row offset, another reference row and a gap in the reference',()=>{
  expect(variableColumns(dna(ROWS,10)).columns.map(c=>c.referenceResidue)).toEqual([11,12,14]);
  const r4=variableColumns(dna(),{reference:3});
  expect(r4.columns.map(c=>[c.column,c.referenceResidue,c.reference])).toEqual([[2,2,'T'],[3,3,'A'],[6,4,'T']]);
  const gap=variableColumns(dna(['A-C','ACG','ACT']));
  expect(gap.columns[0]).toMatchObject({column:3,referenceResidue:2});
  const g2=variableColumns(dna(['AC-','ACG','ACT']));expect(g2.columns[0]).toMatchObject({column:3,referenceResidue:null,reference:'-',gapCount:1});
});
it('restricts to a column block and to chosen rows',()=>{
  const block=summarizeColumns(dna(),{start:2,end:3});
  expect(block).toMatchObject({start:2,end:3,columns:2,conserved:0,variable:2,singleton:1,parsimonyInformative:1,gapFraction:0});
  expect(block.meanPairwiseIdentity).toBeCloseTo(5/12,10);
  expect(block.identityToReference).toEqual({matches:3,compared:6,identity:0.5});
  expect(block.rowGc!.map(r=>r.gc)).toEqual([1,1,0.5,0]);
  expect(variableColumns(dna(),{start:2,end:3}).columns.map(c=>[c.column,c.referenceResidue])).toEqual([[2,2],[3,3]]);
  const subset=summarizeColumns(dna(),{rows:[0,3]});
  expect(subset).toMatchObject({rows:2,conserved:1,constantWithGaps:1,variable:3,singleton:3,parsimonyInformative:0,gapOnly:1});
  expect(subset.rowGc!.map(r=>r.name)).toEqual(['r1','r4']);
});
it('has no GC for protein and no identity to the reference for one row',()=>{
  const p=createAlignment([{name:'a',sequence:'MKV-'},{name:'b',sequence:'MRV-'},{name:'c',sequence:'MRI-'}],{alphabet:'protein'});
  expect(summarizeColumns(p)).toMatchObject({conserved:1,variable:2,gapOnly:1,rowGc:null,parsimonyInformative:0,singleton:2});
  expect(summarizeColumns(p).meanPairwiseIdentity).toBeCloseTo(((3)+(1)+(1))/(3+3+3),10);
  expect(summarizeColumns(dna(),{rows:[1],reference:1}).identityToReference).toBeNull();
});
it('limits the list and keeps the exact total',()=>{
  const v=variableColumns(dna(),{limit:2});
  expect(v.columns.map(c=>c.column)).toEqual([2,3]);expect(v).toMatchObject({total:3,truncated:true});
  expect(analyzeColumns(dna(),{limit:0}).summary.variable).toBe(3);
});
it('agrees across the 4096-column block boundary',()=>{
  const width=9000,a='A'.repeat(width),b=[...a].map((c,i)=>[4095,4096,8999].includes(i)?'G':c).join('');
  const al=createAlignment([{name:'a',sequence:a},{name:'b',sequence:b},{name:'c',sequence:a}],{alphabet:'dna'});
  const v=variableColumns(al);
  expect(v.columns.map(c=>[c.column,c.referenceResidue])).toEqual([[4096,4096],[4097,4097],[9000,9000]]);
  expect(summarizeColumns(al)).toMatchObject({conserved:8997,variable:3,singleton:3});
});
it('rejects invalid scopes',()=>{
  expect(()=>summarizeColumns(dna(),{start:0})).toThrow(/range/);
  expect(()=>summarizeColumns(dna(),{start:4,end:3})).toThrow(/range/);
  expect(()=>summarizeColumns(dna(),{end:7})).toThrow(/range/);
  expect(()=>summarizeColumns(dna(),{reference:9})).toThrow(/reference/);
  expect(()=>summarizeColumns(dna(),{rows:[]})).toThrow(/at least one/);
  expect(()=>summarizeColumns(dna(),{rows:[7]})).toThrow(/row/);
});
const viewer=async(options={})=>{
  const v=createViewer(host(),{worker:false,...options});disposers.push(()=>v.destroy());
  await v.load('>r1\nACGT-A\n>r2\nACGT-C\n>r3\nACAT-G\n>r4\nATA--T\n');
  return v;
};
it('adds summaryTab, on by default and accepted in configuration',()=>{
  expect(defaultVisibility.summaryTab).toBe(true);
  expect(parseViewerConfig({visibility:{summaryTab:false}})).toEqual({visibility:{summaryTab:false}});
});
it('getSummary and getVariableColumns follow the statistics scope',async()=>{
  const v=await viewer();
  expect(await v.getSummary()).toMatchObject({rows:4,variable:3});
  expect((await v.getVariableColumns()).total).toBe(3);
  expect(await v.getSummary({start:2,end:3})).toMatchObject({columns:2,variable:2});
  v.setFilter('r1');v.setOptions({statisticsScope:'filtered'});
  expect(await v.getSummary()).toMatchObject({rows:1,variable:0,conserved:5});
  expect(await v.getSummary({rows:'all'})).toMatchObject({rows:4});
  await expect(v.getSummary({referenceId:'nope'})).rejects.toThrow(/Unknown reference/);
  await expect(v.getSummary({end:99})).rejects.toThrow(/range/);
});
it('rejects before an alignment is loaded',async()=>{
  const v=createViewer(host(),{worker:false});disposers.push(()=>v.destroy());
  await expect(v.getSummary()).rejects.toThrow(/No alignment/);
});
it('shows the whole alignment, then the selected block, in the Summary tab',async()=>{
  const v=await viewer(),root=(v as any).root as HTMLElement,panel=()=>{renderPanel((v as any).core);return root.querySelector('.ak-inspector-content')!.textContent!;};
  (v as any).tab='summary';
  expect(panel()).toContain('Calculating summary');
  await v.getSummary();
  const all=panel();
  expect(all).toContain('All columns (6)');expect(all).toContain('Variable columns (3)');expect(all).toContain('51.9%');
  v.setSelection({start:2,end:3});
  expect((v as any).tab).toBe('summary');
  expect(panel()).toContain('Calculating summary');
  await v.getSummary({start:2,end:3});
  const block=panel();
  expect(block).toContain('Selected columns 2–3');expect(block).toContain('Variable columns (2)');expect(block).toContain('41.7%');expect(block).toContain('50.0%');expect(block).toContain('0.0%');
  expect(root.querySelector('.ak-variants tbody')!.children.length).toBe(2);
  v.setSelection({start:2,end:2});
  await v.getSummary();
  expect(panel()).toContain('All columns (6)');
});
it('paginates the variable-column table',async()=>{
  const width=60,a='A'.repeat(width),b='C'.repeat(width);
  const v=createViewer(host(),{worker:false});disposers.push(()=>v.destroy());
  await v.load(`>a\n${a}\n>b\n${b}\n`);
  const root=(v as any).root as HTMLElement,text=()=>{renderPanel((v as any).core);return root.querySelector('.ak-inspector-content')!.textContent!;};
  (v as any).tab='summary';text();await v.getSummary();
  expect(text()).toContain('1 / 3');
  root.querySelector<HTMLElement>('[data-action="summary-next"]')!.click();await Promise.resolve();
  expect(text()).toContain('2 / 3');
  expect(root.querySelector('.ak-variants tbody tr td')!.textContent).toBe('21');
  root.querySelector<HTMLElement>('[data-action="summary-prev"]')!.click();await Promise.resolve();
  expect(text()).toContain('1 / 3');
});
it('shows an error when the filter leaves no rows',async()=>{
  const v=await viewer({statisticsScope:'filtered'}),root=(v as any).root as HTMLElement;
  v.setFilter('zzz');(v as any).tab='summary';
  renderPanel((v as any).core);await new Promise(r=>setTimeout(r,5));renderPanel((v as any).core);
  expect(root.querySelector('.ak-inspector-content')!.textContent).toContain('at least one row');
});
it('exports the variable columns of the selected block as TSV',async()=>{
  const v=await viewer(),files:{name:string;blob:Blob}[]=[];
  let pending:Blob|undefined;
  URL.createObjectURL=(blob:Blob|MediaSource)=>{pending=blob as Blob;return 'blob:test';};URL.revokeObjectURL=()=>{};
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){files.push({name:this.download,blob:pending!});});
  const read=(blob:Blob)=>new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsText(blob);});
  await (v as any).export('variants');
  v.setSelection({start:3,end:6});await (v as any).export('variants');
  expect(files.map(f=>f.name)).toEqual(['variable-columns.tsv','variable-columns.tsv']);
  expect((await read(files[0].blob)).trim().split('\n').length).toBe(4);
  expect((await read(files[1].blob)).trim().split('\n').slice(1).map(l=>l.split('\t')[0])).toEqual(['3','6']);
});
