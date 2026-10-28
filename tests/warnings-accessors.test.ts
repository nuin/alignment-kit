// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {exportStockholm} from '../src/export';
import {createAlignment} from '../src/model';
import {parseViewerConfig} from '../src/config';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const codes=(text:string,options={})=>(parseAlignment(text,options).metadata.warnings??[]).map(w=>w.code);

it('renames repeated FASTA names with a suffix and warns',()=>{
  const a=parseAlignment('>x\nACGT\n>x\nACGA\n>x_2\nACGG\n>x\nACGC');
  expect(a.rows.map(r=>r.name)).toEqual(['x','x_3','x_2','x_4']);
  const w=a.metadata.warnings!;
  expect(w.map(x=>x.code)).toEqual(['duplicate-id','duplicate-id']);
  expect(w[0]).toMatchObject({rowId:'seq-2',line:3});expect(w[0].message).toContain('x_3');
});
it('replaces invalid residues with N for nucleotides and X for protein',()=>{
  const dna=parseAlignment('>a\nAC?GT\n>b\nACGT1');
  expect(dna.rows.map(r=>r.sequence)).toEqual(['ACNGT','ACGTN']);
  expect(dna.metadata.warnings).toHaveLength(2);expect(dna.metadata.warnings![0]).toMatchObject({code:'invalid-residue',rowId:'seq-1',line:1});
  expect(dna.metadata.warnings![0].message).toMatch(/with N.*“\?” at column 3/);
  expect(dna.alphabet).toBe('dna');
  const protein=parseAlignment('>a\nMKV?L\n>b\nMKVIL');
  expect(protein.rows[0].sequence).toBe('MKVXL');expect(protein.metadata.warnings![0].message).toContain('with X');
  expect(parseAlignment('>a\nAC?GT',{alphabet:'protein'}).rows[0].sequence).toBe('ACXGT');
});
it('rejects unequal lengths unless padShort is set, then pads and warns per row',()=>{
  expect(()=>parseAlignment('>a\nACGT\n>b\nAC')).toThrow(/length/);
  for(const text of ['>a\nACGT\n>b\nAC','>P1;x\nd\nACGT*\n>P1;y\nd\nAC*']){
    const a=parseAlignment(text,{padShort:true});
    expect(a.rows.map(r=>r.sequence)).toEqual(['ACGT','AC--']);
    expect(a.metadata.warnings).toEqual([expect.objectContaining({code:'unequal-length',rowId:'seq-2'})]);
  }
  expect(parseAlignment('>a\nAC\n>b\nACGT',{padShort:true}).rows.map(r=>r.sequence)).toEqual(['AC--','ACGT']);
  expect(codes('>a\nACGT\n>b\nACGA',{padShort:true})).toEqual([]);
});
it('reads strict PHYLIP names that fill all 10 characters without a warning',()=>{
  const a=parseAlignment('2 12\nabcdefghijACGTACGTACGT\nklmnopqrstACGTACGTACGT');
  expect(a.rows.map(r=>r.name)).toEqual(['abcdefghij','klmnopqrst']);expect(a.metadata.warnings).toBeUndefined();
  expect(codes('2 4\none ACGT\ntwo ACGA')).toEqual([]);
});
it('repairs invalid residues in Stockholm and CLUSTAL with a warning and line number',()=>{
  const s=parseAlignment('# STOCKHOLM 1.0\na ACG1\nb ACGT\n//');
  expect(s.rows.map(r=>r.sequence)).toEqual(['ACGN','ACGT']);expect(s.metadata.warnings).toEqual([expect.objectContaining({code:'invalid-residue',rowId:'seq-1',line:2})]);
  const c=parseAlignment('CLUSTAL W\n\na ACG?T 5\nb ACGTT 5\n         ***:*');
  expect(c.rows.map(r=>r.sequence)).toEqual(['ACGNT','ACGTT']);expect(c.metadata.warnings).toEqual([expect.objectContaining({code:'invalid-residue',rowId:'seq-1',line:3})]);
});
it('leaves clean input without a warnings entry',()=>{
  expect(parseAlignment('>a\nACGT\n>b\nACGA').metadata.warnings).toBeUndefined();
});
const sto=`# STOCKHOLM 1.0
#=GF ID FAM
#=GF XX custom field
#=GS a WT 1.0
#=GS a ZZ own tag
a ACGT
#=GR a PP 9999
#=GR a QQ abcd
b AC-T
#=GC RF xxxx
#=GC MYGC 1234
//`;
it('keeps unknown Stockholm tags, warns once per tag and round-trips them',()=>{
  const a=parseAlignment(sto);
  const w=a.metadata.warnings!;
  expect(w.every(x=>x.code==='unknown-stockholm-tag')).toBe(true);
  expect(w.map(x=>x.message.match(/#=(\w+) tag “(\w+)”/)!.slice(1).join(' '))).toEqual(['GF XX','GS ZZ','GR QQ','GC MYGC']);
  expect(w[0].line).toBe(3);
  const out=exportStockholm(a),b=parseAlignment(out);
  expect(b.metadata.stockholm).toEqual(a.metadata.stockholm);
  expect(b.name).toBe('FAM');expect(b.rows.map(r=>r.sequence)).toEqual(['ACGT','AC-T']);
  expect(out).toContain('#=GF XX custom field');expect(out).toContain('#=GC MYGC');
});
it('flags unrecognized #= lines and keeps comments on export',()=>{
  const a=parseAlignment('# STOCKHOLM 1.0\n# note\n#=XX odd\na AC\nb AG\n//');
  expect(a.metadata.warnings![0]).toMatchObject({code:'unknown-stockholm-tag',line:3});
  expect(exportStockholm(a)).toContain('# note\n#=XX odd\n');
});
it('cuts Stockholm tags to the exported rows and columns',()=>{
  const a=parseAlignment(sto),out=exportStockholm(a,{rowIds:['seq-1'],start:2,end:3}),b=parseAlignment(out);
  expect(b.rows.map(r=>r.sequence)).toEqual(['CG']);
  expect(b.metadata.stockholm!.GC.MYGC).toBe('23');expect(b.metadata.stockholm!.GR.a.QQ).toBe('bc');expect(b.metadata.stockholm!.GS.b).toBeUndefined();
});
it('exports plain Stockholm when no tags were parsed',()=>{
  expect(exportStockholm(parseAlignment('>a\nAC\n>b\nAG'))).toBe('# STOCKHOLM 1.0\na  AC\nb  AG\n//\n');
});
it('shows the badge, emits warnings and lists them in the message area',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false}),seen:unknown[][]=[];disposers.push(()=>viewer.destroy());
  viewer.on('warnings',w=>seen.push(w));
  const badge=el.querySelector<HTMLButtonElement>('.ak-warnings')!;expect(badge.hidden).toBe(true);
  await viewer.load('>a\nAC?GT\n>a\nACGGT');
  expect(seen).toHaveLength(1);expect(seen[0]).toHaveLength(2);expect(viewer.getWarnings().map(w=>w.code)).toEqual(['invalid-residue','duplicate-id']);
  expect(badge.hidden).toBe(false);expect(badge.textContent).toBe('2 warnings');
  badge.click();
  const message=el.querySelector<HTMLElement>('.ak-message')!;
  expect(message.hidden).toBe(false);expect(message.querySelectorAll('li')).toHaveLength(2);expect(message.textContent).toContain('invalid-residue');
  message.querySelector<HTMLButtonElement>('[data-action="warnings-close"]')!.click();
  await Promise.resolve();expect(message.hidden).toBe(true);
  viewer.setOptions({visibility:{warnings:false}});expect(badge.hidden).toBe(true);
  await viewer.load('>a\nACGT\n>b\nACGA');
  expect(seen).toHaveLength(2);expect(seen[1]).toEqual([]);expect(viewer.getWarnings()).toEqual([]);
  viewer.setOptions({visibility:{warnings:true}});expect(badge.hidden).toBe(true);
  viewer.clear();expect(badge.hidden).toBe(true);
});
it('accepts the warnings visibility key in a config',()=>{
  expect(parseViewerConfig({visibility:{warnings:false}}).visibility).toEqual({warnings:false});
});

