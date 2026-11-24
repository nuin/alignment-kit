import {it,expect} from 'vitest';
import {parseAlignment} from '../src/parsers';
it('reads ~ as a gap in FASTA, Stockholm, CLUSTAL and PIR without a warning',()=>{
  const fasta=parseAlignment('>a\nACGT\n>b\nAC~T\n');
  expect(fasta.rows[1].sequence).toBe('AC-T');expect(fasta.codes[6]).toBe(45);expect(fasta.metadata.warnings).toBeUndefined();
  expect(parseAlignment('# STOCKHOLM 1.0\na ACGT\nb A~~T\n//\n').rows[1].sequence).toBe('A--T');
  expect(parseAlignment('CLUSTAL W\n\na ACGT\nb ~CGT\n').rows[1].sequence).toBe('-CGT');
  expect(parseAlignment('>P1;a\n\nACGT*\n>P1;b\n\nACG~*\n').rows[1].sequence).toBe('ACG-');
});
it('keeps ? as an invalid residue outside NEXUS',()=>{
  const a=parseAlignment('>a\nACGT\n>b\nAC?T\n');
  expect(a.rows[1].sequence).toBe('ACNT');expect(a.metadata.warnings).toMatchObject([{code:'invalid-residue',line:3,rowId:'seq-2'}]);
});
it('pads and loads more rows than a call can take as arguments',()=>{
  const n=150000,fasta=parseAlignment('>long\nAC\n'+Array.from({length:n},(_,i)=>`>s${i}\nA`).join('\n'),{padShort:true});
  expect(fasta.rows).toHaveLength(n+1);expect(fasta.width).toBe(2);expect(fasta.metadata.warnings).toHaveLength(n);
  const phylip=parseAlignment(`${n} 1\n`+Array.from({length:n},(_,i)=>`s${i} A`).join('\n'));expect(phylip.rows).toHaveLength(n);
});
it('reports line numbers of the file when it starts with blank lines or a BOM',()=>{
  const lead='﻿\r\n  \r\n\n';
  expect(parseAlignment(lead+'>a\nAC1T\n>b\nACGT\n>a\nACGT\n').metadata.warnings).toMatchObject([{code:'invalid-residue',line:4},{code:'duplicate-id',line:8}]);
  expect(parseAlignment('>a\nAC1T\n').metadata.warnings).toMatchObject([{line:1}]);
  expect(()=>parseAlignment(lead+'>a\nACGT\n>\nACGT')).toThrow(/line 6/);
  expect(()=>parseAlignment(lead+'# STOCKHOLM 1.0\n#=GS a DE\n//')).toThrow(/line 5/);
  expect(parseAlignment(lead+'# STOCKHOLM 1.0\n#=GF ZZ x\na ACGT\n//').metadata.warnings).toMatchObject([{code:'unknown-stockholm-tag',line:5}]);
  expect(()=>parseAlignment(lead+'CLUSTAL W\n\na ACGT\nbroken\n')).toThrow(/line 7/);
  expect(parseAlignment(lead+'>P1;a\n\nAC1T*\n').metadata.warnings).toMatchObject([{line:4}]);
  expect(()=>parseAlignment(lead+'>P1;a\n\nACGT*\n>P1;\n\nACGT*\n')).toThrow(/line 7/);
});
it('keeps the first row of a forced CLUSTAL or Stockholm text that has no header line',()=>{
  const clustal=parseAlignment('a ACGT\nb ACGA\n',{format:'clustal'});
  expect(clustal.rows.map(r=>r.name)).toEqual(['a','b']);expect(clustal.metadata.headers).toEqual([]);
  const stockholm=parseAlignment('a ACGT\nb ACGA\n//\n',{format:'stockholm'});expect(stockholm.rows.map(r=>r.sequence)).toEqual(['ACGT','ACGA']);
  const tagged=parseAlignment('#=GF ID fam\na ACGT\n//\n',{format:'stockholm'});expect(tagged.name).toBe('fam');expect(tagged.rows).toHaveLength(1);
  const other=parseAlignment('PROBCONS version 1.12 multiple sequence alignment\n\na ACGT\nb ACGA\n',{format:'clustal'});
  expect(other.rows).toHaveLength(2);expect(other.metadata.headers).toEqual(['PROBCONS version 1.12 multiple sequence alignment']);
  expect(parseAlignment('CLUSTAL W\n\na ACGT\n').metadata.headers).toEqual(['CLUSTAL W']);
  expect(parseAlignment('# STOCKHOLM 1.0\na ACGT\n//').metadata.headers).toEqual(['# STOCKHOLM 1.0']);
});
