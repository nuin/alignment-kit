// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseAlignment } from '../src/parsers';
import { calculateStats } from '../src/analysis';
import { exportSvg, exportPng, escapeXml } from '../src/export';
import type { Alignment } from '../src/types';
const dna=()=>parseAlignment('>r\nACGT\n>s\nACGA\n>t\nA-GT',{alphabet:'dna'});
/** Letters of the 12 residue cells, without the legend swatches. */
const letters=(svg:string)=>[...svg.matchAll(/text-anchor="middle" fill="[^"]+">([^<]+)<\/text><\/g>/g)].map(m=>m[1]).slice(0,12).join('');
const ruler=(svg:string)=>[...svg.matchAll(/<text x="(\d+)" y="64">(\d+)<\/text>/g)].map(m=>[+m[1],+m[2]]);
const meta=(svg:string)=>JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/)![1].replaceAll('&quot;','"'));
/** Alignment of `rows` by `width` without sequence strings; the figure size checks read only the region. */
const blank=(rows:number,width:number):Alignment=>({...dna(),width,codes:new Uint8Array(0),rows:Array.from({length:rows},(_,i)=>({id:`s${i}`,name:`s${i}`,sequence:''}))} as unknown as Alignment);
describe('figure orientation',()=>{
  it('keeps source orientation by default',()=>{
    const a=dna(),svg=exportSvg(a,calculateStats(a));
    expect(letters(svg)).toBe('ACGTACGAA·GT');expect(svg).toContain('<title>'+a.name+'</title>');expect(meta(svg).orientation).toBeUndefined();expect(meta(svg).reverseStrandRows).toBeUndefined();
  });
  it('draws the reverse-complement view right to left with complemented letters',()=>{
    const a=dna(),svg=exportSvg(a,calculateStats(a),{},'soft-nucleotide',{reverse:true});
    expect(letters(svg)).toBe('ACGT'+'TCGT'+'AC·T');
    expect(ruler(svg)[0]).toEqual([250,4]);
    expect(svg).toContain(' (reverse complement)</title>');expect(svg).toContain('Alignment columns 4–1 · reverse complement');expect(meta(svg).orientation).toBe('reverse-complement');
  });
  it('complements a strand-flagged row once, and not at all in the reversed view',()=>{
    const a=dna(),s=calculateStats(a),strands=new Set([a.rows[1].id]);
    const forward=exportSvg(a,s,{},'soft-nucleotide',{strands}),reversed=exportSvg(a,s,{},'soft-nucleotide',{strands,reverse:true});
    expect(letters(forward)).toBe('ACGT'+'TGCT'+'A·GT');
    expect(letters(reversed)).toBe('ACGT'+'AGCA'+'AC·T');
    expect(meta(forward).reverseStrandRows).toEqual([a.rows[1].id]);
  });
  it('compares drawn letters for match dots',()=>{
    const a=dna(),s=calculateStats(a),ref=a.rows[0].id;
    expect(letters(exportSvg(a,s,{},'soft-nucleotide',{reverse:true,referenceId:ref,matchDisplay:'dot'}))).toBe('ACGT'+'T...'+'..·.');
    expect(letters(exportSvg(a,s,{},'soft-nucleotide',{reverse:true,colorMode:'consensus-matches',matchDisplay:'dot'}))).toBe('ACGT'+'T...'+'..·.');
    expect(letters(exportSvg(a,s,{},'soft-nucleotide',{strands:new Set([a.rows[1].id]),referenceId:ref,matchDisplay:'dot'}))).toBe('ACGT'+'TGC.'+'.·..');
  });
  it('colors the drawn letter for fixed palettes',()=>{
    const a=dna(),s=calculateStats(a),fills=(svg:string)=>[...svg.matchAll(/height="21" fill="([^"]+)"/g)].map(m=>m[1]);
    expect(fills(exportSvg(a,s,{rowIds:[a.rows[0].id]},'soft-nucleotide',{reverse:true}))).toEqual(fills(exportSvg(a,s,{rowIds:[a.rows[0].id]},'soft-nucleotide')));
  });
  it('flips annotation boxes and hidden-column markers',()=>{
    const a={...dna(),annotations:[{id:'x',label:'site',mapping:'mapped' as const,start:1,end:2,rowId:undefined}]} as unknown as Alignment,s=calculateStats(dna());
    const box=(svg:string)=>svg.match(/<rect x="(\d+)" y="\d+" width="(\d+)" height="19" fill="none"/)!.slice(1).map(Number);
    expect(box(exportSvg(a,s,{rowIds:['seq-1']}))).toEqual([251,30]);
    expect(box(exportSvg(a,s,{rowIds:['seq-1']},'soft-nucleotide',{reverse:true}))).toEqual([250+2*16+1,30]);
    const columns=[1,0,0,1],hidden=(svg:string)=>[...svg.matchAll(/<line x1="(\d+)"[^>]*><title>([^<]+)<\/title>/g)].map(m=>[+m[1],m[2]]);
    expect(hidden(exportSvg(a,s,{rowIds:['seq-1'],columns}))).toEqual([[266,'2 hidden columns: 2–3']]);
    expect(hidden(exportSvg(a,s,{rowIds:['seq-1'],columns},'soft-nucleotide',{reverse:true}))).toEqual([[266,'2 hidden columns: 2–3']]);
    expect(hidden(exportSvg(a,s,{rowIds:['seq-1'],columns:[0,1,1,1]},'soft-nucleotide',{reverse:true}))).toEqual([[250+3*16,'1 hidden column: 1–1']]);
  });
  it('ignores orientation for protein',()=>{
    const a=parseAlignment('>p\nMKVLAT\n>q\nMKILAT',{alphabet:'protein'}),s=calculateStats(a);
    expect(exportSvg(a,s,{},'soft',{reverse:true,strands:new Set([a.rows[0].id])})).toBe(exportSvg(a,s));
  });
});
describe('PNG size limits',()=>{
  const s=calculateStats(dna());
  it('rejects a region over 16,384 px per side before building the SVG',async()=>{
    await expect(exportPng(blank(1,1007),s)).rejects.toThrow(/16,384 px per side.*needs 16386 × 194 px/);
    await expect(exportPng(blank(737,1),s)).rejects.toThrow(/needs 290 × 16386 px/);
  });
  it('rejects a region over 32,000,000 px that is under the cell cap',async()=>{
    await expect(exportPng(blank(82,1000),s)).rejects.toThrow(/32,000,000 px in area.*needs 16274 × 1976 px/);
    await expect(exportPng(blank(168,500),s)).rejects.toThrow(/PNG export is limited/);
  });
  it('keeps the cell cap and the empty-row message ahead of the pixel check',async()=>{
    await expect(exportPng(blank(201,1000),s)).rejects.toThrow('Figure export is limited to 200,000 cells');
    await expect(exportPng(blank(3,4),s,{rowIds:[]})).rejects.toThrow('Select at least one row');
  });
  it('lets the largest single-row and single-column regions past the size check',async()=>{
    // Both reach the SVG writer, which fails on the empty codes of the stub; a size error would say "PNG export is limited".
    for(const a of [blank(1,1006),blank(736,1),blank(167,500)])await expect(exportPng(a,s)).rejects.not.toThrow(/PNG export is limited|200,000 cells/);
  });
});
describe('escapeXml',()=>{
  it('drops characters XML 1.0 forbids and keeps tab, LF and CR',()=>{
    expect(escapeXml('a\u0000b\u0008c\u000Bd\u000Ce\u001Ff￾g￿h')).toBe('abcdefgh');
    expect(escapeXml('a\tb\nc\rd<&>"\'')).toBe('a\tb\nc\rd&lt;&amp;&gt;&quot;&apos;');
  });
  it('writes a parseable SVG for a row name with control characters and astral letters',()=>{
    const a=dna();a.rows[0].name='bad\u0001name'+'\u{1D4D0}'.repeat(40);a.name='run\u0002';
    const svg=exportSvg(a,calculateStats(a)),doc=new DOMParser().parseFromString(svg,'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();expect(svg).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    const label=[...doc.querySelectorAll('text')].find(t=>t.querySelector('title')?.textContent?.startsWith('badname'))!;
    expect([...label.lastChild!.textContent!]).toHaveLength(29);expect(label.lastChild!.textContent).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
