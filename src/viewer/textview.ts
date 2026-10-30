import type { Core } from './core';
import { formatTextView, TEXT_CELL_LIMIT } from '../textview';
import { $ } from '../controls';
import { getVisibleRows } from './data';

const cache=new WeakMap<Core,unknown[]>();
/** Show or hide the text panel and rewrite its text when the rows, columns or strands shown in the grid change. */
export function syncText(v:Core):void {
  const on=v.options.textView&&!!v.a,pre=$<HTMLPreElement>(v.root,'.ak-text'),note=$(v.root,'.ak-text-note');
  v.root.dataset.view=on?'text':'grid';$(v.root,'[data-action="text-view"]').setAttribute('aria-pressed',String(on));pre.hidden=!on;
  if(!on){note.hidden=true;return;}
  const a=v.a!,ids=getVisibleRows(v),strands=[...v.rowStrands].join(','),key=[a,ids.join('\n'),v.columns,v.reversed,strands],old=cache.get(v);
  if(old&&old.every((x,i)=>x===key[i]))return;cache.set(v,key);
  const index=new Map(a.rows.map((r,i)=>[r.id,i])),rows=ids.map(id=>index.get(id)!),flagged=new Set(rows.filter(r=>v.rowStrands.has(a.rows[r].id)));
  const m=v.columns,t=formatTextView(a,{rows,columns:m.cols.subarray(0,m.count),reverse:v.reversed,flagged});
  pre.textContent=t.text||'No sequences are visible.';
  note.hidden=!t.omitted;note.textContent=t.omitted?`Text view shows ${t.rows.toLocaleString()} of ${rows.length.toLocaleString()} rows (up to ${TEXT_CELL_LIMIT.toLocaleString()} residues). Filter rows or hide columns to see the rest.`:'';
}
