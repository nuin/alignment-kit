import {it,expect} from 'vitest';
import palettes from '../src/palettes.json';
import {colorSchemes,residueColor,textColor,getColorScheme,dynamicColor} from '../src/colors';

const luminance=(hex:string)=>{const h=hex.length===4?'#'+[...hex.slice(1)].map(x=>x+x).join(''):hex,c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const ratio=(fill:string)=>contrast(fill,textColor(fill));

it('reaches 4.5:1 on every entry of palettes.json',()=>{
  let entries=0;
  for(const [name,colors] of Object.entries(palettes as Record<string,Record<string,string>>))for(const [residue,fill] of Object.entries(colors)){entries++;expect(ratio(fill),`${name} ${residue} ${fill}`).toBeGreaterThanOrEqual(4.5);}
  expect(entries).toBe(339);
});
it('reaches 4.5:1 on every fill of every registered scheme, the gap fill and the legend classes',()=>{
  for(const scheme of colorSchemes()){
    for(const [residue,fill] of Object.entries(scheme.colors))expect(ratio(fill),`${scheme.id} ${residue} ${fill}`).toBeGreaterThanOrEqual(4.5);
    for(const c of scheme.classes??[])expect(ratio(c.color),`${scheme.id} ${c.label}`).toBeGreaterThanOrEqual(4.5);
    for(const residue of 'ACDEFGHIKLMNPQRSTVWYBXZJUO*-.')expect(ratio(residueColor(residue,scheme)),`${scheme.id} ${residue}`).toBeGreaterThanOrEqual(4.5);
  }
});
it('reaches 4.5:1 along the statistics ramp and on the BLOSUM62 fills',()=>{
  for(const id of ['conservation','percent-identity'])for(let t=0;t<=100;t++)expect(ratio(residueColor('A',getColorScheme(id),t/100)),`${id} ${t}`).toBeGreaterThanOrEqual(4.5);
  for(const fill of ['#b4cfe8','#e9edf2','#edf0f4','#f1f4f7',dynamicColor(getColorScheme('blosum62'),'A',undefined,0,0,0)])expect(ratio(fill),fill).toBeGreaterThanOrEqual(4.5);
});
it('uses white on dark fills, the viewer ink on light fills and black only in between',()=>{
  expect(textColor('#003959')).toBe('#ffffff');expect(textColor('#c7d9ec')).toBe('#172737');expect(textColor('#fff')).toBe('#172737');
  for(const fill of ['#ff0000','#EB413C','#808080','#e718e7','#009768']){expect(textColor(fill),fill).toBe('#000000');expect(ratio(fill),fill).toBeGreaterThanOrEqual(4.5);}
  for(let v=0;v<256;v++){const h=v.toString(16).padStart(2,'0');expect(ratio(`#${h}${h}${h}`),h).toBeGreaterThanOrEqual(4.5);}
});
