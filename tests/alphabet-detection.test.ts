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
const AMBIGUITY='RYKMSWBDHV',dnaWith=(other:string,total:number)=>other+'ACGT'.repeat(total).slice(0,total-other.length);
it('keeps DNA at exactly 10% ambiguity codes and classes it as protein one letter above',()=>{
  expect(guess(dnaWith(AMBIGUITY,100))).toBe('dna');
  expect(guess(dnaWith(AMBIGUITY+'R',100))).toBe('protein');
  expect(guess(dnaWith(AMBIGUITY.slice(0,9),100))).toBe('dna');
  for(const k of [1,3,7,13,49,1000]){expect(guess(dnaWith('R'.repeat(k),k*10)),`${k} of ${k*10}`).toBe('dna');expect(guess(dnaWith('R'.repeat(k+1),k*10)),`${k+1} of ${k*10}`).toBe('protein');}
  for(const code of AMBIGUITY)expect(guess(dnaWith(code.repeat(2),10)),code).toBe('protein');
});
it('applies the 10% boundary to RNA, to all rows together and to letters only',()=>{
  expect(guess('RY'+'ACGU'.repeat(5).slice(0,18))).toBe('rna');expect(guess('RYK'+'ACGU'.repeat(5).slice(0,17))).toBe('protein');
  expect(guess('RYACGTACGT','ACGTACGTAC')).toBe('dna');expect(guess('RYACGTACGT','RACGTACGTA')).toBe('protein');
  expect(guess('R-ACGTACGT.*')).toBe('protein');expect(guess('R-ACGTACGTA.*')).toBe('dna');
  expect(guess('NNNNNNNNACGT')).toBe('dna');
  expect(detectAlphabet(createAlignment([{name:'a',sequence:dnaWith(AMBIGUITY,100)}]))).toEqual({alphabet:'dna',other:0.1});
});
it('classes ambiguity-heavy DNA as protein unless the alphabet option names it',()=>{
  const heavy='ACGTRYKMSWBDHVACGTRY',text=`>a\n${heavy}\n>b\n${heavy}\n`;
  expect(guess(heavy)).toBe('protein');expect(parseAlignment(text).alphabet).toBe('protein');
  for(const alphabet of ['dna','rna'] as const){const a=parseAlignment(text,{alphabet});expect(a.alphabet).toBe(alphabet);expect(a.rows[0].sequence).toBe(heavy);expect(detectAlphabet(a)).toMatchObject({alphabet:'protein',other:0.6});}
  expect(parseAlignment(`>a\n${heavy}1\n`).rows[0].sequence).toBe(heavy+'X');expect(parseAlignment(`>a\n${heavy}1\n`,{alphabet:'dna'}).rows[0].sequence).toBe(heavy+'N');
});
