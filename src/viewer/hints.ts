import type { Core, On } from './core';

const DELAY=400;
let count=0;
/** Hints for icon-only controls marked with `data-hint`: shown after a hover delay or on keyboard focus, placed in the viewer root so the label column cannot clip them. */
export function bindHints(v:Core,on:On):void {
  const id=`ak-hint-${++count}`;
  let tip:HTMLElement|undefined,target:HTMLElement|undefined,pending:HTMLElement|undefined,timer:ReturnType<typeof setTimeout>|undefined,keyboard=false;
  const hide=()=>{clearTimeout(timer);timer=undefined;pending=undefined;target?.removeAttribute('aria-describedby');tip?.remove();tip=target=undefined;};
  const show=(el:HTMLElement)=>{
    hide();const text=el.dataset.hint;if(!text||!el.isConnected||!v.visibility.tooltip)return;
    target=el;tip=document.createElement('div');tip.className='ak-hint';tip.id=id;tip.setAttribute('role','tooltip');tip.textContent=text;v.root.append(tip);el.setAttribute('aria-describedby',id);
    const r=v.root.getBoundingClientRect(),t=el.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
    const left=Math.max(4,Math.min(t.left-r.left+t.width/2-w/2,r.width-w-4));let top=t.bottom-r.top+6;if(top+h>r.height-4)top=t.top-r.top-h-6;
    tip.style.left=left+'px';tip.style.top=top+'px';
  };
  const hinted=(event:Event)=>(event.target as Element|null)?.closest?.<HTMLElement>('[data-hint]')??undefined;
  on(v.root,'pointerover',(event:PointerEvent)=>{
    if(event.pointerType==='touch')return;const el=hinted(event);if(el&&el===(target??pending))return;
    hide();if(el){pending=el;timer=setTimeout(()=>show(el),DELAY);}
  });
  on(v.root,'pointerleave',hide);on(v.root,'pointerdown',()=>{keyboard=false;hide();});on(v.root,'wheel',hide);
  on(v.root,'keydown',(event:KeyboardEvent)=>{keyboard=true;if(event.key==='Escape'&&tip)hide();});
  on(v.root,'focusin',(event:FocusEvent)=>{const el=hinted(event);if(el&&keyboard)show(el);else if(target&&target!==el)hide();});
  on(v.root,'focusout',(event:FocusEvent)=>{if(event.target===target)hide();});
  v.controller.signal.addEventListener('abort',hide);
}
