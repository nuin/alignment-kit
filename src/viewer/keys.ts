import { nextVariant } from './variants';
import { bindAccessibility } from './accessibility';

import type { Core, On } from './core';
/** True when the user has text selected. A shadow root has its own selection in Chromium; elsewhere the document selection covers it. */
const textSelected=(root:HTMLElement)=>{const scope=root.getRootNode() as (Document|ShadowRoot)&{getSelection?:()=>Selection|null};return !!(scope.getSelection?.()??root.ownerDocument.getSelection())?.toString();};
export function bindKeys(v:Core,on:On):void {
  on(v.scroll,'keydown',(event:KeyboardEvent)=>{
    if(!v.a)return;const key=event.key,start=v.selection?.start??v.firstColumn()+1;
    if(['+','=','-','_'].includes(key)){event.preventDefault();v.zoom(v.options.cellWidth+(key==='+'||key==='='?2:-2));return;}
    if(key==='Escape'){v.setSelection(null);return;}
    if((key===']'||key==='[')&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();nextVariant(v,key===']'?1:-1);return;}
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&(key.toLowerCase()==='c'||event.code==='KeyC')&&!textSelected(v.root)){event.preventDefault();void v.copySelection().catch(()=>{});return;}
    if(['ArrowLeft','ArrowRight','Home','End','ArrowUp','ArrowDown','PageUp','PageDown'].includes(key)){
      event.preventDefault();let column=start,rowId=v.selection?.rowId;
      const tail=v.selection?.end??start,flipped=!!v.columns.reversed,edge=(key==='Home'||key==='End')&&(event.ctrlKey||event.metaKey);
      if(key==='ArrowLeft')column=v.stepColumn(flipped&&event.shiftKey?tail:start,-1);if(key==='ArrowRight')column=v.stepColumn(!flipped&&event.shiftKey?tail:start,1);
      if(key==='Home'&&!edge)column=v.columns.cols[0]+1;if(key==='End'&&!edge)column=v.columns.cols[v.columns.count-1]+1;
      if(edge){const row=key==='Home'?v.stepRow(-1,1):v.stepRow(v.rows.length,-1);if(row!==undefined)rowId=v.a.rows[row].id;}
      if(key==='ArrowDown'||key==='ArrowUp'){const index=rowId?v.rowPos[v.a.rows.findIndex(r=>r.id===rowId)]:Math.floor(v.scroll.scrollTop/v.options.rowHeight),row=v.stepRow(index,key==='ArrowDown'?1:-1)??(rowId?undefined:v.stepRow(index-1,1));if(row!==undefined)rowId=v.a.rows[row].id;}
      if(key==='PageDown'||key==='PageUp'){
        const step=key==='PageDown'?1:-1,page=Math.max(1,Math.floor(v.scroll.clientHeight/v.options.rowHeight)),index=rowId?v.rowPos[v.a.rows.findIndex(r=>r.id===rowId)]:Math.floor(v.scroll.scrollTop/v.options.rowHeight);
        const target=Math.max(0,Math.min(v.rows.length-1,index+step*page)),row=v.stepRow(target-step,step)??v.stepRow(target,-step);if(row!==undefined)rowId=v.a.rows[row].id;
      }
      v.setSelection({start:event.shiftKey?Math.min(start,column):column,end:event.shiftKey?Math.max(v.selection?.end??start,column):column,rowId});
    }
  });
  bindAccessibility(v,on);
}
