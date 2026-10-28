import {it,expect} from 'vitest';
import {encodeViewLink,decodeViewLink} from '../src/link';
import type {ViewState} from '../src/types';
const state:ViewState={version:1,alignmentId:'abc-3-4-dna',referenceId:'seq-1',query:'human',sort:'name',start:5,rowOffset:2,cellWidth:12,selection:{start:2,end:3,rowId:'seq 2'},colorScheme:'soft-nucleotide',colorMode:'reference-differences',statisticsScope:'filtered',annotationFilter:{}};
it('round-trips the view fields through readable parameters',()=>{
  const text=encodeViewLink(state,'https://example.org/a.sto');
  expect(text).toBe('src=https%3A%2F%2Fexample.org%2Fa.sto&aln=abc-3-4-dna&sel=2-3&row=seq+2&ref=seq-1&scheme=soft-nucleotide&mode=reference-differences&zoom=12&q=human&sort=name&scope=filtered&x=5&y=2');
  expect(decodeViewLink('#'+text)).toEqual({source:'https://example.org/a.sto',alignmentId:'abc-3-4-dna',selection:{start:2,end:3,rowId:'seq 2'},referenceId:'seq-1',colorScheme:'soft-nucleotide',colorMode:'reference-differences',cellWidth:12,query:'human',sort:'name',statisticsScope:'filtered',start:5,rowOffset:2});
});
it('omits defaults and lists malformed parameters',()=>{
  expect(encodeViewLink({...state,query:'',sort:'input',start:1,rowOffset:0,selection:null,colorMode:'all',statisticsScope:'all',referenceId:null})).toBe('aln=abc-3-4-dna&scheme=soft-nucleotide&zoom=12');
  expect(decodeViewLink('sel=9-3&zoom=big&mode=rainbow&src=javascript:alert(1)&x=0&extra=1')).toEqual({ignored:['src','sel','mode','zoom','x']});
});
it('round-trips dots for matches',()=>{
  const text=encodeViewLink({...state,matchDisplay:'dot'});
  expect(text).toContain('dots=1&zoom=12');
  expect(decodeViewLink(text).matchDisplay).toBe('dot');
  expect(encodeViewLink({...state,matchDisplay:'letter'})).not.toContain('dots');
  expect(decodeViewLink('dots=0').matchDisplay).toBe('letter');
  expect(decodeViewLink('dots=yes')).toEqual({ignored:['dots']});
});
