// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {parseAlignment} from '../src/parsers';
import {exportClustal,exportStockholm,exportPhylip,exportNexus,exportFasta} from '../src/export';
import {createViewer} from '../src/viewer';
const rows=(a:ReturnType<typeof parseAlignment>)=>a.rows.map(r=>[r.name,r.sequence]);
const base=()=>parseAlignment('>alpha\nMK-LVA\n>beta\nMKQLVA\n>gamma\nMR-L-A',{alphabet:'protein'});
const long=()=>parseAlignment(`>a\n${'ACGT'.repeat(40)}\n>b\n${'ACGA'.repeat(40)}\n>c\n${'A-GT'.repeat(40)}`);
it('parses sequential relaxed PHYLIP',()=>{
  const a=parseAlignment('3 6\nalpha  MK-LVA\nbeta   MKQLVA\ngamma  MR-L-A\n');
  expect(a.metadata.format).toBe('phylip');expect(rows(a)).toEqual(rows(base()));
});
it('parses interleaved relaxed PHYLIP',()=>{
  const a=parseAlignment('2 8\none ACGT\ntwo ACGA\n\nTTTT\nCCCC\n');
  expect(rows(a)).toEqual([['one','ACGTTTTT'],['two','ACGACCCC']]);
});
it('parses sequential PHYLIP with sequences wrapped over lines',()=>{
  const a=parseAlignment('2 8\none ACGT\nTTTT\ntwo ACGA\nCCCC\n');
  expect(rows(a)).toEqual([['one','ACGTTTTT'],['two','ACGACCCC']]);
});
it('parses strict PHYLIP with spaces in names and blocks of ten',()=>{
  const a=parseAlignment('2 12\nHomo sapieACGTACGTAC GT\nMus muscul ACGTACGTAC GA\n');
  expect(rows(a)).toEqual([['Homo sapie','ACGTACGTACGT'],['Mus muscul','ACGTACGTACGA']]);
  const b=parseAlignment('2 4\nabcdefghijACGT\nklmnopqrstACGA\n');
  expect(rows(b)).toEqual([['abcdefghij','ACGT'],['klmnopqrst','ACGA']]);
});
it('rejects PHYLIP with the wrong column count',()=>{expect(()=>parseAlignment('2 9\none ACGT\ntwo ACGA\n')).toThrow(/PHYLIP/);});
const nexus=(body:string,format='DATATYPE=DNA GAP=- MISSING=?')=>`#NEXUS\n[comment]\nBEGIN DATA;\n DIMENSIONS NTAX=2 NCHAR=8;\n FORMAT ${format};\n MATRIX\n${body}\n ;\nEND;\n`;
it('parses NEXUS with matchchar, quoted names, comments and missing data',()=>{
  const a=parseAlignment(nexus("'Homo sapiens' ACGT[note]ACGT\nmus ....T?G.","DATATYPE=DNA GAP=- MISSING=? MATCHCHAR=."));
  expect(a.metadata.format).toBe('nexus');expect(a.alphabet).toBe('dna');
  expect(rows(a)).toEqual([['Homo sapiens','ACGTACGT'],['mus','ACGTT-GT']]);
});
it('parses interleaved NEXUS and a custom gap character',()=>{
  const a=parseAlignment(nexus('a AC~T\nb AC~A\n\na TTTT\nb CCCC','DATATYPE=DNA GAP=~ INTERLEAVE=YES'));
  expect(rows(a)).toEqual([['a','AC-TTTTT'],['b','AC-ACCCC']]);
});
it('parses NEXUS CHARACTERS blocks and detects interleaving without a flag',()=>{
  const text='#nexus\nbegin characters;\ndimensions ntax=2 nchar=8;\nformat datatype=protein;\nmatrix\nx MKLV\ny MKLA\n\nx AAAA\ny CCCC\n;\nend;';
  const a=parseAlignment(text);expect(a.alphabet).toBe('protein');expect(rows(a)).toEqual([['x','MKLVAAAA'],['y','MKLACCCC']]);
});
it('rejects NEXUS without a data block',()=>{expect(()=>parseAlignment('#NEXUS\nbegin trees;\nend;')).toThrow(/DATA or CHARACTERS/);});
const msf=`!!AA_MULTIPLE_ALIGNMENT 1.0

  test.msf  MSF: 12  Type: P  Check: 100  ..

 Name: one   Len: 12  Check: 1  Weight: 1.00
 Name: two   Len: 12  Check: 2  Weight: 1.00

//

            1                                                   12
one         MK.LV~AAAA CC
two         MKQLVAAAAA CC
`;
it('parses MSF and turns . and ~ into gaps',()=>{
  const a=parseAlignment(msf);
  expect(a.metadata.format).toBe('msf');expect(a.alphabet).toBe('protein');
  expect(rows(a)).toEqual([['one','MK-LV-AAAACC'],['two','MKQLVAAAAACC']]);
});
it('parses interleaved MSF detected by its MSF line',()=>{
  const a=parseAlignment('  t.msf  MSF: 8  Type: N  Check: 1  ..\n\n Name: p   Len: 8\n Name: q   Len: 8\n\n//\n\np ACGT\nq ACGA\n\np TT.T\nq CCCC\n');
  expect(rows(a)).toEqual([['p','ACGTTT-T'],['q','ACGACCCC']]);
});
it('parses PIR/NBRF entries ending with *',()=>{
  const a=parseAlignment('>P1;SEQ1\nfirst sequence\nMK-LV\nA*\n>P1;SEQ2\nsecond\nMKQLVA*\n');
  expect(a.metadata.format).toBe('pir');expect(rows(a)).toEqual([['SEQ1','MK-LVA'],['SEQ2','MKQLVA']]);
});
it('keeps FASTA names containing semicolons detectable as FASTA',()=>{expect(parseAlignment('>x\nAC\n>y;z\nAC').rows).toHaveLength(2);});
it('detects FASTA with PIR-like headers when no * terminator is present',()=>{
  const a=parseAlignment('>sp;x\nAC-T\n>ab;foo\nACGT');expect(a.metadata.format).toBe('fasta');expect(rows(a)).toEqual([['sp;x','AC-T'],['ab;foo','ACGT']]);
});
it('parses PIR with an empty description line',()=>{
  const a=parseAlignment('>P1;A\n\nMK-L*\n>P1;B\n\nMKQL*\n');expect(a.metadata.format).toBe('pir');expect(rows(a)).toEqual([['A','MK-L'],['B','MKQL']]);
});
it('treats NEXUS ? as missing when FORMAT omits MISSING',()=>{
  const a=parseAlignment(nexus('a ACG?ACGT\nb AC-TACGT','DATATYPE=DNA'));expect(rows(a)).toEqual([['a','ACG-ACGT'],['b','AC-TACGT']]);
});
it('round-trips duplicate and colliding display names in every text export',()=>{
  const a=parseAlignment('>x\nACGT\n>x\nTTTT\n>a b\nCCCC\n>a_b\nGGGG');
  for(const [label,t] of [['clustal',exportClustal(a)],['stockholm',exportStockholm(a)],['nexus',exportNexus(a)],['phylip',exportPhylip(a)]] as const) {
    const b=parseAlignment(t);expect(b.rows.map(r=>r.sequence),label).toEqual(a.rows.map(r=>r.sequence));
  }
  for(const t of [exportClustal(a),exportStockholm(a),exportNexus(a)])expect(new Set(parseAlignment(t).rows.map(r=>r.name)).size).toBe(4);
  expect(parseAlignment(exportClustal(a)).rows.map(r=>r.name)).toEqual(['x','x_2','a_b','a_b_2']);
});
it('lists the supported formats when detection fails',()=>{expect(()=>parseAlignment('hello')).toThrow(/PHYLIP, NEXUS, MSF or PIR/);});
it('honors an explicit format',()=>{expect(parseAlignment('2 4\none ACGT\ntwo ACGA',{format:'phylip'}).width).toBe(4);});

