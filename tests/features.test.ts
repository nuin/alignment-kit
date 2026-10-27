import { it, expect } from 'vitest';
import { parseAlignment, readAlignmentInput } from '../src/parsers';
import { calculateStats } from '../src/analysis';
import { AnnotationIndex, filterAnnotations } from '../src/annotations';
import { exportFasta, exportStatistics, exportSvg } from '../src/export';
import { getColorScheme, registerColorScheme } from '../src/colors';

it('reads gzip bytes and rejects truncated compressed data', async()=>{
  const stream=new Blob(['>a\nACGT']).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes=await new Response(stream).arrayBuffer();
  expect(await readAlignmentInput(bytes)).toBe('>a\nACGT');
  await expect(readAlignmentInput(bytes.slice(0,8))).rejects.toThrow();
});
it('indexes annotations by stable row identity and interval',()=>{
  const features=[{id:'v',rowId:'seq-2',label:'Variant',start:2,end:4,mapping:'mapped' as const},{id:'u',label:'Unmapped',mapping:'unmapped' as const}];
  const index=new AnnotationIndex(features);
  expect(index.query('seq-2',3,3).map(x=>x.id)).toEqual(['v']);
  expect(index.query('seq-1',3,3)).toEqual([]);
  expect(filterAnnotations(features,{disease:true})).toMatchObject({unknown:2,visible:[]});
});
it('exports selected original rows and inclusive columns safely',()=>{
  const a=parseAlignment('>a <unsafe>\nAC-G\n>b\nATCG');
  expect(exportFasta(a,{rowIds:[a.rows[1].id],start:2,end:3})).toBe('>b\nTC\n');
  const svg=exportSvg(a,calculateStats(a),{start:1,end:2});
  expect(svg).toContain('&lt;unsafe&gt;');
  expect(svg).not.toContain('<unsafe>');
  expect(exportStatistics(calculateStats(a))).toContain('gap_fraction');
  expect(()=>exportSvg(a,calculateStats(a),{start:0})).toThrow();
});
it('allows user palettes while rejecting invalid colors and unknown schemes',()=>{
  registerColorScheme({id:'custom',label:'Custom',colors:{A:'#112233'},description:'Test palette'});
  expect(getColorScheme('custom').colors.A).toBe('#112233');
  expect(()=>registerColorScheme({id:'bad',label:'Bad',colors:{A:'url(javascript:x)'},description:''})).toThrow();
  expect(()=>getColorScheme('nope')).toThrow();
});
it('exports difference coloring and only explicitly supplied annotations',()=>{
  const a=parseAlignment('>a\nAC\n>b\nAT',{alphabet:'dna'});a.annotations=[{id:'v',rowId:'seq-2',label:'hidden variant',start:2,end:2,mapping:'mapped'}];
  const svg=exportSvg({...a,annotations:[]},calculateStats(a),{},'soft',{colorMode:'reference-differences',referenceId:'seq-1'});
  expect(svg).not.toContain('hidden variant');
  expect(svg).toContain('opacity="0.22"');
});
