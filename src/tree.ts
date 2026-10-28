/** A parsed Newick node. `support` holds a numeric label on an internal node; every other label is a `name`. */
export interface TreeNode { name:string; length:number|null; support:number|null; children:TreeNode[] }
/** Nodes in pre-order (parents first, leaves left to right). `x` is the root distance scaled to 0..1. */
export interface TreeLayout { nodes:TreeNode[]; parent:Int32Array; kids:number[][]; x:Float64Array }
export interface TreeMatch { leafRow:Int32Array; unmatchedLeaves:string[]; unmatchedRows:number }
const fail=(message:string,at:number):never=>{throw new Error(`Invalid Newick at character ${at+1}: ${message}.`);};
const number=/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const numeric=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parse one Newick tree: names, branch lengths, 'quoted' labels, [comments] and numeric internal-node support. Underscores stay literal. */
export function parseNewick(text:string):TreeNode {
  let i=0;const n=text.length;
  const make=():TreeNode=>({name:'',length:null,support:null,children:[]});
  const skip=()=>{for(;;){while(i<n&&/\s/.test(text[i]))i++;if(text[i]!=='[')return;let depth=0;const from=i;do{if(text[i]==='[')depth++;else if(text[i]===']')depth--;i++;}while(i<n&&depth>0);if(depth>0)fail('unterminated [comment]',from);}};
  const label=(node:TreeNode)=>{
    skip();let value='',quoted=false;
    if(text[i]==="'"){quoted=true;const from=i++;for(;;){if(i>=n)fail('unterminated quoted label',from);if(text[i]==="'"){if(text[i+1]==="'"){value+="'";i+=2;continue;}i++;break;}value+=text[i++];}}
    else{const from=i;while(i<n&&!'(),:;['.includes(text[i]))i++;value=text.slice(from,i).trim();}
    if(node.children.length&&!quoted&&numeric.test(value))node.support=Number(value);else node.name=value;
    skip();
    if(text[i]===':'){i++;skip();number.lastIndex=i;const m=number.exec(text);if(!m)fail('branch length is not a number',i);node.length=Number(m![0]);i+=m![0].length;}
  };
  skip();if(i>=n)fail('the tree is empty',0);
  const root=make(),stack:TreeNode[]=[];let cur=root,closed=false;
  for(;;){
    skip();
    if(!closed&&text[i]==='('){i++;stack.push(cur);const child=make();cur.children.push(child);cur=child;continue;}
    label(cur);closed=false;skip();
    if(text[i]===','){const parent=stack[stack.length-1];if(!parent)fail('unexpected comma',i);i++;cur=make();parent.children.push(cur);}
    else if(text[i]===')'){const parent=stack.pop();if(!parent)fail('unbalanced )',i);i++;cur=parent!;closed=true;}
    else break;
  }
  if(stack.length)fail('missing )',i);
  if(text[i]===';')i++;
  skip();if(i<n)fail('unexpected text after the tree',i);
  return root;
}

/** Leaf names from top to bottom, the order a tree is drawn in. */
export function leafOrder(root:TreeNode):string[] {
  const names:string[]=[],stack=[root];
  for(let node=stack.pop();node;node=stack.pop()){if(!node.children.length)names.push(node.name);for(let k=node.children.length-1;k>=0;k--)stack.push(node.children[k]);}
  return names;
}

/** Flatten a tree into pre-order arrays. Missing branch lengths count as 1 unless some branch has a length, then as 0. */
export function layoutTree(root:TreeNode):TreeLayout {
  const nodes:TreeNode[]=[],parent:number[]=[],stack:[TreeNode,number][]=[[root,-1]];
  for(let item=stack.pop();item;item=stack.pop()){const [node,p]=item,index=nodes.length;nodes.push(node);parent.push(p);for(let k=node.children.length-1;k>=0;k--)stack.push([node.children[k],index]);}
  const kids:number[][]=nodes.map(()=>[]);for(let k=1;k<nodes.length;k++)kids[parent[k]].push(k);
  const measured=nodes.some(node=>node.length!==null),x=new Float64Array(nodes.length);let max=0;
  for(let k=1;k<nodes.length;k++){x[k]=x[parent[k]]+Math.max(0,nodes[k].length??(measured?0:1));max=Math.max(max,x[k]);}
  if(max>0)for(let k=0;k<x.length;k++)x[k]/=max;
  return {nodes,parent:Int32Array.from(parent),kids,x};
}

/** Pair leaves with rows by id first, then by name. Each row takes at most one leaf; leafRow is -1 for unmatched leaves and internal nodes. */
export function matchLeaves(layout:TreeLayout,rows:{id:string;name:string}[]):TreeMatch {
  const byId=new Map<string,number>(),byName=new Map<string,number[]>(),taken=new Set<number>();
  rows.forEach((row,r)=>{byId.set(row.id,r);const list=byName.get(row.name);if(list)list.push(r);else byName.set(row.name,[r]);});
  const leafRow=new Int32Array(layout.nodes.length).fill(-1),leaves:number[]=[];
  layout.nodes.forEach((node,k)=>{if(!node.children.length)leaves.push(k);});
  for(const k of leaves){const r=byId.get(layout.nodes[k].name);if(r!==undefined&&!taken.has(r)){leafRow[k]=r;taken.add(r);}}
  for(const k of leaves)if(leafRow[k]<0){const r=byName.get(layout.nodes[k].name)?.find(candidate=>!taken.has(candidate));if(r!==undefined){leafRow[k]=r;taken.add(r);}}
  return {leafRow,unmatchedLeaves:leaves.filter(k=>leafRow[k]<0).map(k=>layout.nodes[k].name),unmatchedRows:rows.length-taken.size};
}

/** Vertical position per node: leaves take `leafY` (NaN when absent), internal nodes sit midway between their first and last present child. `lo` and `hi` bound each node's vertical bar. */
export function treeSpans(layout:TreeLayout,leafY:Float64Array):{y:Float64Array;lo:Float64Array;hi:Float64Array} {
  const count=layout.nodes.length,y=new Float64Array(count).fill(NaN),lo=new Float64Array(count).fill(NaN),hi=new Float64Array(count).fill(NaN);
  for(let k=count-1;k>=0;k--){
    const kids=layout.kids[k];
    if(!kids.length){y[k]=leafY[k];continue;}
    let min=Infinity,max=-Infinity;for(const child of kids){const v=y[child];if(v<min)min=v;if(v>max)max=v;}
    if(min<=max){y[k]=(min+max)/2;lo[k]=min;hi[k]=max;}
  }
  return {y,lo,hi};
}

/** Leaf node indexes under a node, left to right. */
export function leavesUnder(layout:TreeLayout,node:number):number[] {
  const out:number[]=[],stack=[node];
  for(let k=stack.pop();k!==undefined;k=stack.pop()){const kids=layout.kids[k];if(!kids.length)out.push(k);else for(let j=kids.length-1;j>=0;j--)stack.push(kids[j]);}
  return out;
}
