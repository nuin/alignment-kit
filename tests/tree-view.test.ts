import {describe,expect,it} from 'vitest';
import {layoutTree,parseNewick} from '../src/tree.js';
import {branchX,hitBranch,treeViewGeometry,visibleLeaves} from '../src/tree-view.js';

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