for(const [label,make] of [['protein',base],['dna',long]] as const) {
  const a=make(),expected=rows(a);
  it(`round-trips CLUSTAL (${label})`,()=>{const t=exportClustal(a);expect(t.startsWith('CLUSTAL')).toBe(true);expect(rows(parseAlignment(t))).toEqual(expected);});
  it(`round-trips Stockholm (${label})`,()=>{const t=exportStockholm(a);expect(t).toMatch(/^# STOCKHOLM 1\.0\n/);expect(t.trimEnd().endsWith('//')).toBe(true);expect(rows(parseAlignment(t))).toEqual(expected);});
  it(`round-trips relaxed PHYLIP (${label})`,()=>expect(rows(parseAlignment(exportPhylip(a)))).toEqual(expected));
  it(`round-trips strict PHYLIP (${label})`,()=>expect(rows(parseAlignment(exportPhylip(a,{},{variant:'strict'})))).toEqual(expected));
  it(`round-trips NEXUS (${label})`,()=>{const b=parseAlignment(exportNexus(a));expect(rows(b)).toEqual(expected);expect(b.alphabet).toBe(a.alphabet);});
}
it('round-trips PIR written from alignment rows',()=>{
  const a=base(),pir=a.rows.map(r=>`>P1;${r.name}\n${r.name}\n${r.sequence}*\n`).join('');
  expect(rows(parseAlignment(pir))).toEqual(rows(a));
});
it('writes CLUSTAL blocks of 60 columns with a conservation line',()=>{
  const lines=exportClustal(long()).split('\n');
  expect(lines.filter(l=>l.startsWith('a '))).toHaveLength(3);
  expect(lines.find(l=>l.startsWith('a '))!.trim().split(/\s+/)[1]).toHaveLength(60);
  const c=exportClustal(parseAlignment('>a\nAC-G\n>b\nAT-G'));expect(c.split('\n').find(l=>l.includes('*'))!.trim()).toBe('*  *');
});
it('truncates and uniquifies strict PHYLIP names',()=>{
  const a=parseAlignment('>abcdefghijklmn\nAC\n>abcdefghijzzz\nAC\n>abcdefghij\nAC');
  const names=exportPhylip(a,{},{variant:'strict'}).split('\n').slice(1,4).map(l=>l.slice(0,10));
  expect(names).toEqual(['abcdefghij','abcdefghi1','abcdefghi2']);
  expect(()=>exportPhylip(a,{},{variant:'x' as any})).toThrow(/variant/);
});
it('quotes NEXUS names when needed',()=>{
  const a=parseAlignment('>Homo sapiens\nAC\n>it\'s\nAC\n>plain_1\nAC');
  const t=exportNexus(a);expect(t).toContain("'Homo sapiens'");expect(t).toContain("'it''s'");expect(t).toMatch(/\n {4}plain_1 /);
  expect(rows(parseAlignment(t)).map(r=>r[0])).toEqual(['Homo sapiens',"it's",'plain_1']);
});
it('exports a region and chosen rows',()=>{
  const a=base(),ids=a.rows.map(r=>r.id);
  expect(rows(parseAlignment(exportPhylip(a,{start:2,end:4,rowIds:[ids[2],ids[0]]})))).toEqual([['gamma','R-L'],['alpha','K-L']]);
  expect(exportNexus(a,{start:2,end:3})).toContain('NCHAR=2');
  expect(()=>exportClustal(a,{rowIds:[]})).toThrow(/at least one row/);
  expect(()=>exportStockholm(a,{start:3,end:99})).toThrow(/range/);
});
it('exports FASTA unchanged next to the new formats',()=>expect(exportFasta(base()).startsWith('>alpha')).toBe(true));

beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
const disposers:(()=>void)[]=[];
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const paste=(target:Element,text:string)=>{
  const event=new Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'clipboardData',{value:{getData:(t:string)=>t==='text/plain'?text:''}});
  target.dispatchEvent(event);return event;
};
const mount=()=>{const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());return {el,viewer};};
it('loads pasted alignment text',async()=>{
  const {el,viewer}=mount(),ready=vi.fn();viewer.on('ready',ready);
  expect(el.querySelector('.ak-empty')?.textContent).toMatch(/paste/i);
  const event=paste(el.querySelector('.ak-scroll')!,'2 4\none ACGT\ntwo ACGA\n');
  expect(event.defaultPrevented).toBe(true);
  await vi.waitFor(()=>expect(ready).toHaveBeenCalledOnce());
  expect(viewer.getAlignment()?.rows.map(r=>r.name)).toEqual(['one','two']);
});
it('ignores paste into form fields and editable elements',async()=>{
  const {el,viewer}=mount();
  for(const sel of ['input[aria-label="Filter sequences"]','select[aria-label="Color scheme"]'])expect(paste(el.querySelector(sel)!,'>a\nAC\n>b\nAC').defaultPrevented).toBe(false);
  const editable=document.createElement('div');editable.setAttribute('contenteditable','true');el.append(editable);
  expect(paste(editable,'>a\nAC\n>b\nAC').defaultPrevented).toBe(false);
  await new Promise(r=>setTimeout(r,20));expect(viewer.getAlignment()).toBeUndefined();
});
it('reports pasted parse errors through the error event and status',async()=>{
  const {el,viewer}=mount(),errors:Error[]=[];viewer.on('error',e=>errors.push(e));
  paste(el.querySelector('.ak-scroll')!,'not an alignment');
  await vi.waitFor(()=>expect(errors).toHaveLength(1));
  expect(errors[0].message).toMatch(/Unrecognized/);expect(el.querySelector('.ak-message')?.textContent).toMatch(/Unrecognized/);
});
it('lists the new export entries',()=>{
  const {el}=mount(),values=[...el.querySelectorAll<HTMLOptionElement>('select[aria-label="Export alignment"] option')].map(o=>o.value);
  for(const k of ['clustal','stockholm','phylip','nexus'])expect(values).toEqual(expect.arrayContaining([k,`${k}-all`]));
});
