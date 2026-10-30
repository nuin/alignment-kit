import type { Core, On } from './core';
import { bindPointer } from './pointer';
import { bindKeys } from './keys';
import { bindForms } from './forms';
import { bindLabels } from './labels';
import { bindTooltip } from './tooltip';
import { bindHints } from './hints';
import { $ } from '../controls';

export function bind(v:Core):void {
  const signal=v.controller.signal,on:On=(target,event,handler)=>target.addEventListener(event,handler,{signal});
  on(v.root,'paste',(event:ClipboardEvent)=>{
    const target=event.target as HTMLElement|null;
    if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
    const text=event.clipboardData?.getData('text/plain');if(!text?.trim())return;
    event.preventDefault();void v.load(text,{name:'Pasted alignment'}).catch(()=>{});
  });
  on(v.root,'click',(event:MouseEvent)=>{
    const target=event.target as HTMLElement,button=target.closest<HTMLElement>('[data-action],[data-tab],[data-row],[data-pin],[data-feature],[data-hit],[data-group],[data-hide],[data-strand]');if(!button)return;
    if(button.dataset.hit)v.goToHit(Number(button.dataset.hit));
    if(button.dataset.action)void v.action(button.dataset.action);
    if(button.dataset.tab){v.tab=button.dataset.tab;v.inspectorDirty=true;v.schedule();}
    if(button.dataset.pin)v.setReference(button.dataset.pin);
    if(button.dataset.group!==undefined)v.toggleGroup(button.dataset.group);
    if(button.dataset.hide)v.hideRows([button.dataset.hide]);
    if(button.dataset.strand)v.setRowStrand(button.dataset.strand,v.rowStrands.has(button.dataset.strand)?'+':'-');
    if(button.dataset.row)v.setSelection({start:v.selection?.start??1,end:v.selection?.end??1,rowId:button.dataset.row},false);
    if(button.dataset.feature){const feature=v.filteredAnnotations.visible[Number(button.dataset.feature)];if(feature){if(feature.mapping==='mapped')v.setSelection({start:feature.start!,end:feature.end!,rowId:feature.rowId});v.emit('annotation',feature);v.message(`${feature.label}: ${feature.mapping==='mapped'?`alignment columns ${feature.start}–${feature.end}`:'no protein mapping'}. ${JSON.stringify(feature.metadata??{})}`);}}
  });
  bindTooltip(v,on);bindHints(v,on);bindPointer(v,on);bindLabels(v,on);bindForms(v,on);bindKeys(v,on);
  const full=()=>{const on=document.fullscreenElement===v.root,b=$(v.root,'[data-action="fullscreen"]');b.setAttribute('aria-pressed',String(on));b.lastElementChild!.textContent=on?'Exit full screen':'Full screen';};
  on(document,'fullscreenchange',full);
  on(v.root,'keydown',(event:KeyboardEvent)=>{
    if(event.key.toLowerCase()!=='f'||event.ctrlKey||event.metaKey||event.altKey||!v.visibility.fullscreen||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
    event.preventDefault();void v.action('fullscreen');
  });
  on(v.root,'dragover',(event:DragEvent)=>event.preventDefault());on(v.root,'drop',(event:DragEvent)=>{event.preventDefault();const file=event.dataTransfer?.files[0];if(file)void v.openFile(file);});
}
