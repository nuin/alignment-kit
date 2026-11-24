import type { Core, On } from './core';
import type { Alignment } from '../types';
import { $ } from '../controls';
import { rowOffset, isGap } from '../model';
import { displayCode } from '../strand';

interface ActiveCell {a:Alignment;row:number;column:number;position:number;selected:boolean;reverse:boolean;strand:boolean}
const activeCells=new WeakMap<Core,ActiveCell>();

function residueCount(a:Alignment,row:number,column:number,previous?:ActiveCell):number {
  const start=previous?.column??0,offset=row*a.width;let count=previous?.position??0;
  const direction=column>=start?1:-1;
  for(let c=Math.min(start,column);c<Math.max(start,column);c++)if(!isGap(a.codes[offset+c]))count+=direction;
  return count;
}

export function syncAccessibleCell(v:Core):void {
  const a=v.a,cell=$(v.root,'.ak-active-cell'),parent=cell.parentElement!;
  if(!a){activeCells.delete(v);cell.textContent='';cell.removeAttribute('aria-label');parent.hidden=true;v.scroll.removeAttribute('aria-activedescendant');v.scroll.removeAttribute('aria-rowcount');v.scroll.removeAttribute('aria-colcount');return;}
  const previous=activeCells.get(v),selected=!!v.selection,rowId=v.selection?.rowId??a.rows[v.reference].id;
  const found=previous?.a===a&&a.rows[previous.row].id===rowId?previous.row:a.rows.findIndex(row=>row.id===rowId);
  const row=found<0?v.reference:found,column=v.selection?.start??v.firstColumn()+1,reverse=v.reversed,strand=v.rowStrands.has(a.rows[row].id);
  if(!Number.isInteger(column)||column<1||column>a.width){activeCells.delete(v);parent.hidden=true;v.scroll.removeAttribute('aria-activedescendant');return;}
  const sameRow=previous?.a===a&&previous.row===row;
  if(sameRow&&previous.column===column&&previous.selected===selected&&previous.reverse===reverse&&previous.strand===strand)return;
  parent.hidden=false;parent.setAttribute('aria-rowindex',String(row+1));
  const code=a.codes[row*a.width+column-1],position=residueCount(a,row,column,sameRow?previous:undefined);
  const symbol=String.fromCharCode(displayCode(a.alphabet,code,reverse,strand));
  const label=`${a.rows[row].name}, Column ${column}, ${isGap(code)?'gap':`residue ${symbol}, sequence position ${position+rowOffset(a.rows[row])-1}`}`;
  cell.textContent=label;cell.setAttribute('aria-label',label);
  cell.setAttribute('aria-colindex',String(column));cell.setAttribute('aria-selected',String(selected));
  v.scroll.setAttribute('aria-activedescendant',cell.id);
  activeCells.set(v,{a,row,column,position,selected,reverse,strand});
}

/** Mark the active inspector tab: one tab stop for the list, and the panel named by its tab. */
export function syncTabs(v:Core):void {
  const panel=$(v.root,'.ak-inspector-content');
  for(const tab of v.root.querySelectorAll<HTMLElement>('.ak-tabs [role=tab]')){const on=tab.dataset.tab===v.tab;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;if(on)panel.setAttribute('aria-labelledby',tab.id);}
}
const darkQuery=(root:HTMLElement)=>root.ownerDocument.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
/** Pressed state of the theme and inspector toggles, and the message role, follow the root attributes that setOptions and message() write, so API changes are reflected too. */
function syncState(v:Core):void {
  const theme=v.root.dataset.theme,message=$(v.root,'.ak-message');
  $(v.root,'[data-action="theme"]').setAttribute('aria-pressed',String(theme==='dark'||(theme==='auto'&&!!darkQuery(v.root)?.matches)));
  $(v.root,'[data-action="inspect"]').setAttribute('aria-pressed',String(v.root.dataset.inspector==='true'));
  message.setAttribute('role',message.dataset.error==='true'?'alert':'status');
}
export function bindAccessibility(v:Core,on:On):void {
  const sync=()=>syncState(v),signal=v.controller.signal;sync();
  if(typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(sync);
    observer.observe(v.root,{attributes:true,attributeFilter:['data-theme','data-inspector']});
    observer.observe($(v.root,'.ak-message'),{attributes:true,attributeFilter:['data-error']});
    signal.addEventListener('abort',()=>observer.disconnect());
  }
  darkQuery(v.root)?.addEventListener?.('change',sync,{signal});
  on(v.root,'click',(event:MouseEvent)=>{
    const toggle=(event.target as Element|null)?.closest?.<HTMLElement>('.ak-more-toggle');if(!toggle)return;
    const panel=$(v.root,'.ak-more'),open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));v.menus.close();
  });
  on(v.root,'keydown',(event:KeyboardEvent)=>{
    const tab=(event.target as Element|null)?.closest?.<HTMLElement>('.ak-tabs [role=tab]');
    if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;
    const tabs=[...v.root.querySelectorAll<HTMLElement>('.ak-tabs [role=tab]')].filter(t=>!t.hidden),i=tabs.indexOf(tab);if(i<0)return;
    const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
    event.preventDefault();v.tab=next.dataset.tab!;v.inspectorDirty=true;syncTabs(v);next.focus();v.schedule();
  });
}
