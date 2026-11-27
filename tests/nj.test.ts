// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {neighborJoining,neighborJoiningTree,pDistances,MAX_NJ_ROWS} from '../src/nj';
import {parseNewick,type TreeNode} from '../src/tree';
import {createAlignment} from '../src/model';
import {createViewer} from '../src/viewer';

/** Leaf-to-leaf path lengths of a parsed tree. */
function pathLengths(root:TreeNode):Map<string,number> {
  const up=new Map<TreeNode,{parent:TreeNode;len:number}>(),leaves:TreeNode[]=[];
  const walk=(n:TreeNode)=>{if(!n.children.length)leaves.push(n);for(const c of n.children){up.set(c,{parent:n,len:c.length??0});walk(c);}};walk(root);
  const toRoot=(n:TreeNode)=>{const m=new Map<TreeNode,number>();let d=0;for(let x:TreeNode|undefined=n;x;){m.set(x,d);const p=up.get(x);if(!p)break;d+=p.len;x=p.parent;}return m;};
  const out=new Map<string,number>();
  for(const a of leaves)for(const b of leaves){if(a===b)continue;const ma=toRoot(a);let d=0;for(let x:TreeNode|undefined=b;x;){if(ma.has(x)){out.set(`${a.name}|${b.name}`,d+ma.get(x)!);break;}const step:{parent:TreeNode;len:number}=up.get(x)!;d+=step.len;x=step.parent;}}
  return out;
}

it('recovers an additive tree exactly (Saitou and Nei worked example)',()=>{
  const names=['a','b','c','d','e'],m=[[0,5,9,9,8],[5,0,10,10,9],[9,10,0,8,7],[9,10,8,0,3],[8,9,7,3,0]];
  const tree=parseNewick(neighborJoining(Float64Array.from(m.flat()),names)),paths=pathLengths(tree);
  for(let i=0;i<5;i++)for(let j=0;j<5;j++)if(i!==j)expect(paths.get(`${names[i]}|${names[j]}`)).toBeCloseTo(m[i][j],9);
  expect(tree.children).toHaveLength(3);
});

it('handles one, two and three sequences and quotes labels',()=>{
  expect(neighborJoining(new Float64Array(1),["it's"])).toBe("'it''s';");
  expect(neighborJoining(Float64Array.from([0,0.4,0.4,0]),['x','y'])).toBe("('x':0.2,'y':0.2);");
  expect(parseNewick(neighborJoining(Float64Array.from([0,2,3,2,0,3,3,3,0]),['p','q','r'])).children.map(c=>[c.name,c.length])).toEqual([['p',1],['q',1],['r',2]]);
  expect(()=>neighborJoining(new Float64Array(3),['a','b'])).toThrow('does not match');
});

it('computes p-distances over canonical residues and fills pairs with nothing to compare',()=>{
  const a=createAlignment([{id:'s1',name:'s1',sequence:'ACGT--'},{id:'s2',name:'s2',sequence:'ACGA--'},{id:'s3',name:'s3',sequence:'----AC'}],{alphabet:'dna'});
  const d=pDistances(a,[0,1,2]);
  expect(d[1]).toBeCloseTo(0.25);expect(Number.isNaN(d[2])).toBe(true);expect(d[0]).toBe(0);
  const t=neighborJoiningTree(a);expect(t.missing).toBe(2);expect(t.rows).toBe(3);
  expect(()=>neighborJoiningTree(a,[0,0])).toThrow('distinct');
  expect(()=>neighborJoiningTree(a,Array.from({length:MAX_NJ_ROWS+1},(_,i)=>i))).toThrow(`limited to ${MAX_NJ_ROWS}`);
});

it('groups closer sequences together',()=>{
  const a=createAlignment([{id:'h1',name:'h1',sequence:'AAAAAAAAAA'},{id:'h2',name:'h2',sequence:'AAAAAAAAAC'},{id:'m1',name:'m1',sequence:'GGGGGAAAAA'},{id:'m2',name:'m2',sequence:'GGGGGAAAAT'}],{alphabet:'dna'});
  const p=pathLengths(parseNewick(neighborJoiningTree(a).newick));
  expect(p.get('h1|h2')!).toBeLessThan(p.get('h1|m1')!);expect(p.get('m1|m2')!).toBeLessThan(p.get('h2|m2')!);
});

const disposers:(()=>void)[]=[];
beforeAll(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});

it('buildTree applies the tree and sorts rows by it',async()=>{
  const el=document.createElement('div');document.body.append(el);
  const viewer=createViewer(el,{worker:false,visibility:{reference:false}});disposers.push(()=>viewer.destroy());
  await expect(viewer.buildTree()).rejects.toThrow('Load an alignment');
  await viewer.setAlignment(createAlignment([{id:'h1',name:'h1',sequence:'AAAAAAAAAA'},{id:'m1',name:'m1',sequence:'GGGGGAAAAA'},{id:'h2',name:'h2',sequence:'AAAAAAAAAC'},{id:'m2',name:'m2',sequence:'GGGGGAAAAT'}],{alphabet:'dna'}));
  const newick=await viewer.buildTree();
  expect(newick).toContain("'h1'");
  const v=viewer as any;expect(v.sort).toBe('tree');expect(v.tree.note).toBe('');
  const order=(v.rows as number[]).map(i=>v.a.rows[i].id).join(',');
  expect(Math.abs(order.split(',').indexOf('h1')-order.split(',').indexOf('h2'))).toBe(1);
});
