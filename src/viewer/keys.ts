
import type { Core, On } from './core';
export function bindKeys(v:Core,on:On):void {
  on(v.scroll,'keydown',(event:KeyboardEvent)=>{
    if(!v.a)return;const key=event.key,start=v.selection?.start??v.firstColumn()+1;
    if(['+','=','-','_'].includes(key)){event.preventDefault();v.zoom(v.options.cellWidth+(key==='+'||key==='='?2:-2));return;}
    if(key==='Escape'){v.setSelection(null);return;}
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&(key.toLowerCase()==='c'||event.code==='KeyC')&&!v.root.ownerDocument.getSelection()?.toString()){event.preventDefault();void v.copySelection().catch(()=>{});return;}
    if(['ArrowLeft','ArrowRight','Home','End','ArrowUp','ArrowDown'].includes(key)){
      event.preventDefault();let column=start,rowId=v.selection?.rowId;
      if(key==='ArrowLeft')column=v.stepColumn(start,-1);if(key==='ArrowRight')column=v.stepColumn(event.shiftKey?v.selection?.end??start:start,1);if(key==='Home')column=v.columns.cols[0]+1;if(key==='End')column=v.columns.cols[v.columns.count-1]+1;
      if(key==='ArrowDown'||key==='ArrowUp'){const index=rowId?v.rowPos[v.a.rows.findIndex(r=>r.id===rowId)]:Math.floor(v.scroll.scrollTop/v.options.rowHeight),row=v.stepRow(index,key==='ArrowDown'?1:-1)??(rowId?undefined:v.stepRow(index-1,1));if(row!==undefined)rowId=v.a.rows[row].id;}
      v.setSelection({start:event.shiftKey?Math.min(start,column):column,end:event.shiftKey?Math.max(v.selection?.end??start,column):column,rowId});
    }
  });
}
