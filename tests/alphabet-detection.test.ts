import {it,expect} from 'vitest';
import {createAlignment,detectAlphabet,alphabetOf,residueKind} from '../src/model';
import {parseAlignment} from '../src/parsers';
const guess=(...sequences:string[])=>createAlignment(sequences.map((sequence,i)=>({name:`s${i}`,sequence}))).alphabet;
it('classes a short protein made of IUPAC nucleotide letters as protein',()=>{
  expect(guess('ASDHKVNM','ASDHKVNR')).toBe('protein');
  expect(guess('MKVLAAGIVGLLLAQ')).toBe('protein');
  expect(parseAlignment('>a\nASDHKVNM\n>b\nASDHKVNR\n').alphabet).toBe('protein');
});
it('keeps nucleotide input with up to 10% other letters as DNA or RNA',()=>{
  expect(guess('ACGTACGTACGTACGTACRY')).toBe('dna');
  expect(guess('ACGTACGTACGTACGTARYK')).toBe('protein');
  expect(guess('ACGUACGU')).toBe('rna');expect(guess('ACGUACGT')).toBe('dna');expect(guess('acgu-nn.')).toBe('rna');
});
it('ignores gaps and stops and defaults to DNA without residues',()=>{
  expect(guess('--..','----')).toBe('dna');expect(guess('**--')).toBe('dna');
  expect(guess('ACGTACGTAC**********--')).toBe('dna');
  expect(alphabetOf([0,0,0,0,9])).toEqual({alphabet:'dna',other:0});
  expect([45,46,42,126,63,200].map(residueKind)).toEqual([4,4,4,4,4,4]);
  expect([...'ACGNTUacgntuRx'].map(c=>residueKind(c.charCodeAt(0)))).toEqual([1,1,1,1,2,3,1,1,1,1,2,3,0,0]);
});
it('gives the same answer from createAlignment, detectAlphabet and the option override',()=>{
  for(const sequence of ['ASDHKVNM','ACGTTTGA','ACGUUUGA','ACGTACGTACGTRY','MKV*-']){
    const a=createAlignment([{name:'a',sequence}]);expect(detectAlphabet(a).alphabet,sequence).toBe(a.alphabet);
  }
  expect(createAlignment([{name:'a',sequence:'ASDHKVNM'}],{alphabet:'dna'}).alphabet).toBe('dna');
});
it('fills invalid characters with X for protein and N for nucleotide rows by the same rule',()=>{
  const p=parseAlignment('>a\nASDHKVN1\n>b\nASDHKVNR\n');expect(p.rows[0].sequence).toBe('ASDHKVNX');expect(p.alphabet).toBe('protein');
  const d=parseAlignment('>a\nACGTACGTAC1\n>b\nACGTACGTACR\n');expect(d.rows[0].sequence).toBe('ACGTACGTACN');expect(d.alphabet).toBe('dna');
  expect(parseAlignment('>a\nASDHKVN1\n',{alphabet:'dna'}).rows[0].sequence).toBe('ASDHKVNN');
});
