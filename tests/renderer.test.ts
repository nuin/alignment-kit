// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { parseAlignment } from '../src/parsers';
import { calculateStats } from '../src/analysis';
import { AnnotationIndex } from '../src/annotations';
import { Renderer, type RenderView } from '../src/renderer';
type Call={fn:string;args:any[]};
function record(scheme:string,matchDots:boolean):Call[]{
  const a=parseAlignment('>r\nACGT\n>s\nACGA\n>t\nA-GT',{alphabet:'dna'}),calls:Call[]=[];
  const ctx=new Proxy({},{get:(_,k)=>(...args:any[])=>{calls.push({fn:String(k),args});},set:()=>true});
  const spy=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
  const v:RenderView={a,stats:calculateStats(a),rows:[1,2],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme,mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,matchDots};
  new Renderer().body(document.createElement('canvas'),v,64,44);spy.mockRestore();
  return calls;
}
const tileY=(c:Call[])=>c.filter(x=>x.fn==='drawImage').map(x=>x.args[2]>0);
it('draws matching residues from the second atlas tile',()=>{
  expect(tileY(record('soft',false))).toEqual(Array(8).fill(false));
  expect(tileY(record('soft',true))).toEqual([true,true,true,false,true,false,true,true]);
});
it('draws a dot glyph on the conservation path',()=>{
  const text=(c:Call[])=>c.filter(x=>x.fn==='fillText').slice(-8).map(x=>x.args[0]).join('');
  expect(text(record('conservation',false))).toBe('ACGAA·GT');
  expect(text(record('conservation',true))).toBe('...A.·..');
});
