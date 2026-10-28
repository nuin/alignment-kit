import { type ParseWarning } from '../types';
import { $ } from '../controls';
import { type Core } from './core';
export const warningsOf=(v:Core):ParseWarning[]=>(v.a?.metadata.warnings??[]).map(w=>({...w}));
/** Update the status-bar badge for the loaded alignment and, with `notify`, emit `warnings`. */
export function syncWarnings(v:Core, notify=true):void {
  const list=warningsOf(v),badge=$(v.root,'.ak-warnings');
  badge.dataset.empty=String(!list.length);badge.hidden=!list.length||!v.visibility.warnings;
  badge.textContent=`${list.length} warning${list.length===1?'':'s'}`;badge.title='Show parser warnings';
  if(notify)v.emit('warnings',list);
}
/** List the warnings in the message area, one per line with its code, row and line number. */
export function showWarnings(v:Core):void {
  const list=warningsOf(v),a=v.a;if(!a||!list.length){v.message('');return;}
  v.message(`${list.length} parser warning${list.length===1?'':'s'}`);
  const target=$(v.root,'.ak-message'),ul=document.createElement('ul'),close=document.createElement('button');
  for(const w of list){
    const li=document.createElement('li'),code=document.createElement('code'),name=w.rowId?a.rows.find(r=>r.id===w.rowId)?.name:undefined;
    code.textContent=w.code;li.append(code,` ${w.message}${w.line?` (line ${w.line})`:''}${name?` [${name}]`:''}`);ul.append(li);
  }
  close.type='button';close.dataset.action='warnings-close';close.textContent='Close';
  target.append(ul,close);target.dataset.list='true';target.hidden=false;
}
