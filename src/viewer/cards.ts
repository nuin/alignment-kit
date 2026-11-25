import type {Annotation,Selection} from '../types';
import {renderVariantCard,renderVariantDetails} from '../variant-cards';
import {variantCardItems,variantLayout,selectVariant} from './variants';
import {$} from '../controls';
import type {Core} from './core';

const PAGE_SIZE=20;
interface CardState {items:Annotation[];page:number;collapsed:boolean;dirty:boolean;reveal?:boolean;unmapped?:string;active?:string;selection:Selection|null;cursor?:string;renderedPage?:number;detail?:Annotation}
const states=new WeakMap<Core,CardState>();
function state(v:Core):CardState {
  let s=states.get(v);if(!s){s={items:[],page:0,collapsed:false,dirty:true,selection:null};states.set(v,s);}return s;
}
function selected(v:Core,items:Annotation[]):string|undefined {
  const s=v.selection;if(!s)return;
  const matches=(n:Annotation)=>n.mapping==='mapped'&&n.start===s.start&&n.end===s.end&&(n.rowId??undefined)===s.rowId;
  return (items.find(n=>n.id===v.variantCursor&&matches(n))??items.find(matches))?.id;
}
function renderPage(v:Core,s:CardState,list:HTMLElement):void {
  const existing=new Map([...list.querySelectorAll<HTMLButtonElement>('[data-variant-card]')].map(b=>[b.dataset.variantCard,b]));
  const focused=(list.getRootNode() as Document|ShadowRoot).activeElement,offset=s.page*PAGE_SIZE;
  const buttons=s.items.slice(offset,offset+PAGE_SIZE).map((n,i)=>{const b=existing.get(n.id)??list.ownerDocument.createElement('button');renderVariantCard(b,v.a!,n,offset+i);return b;});
  list.replaceChildren(...buttons);
  if(buttons.some(b=>b===focused))(focused as HTMLButtonElement).focus({preventScroll:true});
  s.renderedPage=s.page;
}
function syncDetails(v:Core,s:CardState):void {
  const n=s.unmapped?s.items.find(n=>n.id===s.unmapped):undefined;
  const details=$(v.root,'.ak-variant-details');details.hidden=!n;
  if(n!==s.detail){s.detail=n;const body=$(details,'.ak-variant-details-body');if(n)renderVariantDetails(body,n);else body.replaceChildren();}
}
export function syncVariantCards(v:Core):void {
  const s=state(v),items=variantCardItems(v),changed=items!==s.items;
  const selectionChanged=v.selection!==s.selection||v.variantCursor!==s.cursor;
  if(!changed&&!selectionChanged&&!s.dirty)return;s.dirty=false;
  if(selectionChanged){s.unmapped=undefined;s.selection=v.selection;s.cursor=v.variantCursor;}
  const active=s.unmapped??selected(v,items),activeChanged=active!==s.active;
  const index=items.findIndex(n=>n.id===active),moved=changed&&index!==s.items.findIndex(n=>n.id===active);
  const reveal=activeChanged||moved||s.reveal;s.reveal=false;
  if(reveal&&index>=0)s.page=Math.floor(index/PAGE_SIZE);
  s.active=active;s.items=items;s.page=Math.min(s.page,Math.max(0,Math.ceil(items.length/PAGE_SIZE)-1));
  const strip=$(v.root,'.ak-variant-cards'),total=variantLayout(v).cardTotal;
  strip.dataset.empty=String(!total);strip.hidden=!total||!v.visibility.variantCards;
  const list=$(strip,'.ak-variant-card-list');
  $(strip,'.ak-variant-cards-content').hidden=s.collapsed;
  if(changed||s.renderedPage!==s.page)renderPage(v,s,list);
  for(const b of list.querySelectorAll<HTMLButtonElement>('[data-variant-card]')){
    const on=b.dataset.variantCard===active;b.setAttribute('aria-pressed',String(on));
    if(on&&reveal&&!s.collapsed){if(b.offsetLeft<list.scrollLeft)list.scrollLeft=b.offsetLeft;else if(b.offsetLeft+b.offsetWidth>list.scrollLeft+list.clientWidth)list.scrollLeft=b.offsetLeft+b.offsetWidth-list.clientWidth;}
  }
  if(changed){const mapped=items.filter(n=>n.mapping==='mapped').length;$(strip,'.ak-variant-cards-count').textContent=`${items.length===total?total:`${items.length} of ${total}`} variants · ${mapped} mapped${items.length>mapped?` · ${items.length-mapped} unmapped`:''}`;}
  $(strip,'.ak-variant-cards-empty').hidden=!!items.length;
  const toggle=$(strip,'[data-action="variant-cards-toggle"]');toggle.setAttribute('aria-expanded',String(!s.collapsed));$(toggle,'span').textContent=s.collapsed?'▸':'▾';
  $(strip,'.ak-variant-cards-pages').hidden=s.collapsed||items.length<=PAGE_SIZE;
  $(strip,'output').textContent=`${s.page+1} / ${Math.max(1,Math.ceil(items.length/PAGE_SIZE))}`;
  $<HTMLButtonElement>(strip,'[data-action="variant-cards-prev"]').disabled=s.page===0;
  $<HTMLButtonElement>(strip,'[data-action="variant-cards-next"]').disabled=(s.page+1)*PAGE_SIZE>=items.length;
  syncDetails(v,s);
}
export function selectVariantCard(v:Core,id:string):void {
  const n=variantCardItems(v).find(n=>n.id===id);if(!n)return;
  const s=state(v);
  if(n.mapping==='mapped'){
    s.unmapped=undefined;selectVariant(v,n);v.tab='position';v.setOptions({showInspector:true});
  }else{s.unmapped=id;s.selection=v.selection;s.cursor=v.variantCursor;s.dirty=true;v.layout();}
  v.emit('annotation',n);v.schedule();
}
export function variantCardsAction(v:Core,action:string):boolean {
  const s=state(v);
  if(action==='variant-cards-toggle'){s.collapsed=!s.collapsed;s.reveal=!s.collapsed;}
  else if(action==='variant-cards-prev')s.page=Math.max(0,s.page-1);
  else if(action==='variant-cards-next')s.page++;
  else if(action==='variant-cards-close'){
    for(const b of v.root.querySelectorAll<HTMLButtonElement>('[data-variant-card]'))if(b.dataset.variantCard===s.unmapped)b.focus({preventScroll:true});
    s.unmapped=undefined;
  }
  else return false;
  s.dirty=true;v.layout();return true;
}
