import { trackLayout } from '../visibility';
import { type Selection } from '../types';
import { type TreeHit } from '../renderer';
import { $ } from '../controls';
import { trackHeight } from '../tracks';

import type { Core, On } from './core';
import { bounded } from './core';
export function bindPointer(v:Core,on:On):void {
  on(v.scroll,'scroll',()=>v.schedule());
  // A plain click on the only selected column (and the same row, if any) clears the selection.
  const pick=(s:Selection|null,shift:boolean)=>{if(!s)return;const c=v.selection;
    if(!shift&&c&&c.start===s.start&&c.end===s.end&&c.rowId===s.rowId){v.setSelection(null,false);return;}
    if(shift&&c){s.start=Math.min(c.start,s.start);s.end=Math.max(c.end,s.end);}v.setSelection(s,false);};
  let pan:{id:number;x:number;y:number;left:number;top:number;moved:boolean}|undefined,panned=false;
  on(v.scroll,'pointerdown',(event:PointerEvent)=>{
    panned=false;if(!v.options.dragToPan||event.button!==0||!v.a||event.clientX-v.scroll.getBoundingClientRect().left<v.gutter)return;
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,left:v.scroll.scrollLeft,top:v.scroll.scrollTop,moved:false};
  });
  on(v.scroll,'pointermove',(event:PointerEvent)=>{
    if(!pan||event.pointerId!==pan.id)return;const dx=event.clientX-pan.x,dy=event.clientY-pan.y;
    if(!pan.moved){if(Math.hypot(dx,dy)<4)return;pan.moved=true;v.scroll.setPointerCapture?.(pan.id);v.root.dataset.panning='true';}
    v.scroll.scrollLeft=pan.left-dx;v.scroll.scrollTop=pan.top-dy;v.schedule();
  });
  const endPan=(event:PointerEvent)=>{if(!pan||event.pointerId!==pan.id)return;panned=pan.moved;pan=undefined;delete v.root.dataset.panning;};
  on(v.scroll,'pointerup',endPan);on(v.scroll,'pointercancel',endPan);
  on(v.scroll,'click',(event:MouseEvent)=>{if(panned){panned=false;return;}const item=v.itemAt(event);if(item!==undefined&&item<0){v.toggleGroup(v.groupList[-item-1].name);return;}pick(v.eventAt(event),event.shiftKey);});
  on($(v.root,'.ak-tracks'),'click',(event:MouseEvent)=>{
    if(!v.a||(event.target as HTMLElement).closest('button,[data-action]'))return;
    const tracks=$(v.root,'.ak-tracks'),rect=tracks.getBoundingClientRect(),y=event.clientY-rect.top+tracks.scrollTop,x=event.clientX-rect.left-v.gutter,d=Math.floor((x+v.scroll.scrollLeft)/v.options.cellWidth);
    if(x<0||d<0||d>=v.columns.count)return;const column=v.columns.cols[d]+1;
    const ref=trackLayout(v.visibility,v.options.rowHeight,v.drawnTracks().map(t=>({height:trackHeight(t)})),v.a.alphabet).offsets.reference,onRef=ref!==null&&y>=ref&&y<ref+v.options.rowHeight;
    pick({start:column,end:column,...(onRef?{rowId:v.a.rows[v.reference].id}:{})},event.shiftKey);
  });
  const treeCanvas=$<HTMLCanvasElement>(v.root,'.ak-tree-canvas');
  on(treeCanvas,'click',(event:MouseEvent)=>{const rect=treeCanvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;let best:TreeHit|undefined,near=49;for(const hit of v.treeHits){const d=(hit.x-x)**2+(hit.y-y)**2;if(d<=near){near=d;best=hit;}}if(best)v.selectClade(best.node,event.shiftKey);});
  on(treeCanvas,'wheel',(event:WheelEvent)=>{event.preventDefault();v.scroll.scrollTop+=event.deltaY;});
  const overview=$(v.root,'.ak-overview');let dragging=false;
  const navigate=(event:PointerEvent)=>{if(!v.a)return;const rect=overview.getBoundingClientRect(),ratio=bounded((event.clientX-rect.left)/rect.width,0,1);v.scroll.scrollLeft=ratio*v.columns.count*v.options.cellWidth-(v.scroll.clientWidth-v.gutter)/2;v.schedule();};
  on(overview,'pointerdown',(event:PointerEvent)=>{dragging=true;overview.setPointerCapture(event.pointerId);navigate(event);});on(overview,'pointermove',(event:PointerEvent)=>{if(dragging)navigate(event);});on(overview,'pointerup',()=>{dragging=false;});
  on(overview,'keydown',(event:KeyboardEvent)=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();v.scroll.scrollLeft+=(event.key==='ArrowRight'?1:-1)*v.options.cellWidth*10;v.schedule();}});
  const separator=$(v.root,'.ak-gutter-resize');let resizing=false,origin=0,gutter=0;
  on(separator,'pointerdown',(event:PointerEvent)=>{resizing=true;origin=event.clientX;gutter=v.options.labelWidth;separator.setPointerCapture(event.pointerId);});on(separator,'pointermove',(event:PointerEvent)=>{if(resizing)v.setOptions({labelWidth:gutter+event.clientX-origin});});on(separator,'pointerup',()=>{resizing=false;});
  on(separator,'keydown',(event:KeyboardEvent)=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();v.setOptions({labelWidth:v.options.labelWidth+(event.key==='ArrowRight'?10:-10)});}});
}
