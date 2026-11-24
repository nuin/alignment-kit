// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {reverseColumnMap,identityColumns} from '../src/mask';
import {Renderer,type RenderView} from '../src/renderer';
import {AnnotationIndex} from '../src/annotations';
import {calculateStats} from '../src/analysis';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.restoreAllMocks();});
const priv=(v:unknown)=>v as any;
const make=async(text:string,options={})=>{const el=document.createElement('div');document.body.append(el);const v=createViewer(el,{worker:false,cellWidth:10,...options});disposers.push(()=>v.destroy());await v.setAlignment(parseAlignment(text,{alphabet:'dna'}));return v;};
const wide=(v:unknown,w=60)=>{const s=priv(v).scroll;Object.defineProperty(s,'clientWidth',{value:Number(w),configurable:true});Object.defineProperty(s,'clientHeight',{value:200,configurable:true});};
const TWELVE='>a\nACGTACGTACGT\n>b\nACGTACGTACGT';

it('reports a multi-column visible range in the reverse-complement view',async()=>{
  const v=await make(TWELVE,{reverseComplement:true});wide(v,1000);priv(v).core.scroll.scrollLeft=0;
  const r=v.getVisibleColumns();expect(r).toEqual({start:1,end:12});
});
it('scrolls to the display position of a column in the reverse-complement view',async()=>{
  const v=await make(TWELVE,{reverseComplement:true});wide(v);
  expect(v.scrollToColumn(2)).toBe(true);expect(priv(v).core.scroll.scrollLeft).toBe(100);
});
it('shades percent-identity by the source residue in the reverse view and for flagged rows',()=>{
  const a=parseAlignment('>a\nA\n>b\nA\n>c\nA\n>d\nT',{alphabet:'dna'});
  const run=(extra:Partial<RenderView>)=>{const fills:string[]=[];let cur='';
    const ctx=new Proxy({},{get:(_,k)=>(...args:any[])=>{if(k==='fillRect')fills.push(cur);},set:(_,k,val)=>{if(k==='fillStyle')cur=String(val);return true;}});
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as any);
    const v:RenderView={a,stats:calculateStats(a),rows:[0],reference:0,x:0,y:0,cw:16,rh:22,gutter:0,scheme:'percent-identity',mode:'all',dark:false,selection:null,annotations:new AnnotationIndex([]),logo:false,...extra};
    new Renderer().body(document.createElement('canvas'),v,16,22);return fills[1];};
  const forward=run({});
  expect(run({reverse:true,columns:reverseColumnMap(identityColumns(1))})).toBe(forward);
  expect(run({strands:new Set(['seq-1'])})).toBe(forward);
});
it('rebuilds rows when annotations change under the annotations sort',async()=>{
  const v=await make('>s1\nACGT\n>s2\nACGT\n>s3\nACGT\n>s4\nACGT');
  await v.setSort('annotations');
  v.addAnnotations([{id:'f1',rowId:'seq-4',name:'x',type:'gene',mapping:'mapped',start:1,end:2} as any]);
  const shown=()=>priv(v).core.rows.map((i:number)=>`seq-${i+1}`);
  expect(shown()).toEqual(v.getRowOrder().filter(id=>id!=='seq-1'));expect(shown()[0]).toBe('seq-4');
  v.removeAnnotations(['f1']);expect(shown()).toEqual(['seq-2','seq-3','seq-4']);
});
