import {treeSpans,type TreeLayout} from './tree.js';
export const TREE_LEAF_H=22,TREE_LABEL_W=260;
/** Content-space geometry of the full-size tree: `leaves` are node indexes in tree order, `y/lo/hi` pixel centres and bar spans per node. */
export interface TreeViewGeometry { leaves:number[]; y:Float64Array; lo:Float64Array; hi:Float64Array; height:number }

/** One leaf per TREE_LEAF_H pixels in pre-order, internal nodes midway between their children. */
export function treeViewGeometry(layout:TreeLayout):TreeViewGeometry {
  const leaves:number[]=[],leafY=new Float64Array(layout.nodes.length).fill(NaN);
  layout.nodes.forEach((node,k)=>{if(!node.children.length){leafY[k]=leaves.length*TREE_LEAF_H+TREE_LEAF_H/2;leaves.push(k);}});
  return {leaves,...treeSpans(layout,leafY),height:leaves.length*TREE_LEAF_H};
}

/** Horizontal pixel of a node's branch tip for a canvas `width`; the label column and padding stay clear. */
export function branchX(layout:TreeLayout,node:number,width:number):number { return 8+layout.x[node]*Math.max(1,width-TREE_LABEL_W-16); }

/** Half-open range into `g.leaves` of the rows touching the content-space window [top, top+height]. */
export function visibleLeaves(g:TreeViewGeometry,top:number,height:number):[number,number] {
  const n=g.leaves.length;
  return [Math.min(n,Math.max(0,Math.floor(top/TREE_LEAF_H))),Math.min(n,Math.max(0,Math.floor((top+height)/TREE_LEAF_H)+1))];
}

/** Internal node whose branch tip lies within 6 px of (x, y) in content space, else -1. */
export function hitBranch(layout:TreeLayout,g:TreeViewGeometry,width:number,x:number,y:number):number {
  let best=-1,bd=36;
  for(let k=0;k<layout.nodes.length;k++){if(!layout.kids[k].length||!(g.y[k]>=0))continue;const dx=branchX(layout,k,width)-x,dy=g.y[k]-y,d=dx*dx+dy*dy;if(d<=bd){bd=d;best=k;}}
  return best;
}
