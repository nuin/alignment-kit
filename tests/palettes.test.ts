import {it,expect} from 'vitest';
import {colorSchemes,getColorScheme,textColor,residueColor} from '../src/colors';

// Machado et al. 2009, severity 1.0, applied to linear sRGB.
const MACHADO:Record<string,number[][]>={
  normal:[[1,0,0],[0,1,0],[0,0,1]],
  deuteranopia:[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
  protanopia:[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
};
const linear=(c:number)=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
const rgb=(hex:string)=>[1,3,5].map(i=>linear(parseInt(hex.slice(i,i+2),16)/255));
const clip=(n:number)=>Math.min(1,Math.max(0,n));
const lab=([r,g,b]:number[]):number[]=>{
  const x=(0.4124*r+0.3576*g+0.1805*b)/0.95047,y=0.2126*r+0.7152*g+0.0722*b,z=(0.0193*r+0.1192*g+0.9505*b)/1.08883;
  const f=(t:number)=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
  return [116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))];
};
const simulate=(hex:string,kind:string)=>{const c=rgb(hex);return lab(MACHADO[kind].map(row=>clip(row[0]*c[0]+row[1]*c[1]+row[2]*c[2])));};
const distance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const luminance=(hex:string)=>{const [r,g,b]=rgb(hex);return 0.2126*r+0.7152*g+0.0722*b;};
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
const minDistance=(colors:string[],kind:string)=>{
  let min=Infinity;
  for(let i=0;i<colors.length;i++)for(let j=i+1;j<colors.length;j++)min=Math.min(min,distance(simulate(colors[i],kind),simulate(colors[j],kind)));
  return min;
};
const safe=['cvd-protein','cvd-nucleotide','hc-protein','hc-nucleotide'];
const classColors=(id:string)=>getColorScheme(id).classes!.map(c=>c.color);

it('simulation maps a neutral gray to itself and separates red from green under deuteranopia',()=>{
  expect(distance(simulate('#808080','deuteranopia'),simulate('#808080','normal'))).toBeLessThan(1);
  expect(distance(simulate('#d62728','normal'),simulate('#2ca02c','normal'))).toBeGreaterThan(60);
  expect(distance(simulate('#d62728','deuteranopia'),simulate('#2ca02c','deuteranopia'))).toBeLessThan(35);
});
it('keeps every pair of class colors at CIELAB distance 25 or more under normal vision, deuteranopia and protanopia',()=>{
  for(const id of safe)for(const kind of Object.keys(MACHADO))expect(minDistance(classColors(id),kind),`${id} ${kind}`).toBeGreaterThanOrEqual(25);
});
it('gives the high-contrast schemes letters with at least 7:1 contrast against every class color',()=>{
  for(const id of safe.filter(s=>s.startsWith('hc-')))for(const color of classColors(id))expect(contrast(color,textColor(color)),`${id} ${color}`).toBeGreaterThanOrEqual(7);
});
it('keeps letters readable on every colorblind-safe class color',()=>{
  for(const id of safe)for(const color of classColors(id))expect(contrast(color,textColor(color)),`${id} ${color}`).toBeGreaterThanOrEqual(4.5);
});
it('flags the new schemes, restricts them by alphabet and lists every residue class',()=>{
  expect(colorSchemes('protein').map(s=>s.id)).toEqual(expect.arrayContaining(['cvd-protein','hc-protein']));
  expect(colorSchemes('protein').map(s=>s.id)).not.toEqual(expect.arrayContaining(['cvd-nucleotide','hc-nucleotide']));
  for(const alphabet of ['dna','rna'] as const)expect(colorSchemes(alphabet).map(s=>s.id)).toEqual(expect.arrayContaining(['cvd-nucleotide','hc-nucleotide']));
  expect(colorSchemes('dna').map(s=>s.id)).not.toContain('cvd-protein');
  for(const id of safe){const s=getColorScheme(id);expect(s.cvdSafe).toBe(true);expect(s.classes!.length).toBeGreaterThanOrEqual(4);}
  expect(getColorScheme('hc-protein').highContrast).toBe(true);expect(getColorScheme('cvd-protein').highContrast).toBeUndefined();
  for(const letter of 'ACDEFGHIKLMNPQRSTVWY')expect(residueColor(letter,getColorScheme('cvd-protein'))).not.toBe('#e9edf2');
});
it('colors T and U alike and leaves ambiguity symbols neutral in the nucleotide schemes',()=>{
  for(const id of ['cvd-nucleotide','hc-nucleotide']){
    const s=getColorScheme(id);expect(s.colors.T).toBe(s.colors.U);
    expect(new Set(['A','C','G','T'].map(b=>s.colors[b])).size).toBe(4);
    expect(new Set([...'RYSWKMBDHVN'].map(b=>s.colors[b]))).toEqual(new Set(['#e0e5eb']));
  }
});
