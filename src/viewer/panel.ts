import { renderInspector } from '../inspector';
import { isMarked } from '../marks';
import { isVariant } from '../variants';
import type { Core } from './core';
import { panelSummary } from './summary';

/** Redraw the inspector tab for the current selection and sync the tab buttons. */
export function renderPanel(v:Core):void {
  const a=v.a;if(!a)return;
  v.inspectorDirty=false;const summary=v.tab==='summary'?panelSummary(v):undefined;if(v.tab)renderInspector(v.inspector,{summary:summary&&{block:summary.block,data:summary.entry?.data,error:summary.error??summary.entry?.error,page:v.summaryPage},a,stats:v.stats,selection:v.selection,scheme:v.options.colorScheme,reference:v.reference,selectedRows:v.selectedRows,annotations:v.filteredAnnotations.visible,annotationFilter:v.annotationFilter,unknown:v.filteredAnnotations.unknown,excluded:v.filteredAnnotations.excluded,tab:v.tab,page:v.featurePage,marked:!!v.selection&&isMarked(v.columnMarks,v.selection.start,v.selection.end),scope:v.options.statisticsScope,hits:v.searchState?.result.hits??[],truncated:v.searchState?.result.truncated??false,pattern:v.searchState?.pattern??'',hit:v.searchState?.cursor??-1,reverse:v.reversed,variants:v.tab==='legend'&&a.annotations.some(isVariant),strands:v.rowStrands,identity:v.selection?.rowId?v.identityDetails?.[a.rows.findIndex(r=>r.id===v.selection!.rowId)]:undefined});for(const button of v.root.querySelectorAll<HTMLButtonElement>('[data-tab]'))button.setAttribute('aria-pressed',String(button.dataset.tab===v.tab));v.menus.sync();
}
