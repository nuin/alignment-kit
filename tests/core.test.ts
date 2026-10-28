import { describe, it, expect } from 'vitest';
import { parseAlignment } from '../src/parsers';
import { createAlignment, alignmentToSequence, sequenceToAlignment } from '../src/model';
import { calculateStats, columnDetail, pairwiseIdentity, pairwiseMatrix } from '../src/analysis';
import { fromPavi } from '../src/pavi';

describe('alignment inputs and coordinates', () => {
  it('retains duplicate FASTA headers with stable unique IDs and case', () => {
    const a = parseAlignment('>same first\nAc-.\n>same second\nACTG\n');
    expect(a.rows.map(r => r.name)).toEqual(['same first', 'same second']);
    expect(new Set(a.rows.map(r => r.id)).size).toBe(2);
    expect(a.rows[0].sequence).toBe('Ac-.');
    expect(Array.from(a.codes.slice(0,4))).toEqual([65,67,45,45]);
  });
  it('assembles Stockholm blocks and preserves annotations', () => {
    const a = parseAlignment('# STOCKHOLM 1.0\n#=GF ID CBS\na AC\nb A-\n#=GC RF xx\n\na GT\nb GT\n#=GC RF xx\n//');
    expect(a.rows.map(r => r.sequence)).toEqual(['ACGT','A-GT']);
    expect(a.metadata.stockholm?.GC.RF).toBe('xxxx');
    expect(a.name).toBe('CBS');
  });
  it('assembles CLUSTAL blocks without parsing consensus or trailing counts as rows', () => {
    const a = parseAlignment('CLUSTAL W\n\na AC- 2\nb ACT 3\n  ** \n\na GT 4\nb G- 4\n');
    expect(a.rows.map(r => r.sequence)).toEqual(['AC-GT','ACTG-']);
  });
  it('rejects malformed rows, unsupported letters and unequal lengths', () => {
    expect(() => parseAlignment('>a\nAC\n>b\nA')).toThrow(/length.*b|b.*length/i);
    expect(() => createAlignment([{name:'a',sequence:'A1'}])).toThrow(/symbol|residue/i);
    expect(parseAlignment('>a\nA1').metadata.warnings?.[0].code).toBe('invalid-residue');
    expect(() => parseAlignment('hello world')).toThrow(/format/i);
    expect(() => createAlignment([])).toThrow(/sequence/i);
  });
  it('distinguishes gaps from ungapped sequence coordinates', () => {
    const a = parseAlignment('>a\n-A.CG-');
    expect([1,2,3,4,5,6].map(c => alignmentToSequence(a,0,c))).toEqual([null,1,null,2,3,null]);
    expect([1,2,3,4].map(c => sequenceToAlignment(a,0,c))).toEqual([2,4,5,null]);
    expect(() => alignmentToSequence(a,0,0)).toThrow(/coordinate/i);
  });
});

describe('exact, explicitly scoped statistics', () => {
  const a = () => parseAlignment('>a\nA-.X\n>b\nA-.N\n>c\nC-AX', { alphabet:'protein' });
  it('separates gaps, support and frequency with an unavailable all-gap column', () => {
    const s = calculateStats(a());
    expect(columnDetail(s,1)).toMatchObject({consensus:'A', gapCount:0, total:3});
    expect(columnDetail(s,1).frequency).toBeCloseTo(2/3);
    expect(columnDetail(s,2).frequency).toBeNull();
    expect(columnDetail(s,3)).toMatchObject({consensus:'A',gapCount:2,frequency:1});
    expect(columnDetail(s,3).support).toBeCloseTo(1/3);
    expect(columnDetail(s,4).counts).toEqual([{residue:'X',count:2},{residue:'N',count:1}]);
  });
  it('represents ties explicitly, independent of row order', () => {
    const x = parseAlignment('>a\nAC\n>b\nCA');
    expect(columnDetail(calculateStats(x),1)).toMatchObject({consensus:null,tied:true});
  });
  it('changes scope only when explicit row indices are supplied', () => {
    expect(columnDetail(calculateStats(a(),[2]),3).gapCount).toBe(0);
    expect(columnDetail(calculateStats(a()),3).gapCount).toBe(2);
    expect(columnDetail(calculateStats(a(),[]),1).frequency).toBeNull();
  });
  it('uses only canonical pairs and reports no-comparison as unavailable', () => {
    const x = parseAlignment('>a\nACNX-\n>b\nATNA-',{alphabet:'dna'});
    expect(pairwiseIdentity(x,0,1)).toEqual({matches:1,compared:2,identity:0.5});
    const y = parseAlignment('>a\n-N\n>b\nN-',{alphabet:'dna'});
    expect(pairwiseIdentity(y,0,1).identity).toBeNull();
    expect(() => pairwiseMatrix(x,Array(201).fill(0))).toThrow(/200/);
  });
});

it('adapts PAVI annotations without projecting unmapped variants onto residues', () => {
  const a = fromPavi('CLUSTAL W\n\nprot A-CG\nother ATCG\n', {
    prot: {species:'Homo sapiens', embedded_variants:[{variant_id:'v1',alignment_start_pos:3,alignment_end_pos:3,seq_start_pos:2,seq_end_pos:2,seq_substitution_type:'substitution',hgvs_protein:'p.C2R'}], non_coding_variants:[{variant_id:'v2',seq_substitution_type:'intron'}]}
  });
  expect(a.rows[0].species).toBe('Homo sapiens');
  expect(a.annotations[0]).toMatchObject({rowId:a.rows[0].id,start:3,end:3,label:'p.C2R',mapping:'mapped'});
  expect(a.annotations[1].mapping).toBe('unmapped');
  expect(a.annotations[1].start).toBeUndefined();
});

it('rejects duplicate records inside a block and unequal block widths even when totals match',()=>{
  expect(()=>parseAlignment('CLUSTAL W\n\na AC\na GT\n')).toThrow(/duplicate|block/i);
  expect(()=>parseAlignment('CLUSTAL W\n\na AC\nb G\n\na T\nb GA\n')).toThrow(/block|length/i);
});
it('isolates Stockholm metadata keys and validates per-residue annotations',()=>{
  expect(()=>parseAlignment('# STOCKHOLM 1.0\na AC\n#=GR __proto__ pollution xx\n//')).toThrow(/unknown.*sequence|annotation/i);
  expect(({} as Record<string,unknown>).pollution).toBeUndefined();
  const a=parseAlignment('# STOCKHOLM 1.0\n__proto__ AC\n#=GR __proto__ SS xx\n#=GF constructor safe\n//');
  expect(a.metadata.stockholm?.GR['__proto__'].SS).toBe('xx');
  expect(()=>parseAlignment('# STOCKHOLM 1.0\na ACG\n#=GR a SS xx\n//')).toThrow(/length/i);
});
