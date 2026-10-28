import {it,expect} from 'vitest';
import {calculateStats,consensusSequence} from '../src/analysis';
import {parseAlignment} from '../src/parsers';
const stats=(text:string,alphabet:'dna'|'rna'|'protein')=>{const a=parseAlignment(text,{alphabet});return calculateStats(a);};
it('writes nucleotide ties as IUPAC codes and keeps all-gap columns',()=>{
  const s=stats('>a\nAAC-G\n>b\nGCT-G\n>c\nAAC-T\n>d\nGCT-T','dna');
  expect(consensusSequence(s,'dna')).toBe('RMY-K');
});
it('treats U as T for RNA ties and uses X for protein ties',()=>{
  expect(consensusSequence(stats('>a\nAU\n>b\nGC','rna'),'rna')).toBe('RY');
  expect(consensusSequence(stats('>a\nKL\n>b\nRL','protein'),'protein')).toBe('XL');
});
it('applies the threshold to the modal frequency among non-gap rows and validates input',()=>{
  const s=stats('>a\nAC\n>b\nAG\n>c\nA-\n>d\nTC','dna');
  expect(consensusSequence(s,'dna',0.7)).toBe('AN');expect(consensusSequence(s,'dna',0.75)).toBe('AN');expect(consensusSequence(s,'dna',0.6,2,2)).toBe('C');
  expect(()=>consensusSequence(s,'dna',2)).toThrow('threshold');expect(()=>consensusSequence(s,'dna',0,2,1)).toThrow('range');
});
it('expands ambiguity codes in nucleotide ties and merges T with U',()=>{
  expect(consensusSequence(stats('>a\nAAT\n>b\nRNU','dna'),'dna')).toBe('RNT');
  expect(consensusSequence(stats('>a\nC*\n>b\nY-','dna'),'dna')).toBe('Y*');
  expect(consensusSequence(stats('>a\nA\n>b\n*','dna'),'dna')).toBe('N');
});
