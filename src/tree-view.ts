import {treeSpans,type TreeLayout} from './tree.js';
import {prepareCanvas} from './renderer.js';
import {textColor} from './colors.js';
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

/** What a leaf shows: its label, an optional 18 x 16 residue chip (null residue: no chip), and a muted label for unmatched leaves. */
export interface TreeViewLeaf { label:string; residue:string|null; color:string|null; muted:boolean }

/** Draw the tree for the content-space window [top, top+height] of a `width` x `height` canvas; leaf branches end at the chip column. */
export function drawTreeView(canvas:HTMLCanvasElement,layout:TreeLayout,g:TreeViewGeometry,leaf:(node:number)=>TreeViewLeaf,top:number,width:number,height:number,dark:boolean):void {
  const ctx=prepareCanvas(canvas,width,height),cx=width-TREE_LABEL_W+8,px=(k:number)=>layout.kids[k].length?branchX(layout,k,width):cx;
  ctx.fillStyle=dark?'#172333':'#f9fbfc';ctx.fillRect(0,0,width,height);
  ctx.strokeStyle=dark?'#8ea4ba':'#6b7f93';ctx.lineWidth=1;ctx.beginPath();
  for(let k=0;k<g.y.length;k++) {
    if(Number.isNaN(g.y[k]))continue;
    const internal=layout.kids[k].length>0,a=internal?g.lo[k]:g.y[k],b=internal?g.hi[k]:g.y[k];
    if(b<top-2||a>top+height+2)continue;
    if(k>0){const yy=Math.round(g.y[k]-top)+.5;ctx.moveTo(px(layout.parent[k]),yy);ctx.lineTo(px(k),yy);}
    if(internal){const xx=Math.round(px(k))+.5;ctx.moveTo(xx,a-top);ctx.lineTo(xx,b-top);}
  }
  ctx.stroke();
  ctx.fillStyle=dark?'#b7c8d9':'#3f5870';
  for(let k=0;k<g.y.length;k++)if(layout.kids[k].length&&g.y[k]>=top-2&&g.y[k]<=top+height+2)ctx.fillRect(px(k)-2,g.y[k]-top-2,4,4);
  const [from,to]=visibleLeaves(g,top,height);
  ctx.textBaseline='middle';
  for(let i=from;i<to;i++) {
    const k=g.leaves[i],y=g.y[k]-top,l=leaf(k);
    if(l.residue!==null&&l.color){ctx.fillStyle=l.color;ctx.fillRect(cx,y-8,18,16);ctx.fillStyle=textColor(l.color);ctx.font='500 12px "Alignment Mono", ui-monospace, monospace';ctx.textAlign='center';ctx.fillText(l.residue,cx+9,y);}
    ctx.fillStyle=l.muted?(dark?'#7f93a8':'#8393a4'):(dark?'#e3ecf5':'#243447');ctx.font='12px "Alignment Sans", system-ui, sans-serif';ctx.textAlign='left';ctx.fillText(l.label,cx+18+6,y,TREE_LABEL_W-8-18-6-4);
  }
}
