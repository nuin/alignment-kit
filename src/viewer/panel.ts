import { renderInspector } from '../inspector';
import type { Core } from './core';

/** Redraw the inspector tab for the current selection and sync the tab buttons. */
export function renderPanel(v:Core):void {
  const a=v.a;if(!a)return;
  v.inspectorDirty=false;if(v.tab)renderInspector(v.inspector,{a,stats:v.stats,selection:v.selection,scheme:v.options.colorScheme,reference:v.reference,selectedRows:v.selectedRows,annotations:v.filteredAnnotations.visible,annotationFilter:v.annotationFilter,unknown:v.filteredAnnotations.unknown,excluded:v.filteredAnnotations.excluded,tab:v.tab,page:v.featurePage,scope:v.options.statisticsScope,hits:v.searchState?.result.hits??[],truncated:v.searchState?.result.truncated??false,pattern:v.searchState?.pattern??'',hit:v.searchState?.cursor??-1,identity:v.selection?.rowId?v.identityDetails?.[a.rows.findIndex(r=>r.id===v.selection!.rowId)]:undefined});for(const button of v.root.querySelectorAll<HTMLButtonElement>('[data-tab]'))button.setAttribute('aria-pressed',String(button.dataset.tab===v.tab));v.menus.sync();
}
