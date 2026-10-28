import { columnToResidue } from '../model';
import { annotationDetails, annotationLink } from '../tooltip';
import type { Annotation, CellInfo, Selection } from '../types';
import type { Core, On } from './core';

const DELAY=300;
const el=(tag:string,text?:string,cls?:string):HTMLElement=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
/** Hover and pinned cards for residues and annotation marks. All text goes through textContent; links need an http(s) template from the annotationLinks option. */
export function bindTooltip(v:Core,on:On):void {
  let card:HTMLElement|undefined,timer:ReturnType<typeof setTimeout>|undefined,key='',pinned=false;
  const enabled=()=>v.options.tooltips&&v.visibility.tooltip;
  const hide=()=>{clearTimeout(timer);timer=undefined;card?.remove();card=undefined;pinned=false;};
  const cell=(s:Selection):CellInfo=>{const a=v.a!,row=a.rows.findIndex(r=>r.id===s.rowId),column=s.start;return {rowId:s.rowId!,column,residue:String.fromCharCode(a.codes[row*a.width+column-1]),position:columnToResidue(a,row,column)};};
  const annotations=(info:CellInfo):Annotation[]=>v.visibility.annotationMarks?[...v.annotationIndex.query(info.rowId,info.column,info.column),...v.annotationIndex.query('*',info.column,info.column)]:[];
  const line=(parent:HTMLElement,label:string,value:string)=>{const p=el('div',undefined,'ak-tip-line');p.append(el('span',label+' ','ak-tip-key'),el('span',value));parent.append(p);};
  const item=(text:string,href?:string)=>{if(!href)return el('span',text);const a=el('a',text) as HTMLAnchorElement;a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};
  const list=(parent:HTMLElement,label:string,values:{text:string;href?:string}[])=>{if(!values.length)return;const p=el('div',undefined,'ak-tip-line');p.append(el('span',label+' ','ak-tip-key'));values.forEach((x,i)=>{if(i)p.append(', ');p.append(item(x.text,x.href));});parent.append(p);};
  const build=(info:CellInfo,found:Annotation[],pin:boolean):HTMLElement=>{
    const a=v.a!,row=a.rows.findIndex(r=>r.id===info.rowId),links=v.options.annotationLinks,c=el('div',undefined,'ak-tooltip'),cap=pin?10:3;
    c.setAttribute('role',pin?'dialog':'tooltip');c.setAttribute('aria-label',pin?'Annotation details':'Residue details');c.dataset.pinned=String(pin);
    if(pin){const close=el('button','×','ak-tip-close') as HTMLButtonElement;close.type='button';close.setAttribute('aria-label','Close annotation details');close.addEventListener('click',event=>{event.stopPropagation();hide();});c.append(close);}
    c.append(el('div',a.rows[row].name,'ak-tip-title'));
    line(c,'Residue',info.residue==='-'?'gap':info.residue);line(c,'Column',String(info.column));line(c,'Position',info.position===null?'gap':String(info.position));
    if(v.options.rulerCoordinates==='reference'){const ref=columnToResidue(a,v.reference,info.column);if(ref!==null)line(c,'Reference residue',String(ref));}
    for(const n of found.slice(0,cap)){
      const box=el('div',undefined,'ak-tip-note'),d=annotationDetails(n),flags=[n.disease&&'disease',n.phenotype&&'phenotype'].filter(Boolean).join(', ');
      box.append(el('div',n.label,'ak-tip-title'));
      if(n.kind)line(box,'Kind',n.kind);if(n.consequence?.length)line(box,'Consequence',n.consequence.join(', '));if(flags)line(box,'Evidence of',flags);
      list(box,'Evidence codes',d.evidence.map(text=>({text,href:annotationLink(links,['evidence','eco'],text)})));
      list(box,'Source',d.source.map(text=>({text,href:annotationLink(links,[text],n.id)})));
      list(box,'PubMed',d.pubmed.map(text=>({text,href:/^\d+$/.test(text)?annotationLink(links,['pubmed','pmid'],text):undefined})));
      c.append(box);
    }
    if(found.length>cap)c.append(el('div',`and ${found.length-cap} more`,'ak-tip-more'));
    return c;
  };
  const place=(c:HTMLElement,x:number,y:number)=>{
    const rect=v.root.getBoundingClientRect();v.root.append(c);
    const w=c.offsetWidth,h=c.offsetHeight;let left=x-rect.left+12,top=y-rect.top+16;
    if(w&&left+w>rect.width-4)left=Math.max(4,x-rect.left-w-12);if(h&&top+h>rect.height-4)top=Math.max(4,y-rect.top-h-12);
    c.style.left=left+'px';c.style.top=top+'px';
  };
  const show=(info:CellInfo,x:number,y:number,pin:boolean)=>{const found=annotations(info);if(pin&&!found.length)return;card?.remove();card=build(info,found,pin);pinned=pin;place(card,x,y);};
  const leave=()=>{if(key){key='';v.emit('hover',null);}if(!pinned)hide();};
  v.tip={
    hide,
    click(s,event){
      if(!s?.rowId||!v.a)return;const info=cell(s);v.emit('cellclick',{...info,shiftKey:event.shiftKey});
      if(enabled()&&annotations(info).length){clearTimeout(timer);show(info,event.clientX,event.clientY,true);}
    },
  };
  on(v.scroll,'pointermove',(event:PointerEvent)=>{
    if(!v.a)return;
    const s=event.pointerType==='touch'||v.root.dataset.panning==='true'?null:v.eventAt(event);
    if(!s?.rowId){leave();return;}
    const info=cell(s),k=`${info.rowId}:${info.column}`;if(k===key)return;key=k;v.emit('hover',info);
    if(pinned)return;hide();
    if(enabled()){const {clientX,clientY}=event;timer=setTimeout(()=>{timer=undefined;if(v.a&&key===k)show(info,clientX,clientY,false);},DELAY);}
  });
  on(v.scroll,'pointerdown',()=>{if(!pinned)hide();});
  on(v.scroll,'pointerleave',leave);on(v.scroll,'scroll',()=>{if(!pinned)hide();});
  v.root.addEventListener('keydown',event=>{
    if(pinned&&event.key==='Escape'){event.stopPropagation();hide();return;}
    if(!pinned)hide();
  },{capture:true,signal:v.controller.signal});
  v.controller.signal.addEventListener('abort',hide);
}