const protein=()=>createAlignment([
  {id:'a',name:'A',sequence:'MK-V'},{id:'b',name:'B',sequence:'mKLV'},{id:'c',name:'C',sequence:'M--V'},{id:'d',name:'D',sequence:'MRLI'},
],{alphabet:'protein'});
const open=async()=>{const el=host(),viewer=createViewer(el,{worker:false,visibility:{reference:false}});disposers.push(()=>viewer.destroy());await viewer.setAlignment(protein());return {el,viewer,x:viewer as any};};
it('getResidue returns letters, and null for gaps and bad input',async()=>{
  const {viewer}=await open();
  expect(viewer.getResidue('b',1)).toBe('M');expect(viewer.getResidue('a',2)).toBe('K');expect(viewer.getResidue('a',3)).toBeNull();
  expect(viewer.getResidue('a',0)).toBeNull();expect(viewer.getResidue('a',5)).toBeNull();expect(viewer.getResidue('a',1.5)).toBeNull();expect(viewer.getResidue('zz',1)).toBeNull();
});
it('getColumn lists every row in input order with - for gaps',async()=>{
  const {viewer}=await open();
  expect(viewer.getColumn(3)).toEqual([{rowId:'a',residue:'-'},{rowId:'b',residue:'L'},{rowId:'c',residue:'-'},{rowId:'d',residue:'L'}]);
  expect(viewer.getColumn(0)).toEqual([]);expect(viewer.getColumn(5)).toEqual([]);
  viewer.hideRows(['b']);expect(viewer.getColumn(1)).toHaveLength(4);
});
it('accessors are safe before a load and throw after destroy',()=>{
  const viewer=createViewer(host(),{worker:false});
  expect(viewer.getResidue('a',1)).toBeNull();expect(viewer.getColumn(1)).toEqual([]);expect(viewer.getSelectionSequences()).toEqual([]);expect(viewer.getVisibleRows()).toEqual([]);
  expect(viewer.getVisibleColumns()).toEqual({start:0,end:0});expect(viewer.scrollToRow('a')).toBe(false);expect(viewer.scrollToColumn(1)).toBe(false);
  viewer.destroy();expect(()=>viewer.getColumn(1)).toThrow(/destroyed/);
});
it('getSelectionSequences follows the checked rows or the selected cell',async()=>{
  const {viewer,x}=await open();
  expect(viewer.getSelectionSequences()).toEqual([]);
  viewer.setSelection({start:2,end:3,rowId:'a'});
  expect(viewer.getSelectionSequences()).toEqual([{id:'a',name:'A',sequence:'K-'}]);
  expect(viewer.getSelectionSequences({gaps:'remove'})).toEqual([{id:'a',name:'A',sequence:'K'}]);
  x.selectedRows.add('d');x.selectedRows.add('b');
  expect(viewer.getSelectionSequences().map(r=>[r.id,r.sequence])).toEqual([['b','KL'],['d','RL']]);
  viewer.setSelection(null);
  expect(viewer.getSelectionSequences().map(r=>r.sequence)).toEqual(['mKLV','MRLI']);
  expect(()=>viewer.getSelectionSequences({gaps:'x' as any})).toThrow(/gaps/);
});
it('getVisibleRows excludes hidden, filtered and collapsed rows in display order',async()=>{
  const {viewer}=await open();
  expect(viewer.getVisibleRows()).toEqual(['a','b','c','d']);
  viewer.hideRows(['b']);expect(viewer.getVisibleRows()).toEqual(['a','c','d']);
  viewer.setFilter('D');expect(viewer.getVisibleRows()).toEqual(['d']);viewer.setFilter('');
  viewer.setGroups({a:'g1',c:'g1',d:'g2'});viewer.toggleGroup('g1',true);expect(viewer.getVisibleRows()).toEqual(['d']);
  viewer.toggleGroup('g1',false);expect(viewer.getVisibleRows()).toEqual(['a','c','d']);
});
it('getVisibleRows puts the pinned reference first',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());await viewer.setAlignment(protein());
  viewer.setReference('c');expect(viewer.getVisibleRows()).toEqual(['c','a','b','d']);
  viewer.hideRows(['c']);expect(viewer.getVisibleRows()).toEqual(['a','b','d']);
});
it('scrollToRow and scrollToColumn move the scroll position and report success',async()=>{
  const {viewer,x}=await open();const rh=x.options.rowHeight,cw=x.options.cellWidth;
  expect(viewer.scrollToRow('c')).toBe(true);expect(x.scroll.scrollTop).toBe(2*rh);
  expect(viewer.scrollToRow('nope')).toBe(false);
  viewer.hideRows(['b']);expect(viewer.scrollToRow('b')).toBe(false);expect(viewer.scrollToRow('d')).toBe(true);expect(x.scroll.scrollTop).toBe(2*rh);
  expect(viewer.scrollToColumn(3)).toBe(true);expect(x.scroll.scrollLeft).toBe(2*cw);
  expect(viewer.scrollToColumn(0)).toBe(false);expect(viewer.scrollToColumn(5)).toBe(false);
  viewer.hideColumns(2,2);expect(viewer.scrollToColumn(2)).toBe(false);expect(viewer.scrollToColumn(3)).toBe(true);expect(x.scroll.scrollLeft).toBe(1*cw);
  expect(viewer.getSelectionSequences()).toEqual([]);
});
it('getVisibleColumns reports the original columns at the viewport edges',async()=>{
  const {viewer,x}=await open();
  Object.defineProperty(x.scroll,'clientWidth',{value:x.gutter+2*x.options.cellWidth,configurable:true});
  expect(viewer.getVisibleColumns()).toEqual({start:1,end:2});
  viewer.scrollToColumn(3);expect(viewer.getVisibleColumns()).toEqual({start:3,end:4});
  viewer.hideColumns(2,3);x.scroll.scrollLeft=x.options.cellWidth;
  expect(viewer.getVisibleColumns()).toEqual({start:4,end:4});
});

