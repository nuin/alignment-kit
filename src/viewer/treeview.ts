import { $ } from '../controls';
import { getColorScheme, residueColor } from '../colors';
import { hitBranch, treeViewGeometry, drawTreeView, type TreeViewLeaf } from '../tree-view';
import { isDark } from './accessibility';
import { type Core, type On } from './core';
const overlay=(v:Core)=>$(v.root,'.ak-tree-view'),scroller=(v:Core)=>$(v.root,'.ak-tree-view-scroll'),box=(v:Core)=>$<HTMLInputElement>(v.root,'.ak-tree-view input');
const size=(v:Core)=>{const s=scroller(v);return {width:Math.max(1,s.clientWidth),height:Math.max(1,s.clientHeight)};};
/** Open the full-size tree at an alignment column (default: the selected column, else 1). Needs a tree. */
export function openTreeView(v:Core, column?:number):void {
  v.assertAlive();if(!v.tree||!v.a)throw v.error(new Error('Set or build a tree before opening the tree view.'));
  const focused=(v.root.getRootNode() as Document|ShadowRoot).activeElement;
  v.treeView={column:1,opener:focused instanceof HTMLElement&&v.root.contains(focused)&&focused!==v.root?focused:$<HTMLElement>(v.root,'[data-action="tree-view"]'),geometry:treeViewGeometry(v.tree.layout)};
  setColumn(v,column??v.selection?.start??1);overlay(v).hidden=false;syncGeometry(v);box(v).focus();
}
export function closeTreeView(v:Core):void {
  const tv=v.treeView;if(!tv)return;v.treeView=undefined;overlay(v).hidden=true;
  if(tv.opener?.isConnected)tv.opener.focus();
}
function setColumn(v:Core, column:number):void {
  const tv=v.treeView;if(!tv||!v.a||!Number.isFinite(column))return;tv.column=Math.min(v.a.width,Math.max(1,Math.round(column)));box(v).value=String(tv.column);box(v).max=String(v.a.width);
}
/** Rebuild the geometry for the current tree, then redraw. Closes when there is no tree. */
export function syncGeometry(v:Core):void {
  if(!v.treeView)return;if(!v.tree){closeTreeView(v);return;}
  v.treeView.geometry=treeViewGeometry(v.tree.layout);$(v.root,'.ak-tree-view-spacer').style.height=v.treeView.geometry.height+'px';drawTreeViewNow(v);
}
export function drawTreeViewNow(v:Core):void {
  const tv=v.treeView,tree=v.tree,a=v.a;if(!tv||!tree||!a)return;
  const {width,height}=size(v),canvas=$<HTMLCanvasElement>(v.root,'.ak-tree-view canvas'),scheme=getColorScheme(v.options.colorScheme),col=tv.column-1;
  canvas.style.height=height+'px';
  const leaf=(node:number):TreeViewLeaf=>{
    const row=tree.leafRow[node];if(row<0)return {label:tree.layout.nodes[node].name||'unnamed',residue:null,color:null,muted:true};
    const code=a.codes[row*a.width+col],residue=code===45||code===46?'-':String.fromCharCode(code);
    return {label:a.rows[row].name,residue,color:residueColor(residue,scheme),muted:false};
  };
  drawTreeView(canvas,tree.layout,tv.geometry,leaf,scroller(v).scrollTop,width,height,isDark(v));
}
/** Move the open view to the selected column. */
export function followSelection(v:Core):void {
  if(!v.treeView||!v.selection)return;setColumn(v,v.selection.start);drawTreeViewNow(v);
}
export function bindTreeView(v:Core, on:On):void {
  let frame=0;const redraw=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;drawTreeViewNow(v);});};
  on(scroller(v),'scroll',redraw);
  on(box(v),'change',()=>{const n=box(v).valueAsNumber;if(Number.isFinite(n))setColumn(v,n);else if(v.treeView)box(v).value=String(v.treeView.column);drawTreeViewNow(v);});
  on(v.root,'keydown',(event:KeyboardEvent)=>{if(event.key==='Escape'&&v.treeView&&!event.defaultPrevented){event.stopPropagation();closeTreeView(v);}});
  on($(v.root,'.ak-tree-view canvas'),'click',(event:MouseEvent)=>{
    const tv=v.treeView,tree=v.tree;if(!tv||!tree)return;
    const canvas=event.currentTarget as HTMLElement,rect=canvas.getBoundingClientRect(),node=hitBranch(tree.layout,tv.geometry,size(v).width,event.clientX-rect.left,event.clientY-rect.top+scroller(v).scrollTop);
    if(node>=0)v.selectClade(node,event.shiftKey);
  });
}
