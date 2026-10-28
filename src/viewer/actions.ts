import type { Alignment, Identity } from '../types';
import { $ } from '../controls';
import { type Core } from './core';
const cell=(tag:'th'|'td',text:string,title?:string)=>{const node=document.createElement(tag);node.textContent=text;if(title)node.title=title;return node;};
/** Pairwise identity table built from DOM nodes, so sequence names are never parsed as markup. */
function identityMatrix(a:Alignment,rows:number[],matrix:Identity[][]):HTMLElement {
  const table=document.createElement('table'),wrap=document.createElement('div');wrap.className='ak-matrix-scroll';
  table.createCaption().textContent='Identity over canonical comparable positions';
  table.createTHead().insertRow().append(cell('th','Sequence'),...rows.map(i=>cell('th',a.rows[i].name)));
  const body=table.createTBody();
  rows.forEach((row,i)=>body.insertRow().append(cell('th',a.rows[row].name),...matrix[i].map(c=>cell('td',c.identity===null?'NA':(c.identity*100).toFixed(1)+'%',`${c.matches} matches / ${c.compared} compared`))));
  wrap.append(table);return wrap;
}
export async function action(v:Core, action:string):Promise<void> {
  try {
    if(action==='close-fasta-options'){v.fastaPanel(false);return;}
    if(action==='alphabet-switch'){const next=v.pendingAlphabet;v.pendingAlphabet=undefined;v.message('');if(next&&v.a)v.applyAlphabet(next);return;}
    if(action==='alphabet-cancel'){v.message('');return;}
    if(action==='open'){$<HTMLInputElement>(v.root,'.ak-file').click();return;}
    if(action==='zoom-in')v.zoom(v.options.cellWidth+2);
    if(action==='zoom-out')v.zoom(v.options.cellWidth-2);
    if(action==='fit'&&v.a)v.zoom(Math.max(3,Math.floor((v.scroll.clientWidth-v.gutter)/v.columns.count)));
    if(action==='theme')v.setOptions({theme:v.options.theme==='light'?'dark':'light'});
    if(action==='inspect')v.setOptions({showInspector:!v.options.showInspector});
    if(action==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else if(v.root.requestFullscreen)await v.root.requestFullscreen();else v.message('Full screen is unavailable in this browser.');}
    if(action==='reference-info'&&v.a)v.setSelection({start:v.selection?.start??1,end:v.selection?.end??1,rowId:v.a.rows[v.reference].id},false);
    if(action==='pin-selected'&&v.selection?.rowId)v.setReference(v.selection.rowId);
    if(action==='toggle-row-features'&&v.selection?.rowId){const ids=new Set(v.annotationFilter.hiddenRowIds??[]),id=v.selection.rowId;if(ids.has(id))ids.delete(id);else ids.add(id);v.setAnnotationFilter({...v.annotationFilter,hiddenRowIds:[...ids]});}
    if(action==='features-prev'){v.featurePage=Math.max(0,v.featurePage-1);v.inspectorDirty=true;v.schedule();}
    if(action==='features-next'){v.featurePage++;v.inspectorDirty=true;v.schedule();}
    if(action==='summary-prev'){v.summaryPage=Math.max(0,v.summaryPage-1);v.inspectorDirty=true;v.schedule();}
    if(action==='summary-next'){v.summaryPage++;v.inspectorDirty=true;v.schedule();}
    if(action==='export-variants')await v.export('variants');
    if(action==='show-hidden')v.showRows();
    if(action==='hide-columns'){const sel=v.selection;if(!sel){v.message('Select columns first, then hide them.');return;}v.hideColumns(sel.start,sel.end);v.setSelection(null,false);}
    if(action==='show-columns')v.showColumns();
    if(action==='clear-rows'){v.selectedRows.clear();v.labelKey='';v.inspectorDirty=true;v.schedule();}
    if(action==='compare'&&v.a){const ids=new Map(v.a.rows.map((r,i)=>[r.id,i])),rows=[...v.selectedRows].map(id=>ids.get(id)!);const a=v.a,revision=v.revision,selectionKey=[...v.selectedRows].join(',');v.message('Calculating pairwise identity…');const matrix=await v.comparison.pairwise(a,rows);if(v.disposed||v.revision!==revision)return;v.message('');if(v.tab!=='compare'||selectionKey!==[...v.selectedRows].join(','))return;const target=$(v.inspector,'.ak-identity-result');target.replaceChildren(identityMatrix(a,rows,matrix));}
    if(action==='motif'||action==='motif-prev'){
      const started=await v.findMotif($<HTMLInputElement>(v.root,'[aria-label="Find motif"]').value,action==='motif'?1:-1);
      if(started&&v.visibility.hitsTab){v.tab='hits';v.inspectorDirty=true;v.schedule();}
    }
  }catch(error){v.error(error);}
}