it('keeps stale warnings out of row removal and alphabet switches',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false}),seen:unknown[][]=[];disposers.push(()=>viewer.destroy());
  viewer.on('warnings',w=>seen.push(w));
  await viewer.load('>a\nACGT\n>a\nACGA\n>b\nAC?T');
  expect(seen).toHaveLength(1);expect(viewer.getWarnings().map(w=>w.rowId)).toEqual(['seq-3','seq-2']);
  await viewer.removeRows(['seq-2']);
  expect(viewer.getWarnings().map(w=>w.rowId)).toEqual(['seq-3']);expect(seen).toHaveLength(1);
  expect(el.querySelector('.ak-warnings')!.textContent).toBe('1 warning');
  (viewer as any).applyAlphabet('rna');await new Promise(r=>setTimeout(r,0));
  expect(seen).toHaveLength(1);expect(viewer.getWarnings()).toHaveLength(1);
  await viewer.removeRows(['seq-3']);expect(viewer.getWarnings()).toEqual([]);expect(el.querySelector<HTMLElement>('.ak-warnings')!.hidden).toBe(true);
});
it('lists warnings from the badge even when visibility.messages is off',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false,visibility:{messages:false}});disposers.push(()=>viewer.destroy());
  await viewer.load('>a\nAC?T\n>b\nACGT');
  const badge=el.querySelector<HTMLButtonElement>('.ak-warnings')!,message=el.querySelector<HTMLElement>('.ak-message')!;
  expect(badge.hidden).toBe(false);badge.click();(viewer as any).layout();
  expect(message.hidden).toBe(false);expect(message.querySelectorAll('li')).toHaveLength(1);
});
