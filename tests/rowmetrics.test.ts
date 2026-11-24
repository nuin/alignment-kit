import {it,expect} from 'vitest';
import {createAlignment} from '../src/model';
import {rowMetrics,annotationCounts} from '../src/rowmetrics';
const rows=(...s:string[])=>s.map((sequence,i)=>({id:`r${i+1}`,name:`r${i+1}`,sequence}));
it('counts gaps and ungapped length per row, treating - and . as gaps',()=>{
  const m=rowMetrics(createAlignment(rows('AC-GT','A..G-','-----','ACGTN'),{alphabet:'dna'}));
  expect(Array.from(m.gaps)).toEqual([1,3,5,0]);expect(Array.from(m.length)).toEqual([4,2,0,5]);
});
it('returns the cached metrics for the same alignment object and fresh ones for another',()=>{
  const a=createAlignment(rows('A-','AC'),{alphabet:'dna'}),b=createAlignment(rows('A-','AC'),{alphabet:'dna'});
  expect(rowMetrics(a)).toBe(rowMetrics(a));expect(rowMetrics(b)).not.toBe(rowMetrics(a));expect(rowMetrics(b)).toEqual(rowMetrics(a));
});
it('counts annotations per row ID and leaves out column-only annotations',()=>{
  const a=createAlignment(rows('ACGT','ACGT','ACGT'),{alphabet:'dna'});
  a.annotations=[{id:'x',rowId:'r1',start:1,end:2},{id:'y',rowId:'r1',start:3,end:3},{id:'z',rowId:'r3',start:1,end:1},{id:'c',start:1,end:4}] as typeof a.annotations;
  const n=annotationCounts(a);
  expect([...n]).toEqual([['r1',2],['r3',1]]);expect(n.has('r2')).toBe(false);
});
it('returns an empty map for an alignment without annotations',()=>{
  const a=createAlignment(rows('AC'),{alphabet:'dna'});
  expect(annotationCounts(a).size).toBe(0);
});
