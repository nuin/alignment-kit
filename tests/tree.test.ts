import {it,expect} from 'vitest';
import {parseNewick,leafOrder,layoutTree,matchLeaves,treeSpans,leavesUnder} from '../src/tree';
it('parses names, branch lengths and nesting',()=>{
  const root=parseNewick('((A:0.1,B:0.2)AB:0.3,C:0.4);');
  expect(root.children).toHaveLength(2);expect(root.children[0].name).toBe('AB');expect(root.children[0].length).toBe(0.3);
  expect(root.children[0].children.map(n=>[n.name,n.length])).toEqual([['A',0.1],['B',0.2]]);expect(root.children[1]).toMatchObject({name:'C',length:0.4,children:[]});
  expect(parseNewick('A;')).toMatchObject({name:'A',children:[]});expect(parseNewick('(a,b)').children).toHaveLength(2);
  expect(parseNewick('(a:1e-2,b:-.5);').children.map(n=>n.length)).toEqual([0.01,-0.5]);
});
it('reads quoted labels, comments and internal support',()=>{
  const root=parseNewick("[tree comment](('Homo sapiens'[&x=1]:0.1,'it''s (odd)':2)0.95:1,(c,d)'90':3)100;");
  expect(root.support).toBe(100);expect(root.name).toBe('');
  expect(root.children[0].support).toBe(0.95);expect(root.children[0].children.map(n=>n.name)).toEqual(['Homo sapiens',"it's (odd)"]);
  expect(root.children[0].children[0].length).toBe(0.1);
  expect(root.children[1]).toMatchObject({name:'90',support:null});
  expect(parseNewick('(a_1,b 2);').children.map(n=>n.name)).toEqual(['a_1','b 2']);
});
it('rejects malformed trees with a position',()=>{
  for(const bad of ['','  ','(a,b','a,b);','(a,b));','(a,b);x','(a:x,b);',"('a,b);",'(a,b)[open;'])expect(()=>parseNewick(bad),bad).toThrow(/Invalid Newick/);
});
it('lists leaves top to bottom and parses a deep caterpillar without recursion limits',()=>{
  expect(leafOrder(parseNewick('((A,B),(C,(D,E)));'))).toEqual(['A','B','C','D','E']);
  const n=20000;expect(leafOrder(parseNewick('('.repeat(n)+'a'+',b)'.repeat(n)+';'))).toHaveLength(n+1);
});
it('scales x by root distance and counts missing lengths as 1 only for unmeasured trees',()=>{
  const measured=layoutTree(parseNewick('((A:1,B:3):1,C:2);'));
  expect([...measured.x]).toEqual([0,0.25,0.5,1,0.5]);expect([...measured.parent]).toEqual([-1,0,1,1,0]);
  const unit=layoutTree(parseNewick('((A,B),C);'));expect([...unit.x]).toEqual([0,0.5,1,1,0.5]);
});
it('matches leaves to rows by id, then name, once each',()=>{
  const layout=layoutTree(parseNewick('(s2,Beta,Beta,gone,s1);'));
  const rows=[{id:'s1',name:'Alpha'},{id:'s2',name:'Beta'},{id:'s3',name:'Beta'},{id:'s4',name:'Delta'}];
  const match=matchLeaves(layout,rows);
  expect([...match.leafRow]).toEqual([-1,1,2,-1,-1,0]);
  expect(match.unmatchedLeaves).toEqual(['Beta','gone']);expect(match.unmatchedRows).toBe(1);
});
it('positions internal nodes between their present children and skips absent leaves',()=>{
  const layout=layoutTree(parseNewick('((A,B),(C,D));')),heights:Record<string,number>={A:10,B:30,C:50},leafY=new Float64Array(layout.nodes.length).fill(NaN);
  layout.nodes.forEach((n,k)=>{if(!n.children.length)leafY[k]=heights[n.name]??NaN;});
  const {y,lo,hi}=treeSpans(layout,leafY);
  expect(y[1]).toBe(20);expect([lo[1],hi[1]]).toEqual([10,30]);expect(y[4]).toBe(50);expect(y[0]).toBe(35);expect([lo[0],hi[0]]).toEqual([20,50]);expect(y[layout.nodes.findIndex(n=>n.name==='D')]).toBeNaN();
  expect(leavesUnder(layout,4).map(k=>layout.nodes[k].name)).toEqual(['C','D']);
});
