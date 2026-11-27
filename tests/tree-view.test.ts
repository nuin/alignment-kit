// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {layoutTree,parseNewick} from '../src/tree.js';
import {branchX,drawTreeView,hitBranch,treeViewGeometry,visibleLeaves} from '../src/tree-view.js';

const l=layoutTree(parseNewick('((a:1,b:1):1,c:2);'));
const g=treeViewGeometry(l);
const ab=l.nodes.findIndex(n=>n.children.length===2&&n.children[0].name==='a');

describe('tree view geometry',()=>{
  it('orders leaves and places them',()=>{
    expect(g.leaves.map(k=>l.nodes[k].name)).toEqual(['a','b','c']);
    expect(g.height).toBe(66);
    expect(g.y[g.leaves[0]]).toBe(11);
  });
  it('spans an internal node',()=>{
    expect([g.y[ab],g.lo[ab],g.hi[ab]]).toEqual([22,11,33]);
  });
  it('maps branch x',()=>{
    expect(branchX(l,0,276)).toBe(8);
    expect(branchX(l,g.leaves[2],276)).toBe(8+1*Math.max(1,276-260-16));
  });
  it('finds visible leaves',()=>{
    expect(visibleLeaves(g,30,20)).toEqual([1,3]);
    const n=20000,tree=layoutTree(parseNewick(Array.from({length:n-1},(_,i)=>`(l${i},`).join('')+`l${n-1}`+')'.repeat(n-1)+';'));
    const big=treeViewGeometry(tree),[a,b]=visibleLeaves(big,220000,440);
    expect(b-a).toBeGreaterThanOrEqual(21);expect(b-a).toBeLessThanOrEqual(22);
  });
  it('hit tests internal nodes',()=>{
    const x=branchX(l,ab,600),y=g.y[ab];
    expect(hitBranch(l,g,600,x,y)).toBe(ab);
    expect(hitBranch(l,g,600,x+20,y)).toBe(-1);
  });
});

describe('drawTreeView',()=>{
  const stub=()=>{const texts:string[]=[],rects:number[][]=[],fills:string[]=[],noop=()=>{};
    const ctx:any={setTransform:noop,clearRect:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,save:noop,restore:noop,fillRect:(...a:number[])=>{rects.push(a);fills.push(ctx.fillStyle);},fillText:(t:string)=>texts.push(t),measureText:()=>({width:5})};
    return {canvas:{getContext:()=>ctx,style:{}} as any,texts,rects,fills};};
  const info=(k:number)=>{const n=l.nodes[k].name;return {label:n,residue:n==='b'?null:n.toUpperCase(),color:'#ffcc00',muted:n==='c'};};
  it('draws labels and chips for visible leaves',()=>{
    const s=stub();drawTreeView(s.canvas,l,g,info,0,600,66,false);
    expect(s.texts).toEqual(expect.arrayContaining(['a','b','c','A','C']));
    expect(s.texts).not.toContain('B');
    const chips=s.rects.filter(r=>r[2]===18&&r[3]===16);
    expect(chips.length).toBe(2);expect(chips[0][0]).toBe(600-260+8);
  });
  it('skips leaves outside the window',()=>{
    const s=stub();drawTreeView(s.canvas,l,g,info,44,600,22,true);
    expect(s.texts).toContain('c');expect(s.texts).not.toContain('a');
  });
});
