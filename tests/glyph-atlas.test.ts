// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { parseAlignment } from '../src/parsers';
import { calculateStats } from '../src/analysis';
import { AnnotationIndex } from '../src/annotations';
import { registerColorScheme } from '../src/colors';
import { Renderer, type RenderView } from '../src/renderer';
type Call={fn:string;args:any[]};
/** Records method calls and property writes of every 2D context; `canvases` counts created atlas canvases. */
function recorder(){
  const calls:Call[]=[],ctx=new Proxy({},{get:(_,k)=>(...args:any[])=>{calls.push({fn:String(k),args});},set:(_,k,value)=>{calls.push({fn:'set:'+String(k),args:[value]});return true;}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  return calls;
}
const view=(extra:Partial<RenderView>={}):RenderView=>{
  const a=parseAlignment('>r\nACGTACGT\n>s\nACGAACGA\n>t\nA-GTA-GT',{alphabet:'dna'});
  return {a,stats:calculateStats(a),rows:[0,1,2],reference:0,x:0,y:0,cw:9,rh:22,gutter:0,scheme:'soft-nucleotide',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,...extra};
};
const ratio=(value:number)=>Object.defineProperty(window,'devicePixelRatio',{value,configurable:true});
const whole=(n:number)=>Math.abs(n-Math.round(n))<1e-9;
afterEach(()=>{vi.restoreAllMocks();ratio(1);});
it.each([1.25,1.5,2])('copies atlas cells on whole device pixels at devicePixelRatio %s',dpr=>{
  ratio(dpr);const calls=recorder(),v=view({x:4.3,y:3.7});
  new Renderer().body(document.createElement('canvas'),v,72,66);
  const draws=calls.filter(c=>c.fn==='drawImage').map(c=>c.args),cellW=Math.ceil(9*dpr),cellH=Math.ceil(22*dpr);
  expect(draws.length).toBeGreaterThanOrEqual(24);
  for(const [,sx,sy,sw,sh,dx,dy,dw,dh] of draws){
    expect([sw,sh]).toEqual([cellW,cellH]);expect(sx%cellW).toBe(0);expect([0,cellH]).toContain(sy);
    // Destination in device pixels: whole origin and the same size as the source, so no resampling.
    expect(whole(dx*dpr)).toBe(true);expect(whole(dy*dpr)).toBe(true);expect(dw*dpr).toBeCloseTo(sw,9);expect(dh*dpr).toBeCloseTo(sh,9);
  }
  // Neighbouring cells never leave a device-pixel gap.
  const xs=[...new Set(draws.map(d=>Math.round(d[5]*dpr)))].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)expect(xs[i]-xs[i-1]).toBeLessThanOrEqual(cellW);
});
it('fills every atlas cell on whole device pixels at devicePixelRatio 1.5',()=>{
  ratio(1.5);const calls=recorder();
  new Renderer().body(document.createElement('canvas'),view(),72,66);
  const end=calls.findIndex(c=>c.fn==='drawImage'),atlas=calls.slice(0,end),first=atlas.findIndex(c=>c.fn==='setTransform'&&c.args[0]===1),cells=atlas.slice(first).filter(c=>c.fn==='fillRect').map(c=>c.args);
  expect(cells).toHaveLength(256);
  for(const [x,y,w,h] of cells){expect(x%14).toBe(0);expect([0,33]).toContain(y);expect(w).toBe(14);expect(h).toBe(31);}
  const shifts=atlas.slice(first).filter(c=>c.fn==='setTransform'&&c.args[0]===1.5).map(c=>c.args);
  expect(shifts).toHaveLength(256);for(const t of shifts){expect(t[4]%14).toBe(0);expect([0,33]).toContain(t[5]);}
});
it('keeps the device-ratio-1 geometry of the atlas',()=>{
  const calls=recorder();new Renderer().body(document.createElement('canvas'),view({cw:16}),128,66);
  const draws=calls.filter(c=>c.fn==='drawImage').map(c=>c.args);
  expect(draws[1].slice(1)).toEqual([67*16,0,16,22,16,0,16,22]);
});
it('reuses the atlas across frames and rebuilds it when a scheme ID is registered again',()=>{
  const scheme=(a:string)=>registerColorScheme({id:'atlas-test',label:'Atlas test',description:'test',colors:{A:a,C:'#222222',G:'#333333',T:'#444444'}});
  scheme('#aa0000');const calls=recorder(),r=new Renderer(),canvas=document.createElement('canvas'),v=view({scheme:'atlas-test'});
  const fills=()=>calls.filter(c=>c.fn==='set:fillStyle').map(c=>c.args[0]),made=vi.spyOn(document,'createElement');
  r.body(canvas,v,72,66);expect(fills()).toContain('#aa0000');
  const before=made.mock.calls.length;calls.length=0;r.body(canvas,v,72,66);
  expect(made.mock.calls.length).toBe(before);expect(fills()).not.toContain('#aa0000');
  scheme('#00aa00');calls.length=0;r.body(canvas,v,72,66);
  expect(made.mock.calls.length).toBe(before+1);expect(fills()).toContain('#00aa00');expect(fills()).not.toContain('#aa0000');
});
it('sets the residue font once per row on statistic-driven schemes and names only declared families',()=>{
  const calls=recorder(),r=new Renderer(),canvas=document.createElement('canvas');
  r.body(canvas,view({scheme:'conservation'}),72,66);
  const fonts=calls.filter(c=>c.fn==='set:font').map(c=>c.args[0]);
  // One assignment for the atlas and one per drawn row; 24 letters are drawn.
  expect(fonts).toHaveLength(4);expect(calls.filter(c=>c.fn==='fillText').length).toBeGreaterThanOrEqual(24);
  r.tracks(canvas,view({scheme:'conservation',logo:true}),72);
  for(const font of calls.filter(c=>c.fn==='set:font').map(c=>c.args[0]))expect(font).toMatch(/ui-monospace, monospace$|"Alignment Sans", system-ui, sans-serif$/);
});
