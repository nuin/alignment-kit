// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {Renderer,type RenderView} from '../src/renderer';
import {parseNewick,layoutTree,matchLeaves} from '../src/tree';
type Call=[string,number[]];
const fakeCanvas=(calls:Call[])=>{
  const ctx=new Proxy({},{get:(_,name)=>(...args:number[])=>{if(typeof name==='string')calls.push([name,args]);},set:()=>true});
  return {width:0,height:0,style:{},getContext:()=>ctx} as unknown as HTMLCanvasElement;
};
it('draws tree leaves at the display position of their rows under scrolling',()=>{
  const layout=layoutTree(parseNewick('(a,b,c);')),match=matchLeaves(layout,[{id:'a',name:'a'},{id:'b',name:'b'},{id:'c',name:'c'}]),calls:Call[]=[];
  const view={rh:36,y:36,dark:false} as RenderView;
  const hits=new Renderer().tree(fakeCanvas(calls),view,layout,match.leafRow,Int32Array.from([0,1,2]),120,100);
  const horizontal=calls.filter(([name])=>name==='lineTo').map(([,args])=>args[1]);
  expect(horizontal).toContain(18.5);expect(horizontal).toContain(54.5);expect(horizontal).not.toContain(-17.5);
  expect(hits).toHaveLength(1);expect(hits[0]).toMatchObject({node:0,y:18});
});
it('skips leaves whose rows are not displayed',()=>{
  const layout=layoutTree(parseNewick('(a,b,c);')),match=matchLeaves(layout,[{id:'a',name:'a'},{id:'b',name:'b'},{id:'c',name:'c'}]),calls:Call[]=[];
  const hits=new Renderer().tree(fakeCanvas(calls),{rh:36,y:0,dark:false} as RenderView,layout,match.leafRow,Int32Array.from([-1,-1,0]),120,100);
  const horizontal=calls.filter(([name])=>name==='lineTo').map(([,args])=>args[1]);
  expect(hits).toMatchObject([{node:0,y:18}]);expect(horizontal).toContain(18.5);expect(horizontal).not.toContain(54.5);expect(horizontal).not.toContain(90.5);
});
