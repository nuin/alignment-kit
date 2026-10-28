import { $ } from '../controls';
import { parseNewick, layoutTree, matchLeaves, leavesUnder, type TreeLayout } from '../tree';
import { type Core, type BoundTree } from './core';
export function setTree(v:Core, newick:string|null):void {
  v.assertAlive();
  v.clearTreeNote();
  if(newick===null){v.tree=undefined;if(v.sort==='tree')v.sort='input';}
  else {
    if(!v.a)throw v.error(new Error('Load an alignment before setting a tree.'));
    let layout:TreeLayout;try{layout=layoutTree(parseNewick(newick));}catch(error){throw v.error(error);}
    v.tree=v.bindTree(layout);v.sort='tree';
  }
  $<HTMLSelectElement>(v.root,'[aria-label="Sequence order"]').value=v.sort;v.rebuildRows();v.emit('state',v.getState());
}
/** Clear the message area when it still shows a warning about the tree being removed or replaced. */
export function clearTreeNote(v:Core):void {const text=$(v.root,'.ak-message').textContent;if(text&&(text===v.tree?.note||text===v.treeGroupNote))v.message('');}
/** Say once per change that the tree column collapses while groups are active. */
export function noteTreeGroups(v:Core):void {
  const hidden=!!v.tree&&v.visibility.tree&&v.grouped;
  if(hidden&&!v.treeGroupShown)v.message(v.treeGroupNote);
  else if(!hidden&&v.treeGroupShown&&$(v.root,'.ak-message').textContent===v.treeGroupNote)v.message('');
  v.treeGroupShown=hidden;
}
export function bindTree(v:Core, layout:TreeLayout):BoundTree {
  const rows=v.a!.rows,match=matchLeaves(layout,rows),treePos=new Int32Array(rows.length).fill(-1);let rank=0;
  layout.nodes.forEach((node,k)=>{if(node.children.length)return;if(match.leafRow[k]>=0)treePos[match.leafRow[k]]=rank;rank++;});
  const notes=[match.unmatchedLeaves.length?`${match.unmatchedLeaves.length} tree leaves match no sequence (${match.unmatchedLeaves.slice(0,3).map(name=>name||'unnamed').join(', ')}${match.unmatchedLeaves.length>3?', …':''}).`:'',match.unmatchedRows?`${match.unmatchedRows} sequences have no leaf in the tree.`:''].filter(Boolean);
  const note=notes.length?`Tree: ${notes.join(' ')}`:'';if(note)v.message(note);
  return {layout,leafRow:match.leafRow,treePos,note};
}
export function selectClade(v:Core, node:number,add=false):void {
  const tree=v.tree;if(!tree||!v.a)return;const visible=new Set(v.filteredRows);if(v.pinned)visible.delete(v.reference);if(!add)v.selectedRows.clear();
  for(const leaf of leavesUnder(tree.layout,node)){const row=tree.leafRow[leaf];if(row>=0&&visible.has(row))v.selectedRows.add(v.a.rows[row].id);}
  v.labelKey='';v.inspectorDirty=true;v.schedule();$(v.root,'.ak-live').textContent=`${v.selectedRows.size} sequences selected from the tree`;
}
