let nextMenuId=0;
/** Viewer-owned select menus. Hidden native controls retain the internal value/change contract. */
export class ThemedSelects {
  private buttons=new Map<HTMLSelectElement,HTMLButtonElement>();
  private controller=new AbortController();
  private active?:{select:HTMLSelectElement;button:HTMLButtonElement;menu:HTMLDivElement;options:HTMLOptionElement[];index:number};
  private search='';private searchTime=0;
  constructor(private root:HTMLElement){
    const signal=this.controller.signal;
    root.ownerDocument.addEventListener('pointerdown',event=>{
      const a=this.active,target=event.target as Node;
      if(a&&!a.button.contains(target)&&!a.menu.contains(target))this.close();
    },{signal});
    root.ownerDocument.defaultView?.addEventListener('resize',()=>this.close(),{signal});
    root.addEventListener('scroll',event=>{if(this.active&&!this.active.menu.contains(event.target as Node))this.close();},{capture:true,signal});
  }
  sync(){
    for(const [select,button] of this.buttons)if(!this.root.contains(select)){
      if(this.active?.select===select)this.close();button.remove();this.buttons.delete(select);
    }
    for(const select of this.root.querySelectorAll('select')){
      let button=this.buttons.get(select);
      if(!button){
        button=document.createElement('button');button.type='button';button.className='ak-select-trigger';
        button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
        button.setAttribute('aria-label',select.getAttribute('aria-label')??'Choose an option');
        select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(button);this.buttons.set(select,button);
        const trigger=button;
        button.addEventListener('click',event=>{event.preventDefault();if(this.active?.select===select)this.close();else this.open(select,trigger);});
        button.addEventListener('keydown',event=>this.key(event,select,trigger));
        button.addEventListener('blur',()=>{if(this.active?.button===trigger)this.close();});
      }
      button.textContent=select.selectedOptions[0]?.textContent??'';button.disabled=select.disabled;
      if(this.active?.select===select&&(select.disabled||this.active.options.some(option=>!select.contains(option))))this.close();
    }
  }
  private open(select:HTMLSelectElement,button:HTMLButtonElement){
    this.close();this.sync();if(select.disabled)return;
    const options=Array.from(select.options).filter(option=>!option.hidden);if(!options.length)return;
    const menu=document.createElement('div');menu.className='ak-select-menu';menu.id=`ak-select-menu-${++nextMenuId}`;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',button.getAttribute('aria-label')!);
    this.active={select,button,menu,options,index:Math.max(0,options.indexOf(select.selectedOptions[0]))};
    options.forEach((option,index)=>{
      const item=document.createElement('div');item.id=`${menu.id}-${index}`;item.className='ak-select-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.setAttribute('aria-disabled',String(option.disabled));item.textContent=option.textContent;
      item.addEventListener('pointerdown',event=>event.preventDefault());
      item.addEventListener('click',()=>this.commit(index));
      menu.append(item);
    });
    this.root.append(menu);button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',menu.id);
    const bounds=this.root.getBoundingClientRect(),rect=button.getBoundingClientRect();
    const viewHeight=this.root.ownerDocument.defaultView?.innerHeight??bounds.bottom;
    const below=Math.max(0,Math.min(bounds.bottom,viewHeight)-rect.bottom-12),above=Math.max(0,rect.top-Math.max(bounds.top,0)-12);
    const upward=below<180&&above>below,space=upward?above:below;
    const width=Math.min(Math.max(rect.width,220),Math.max(0,bounds.width-16));
    menu.style.width=width+'px';menu.style.maxHeight=Math.min(300,space)+'px';
    menu.style.left=Math.max(8,Math.min(rect.left-bounds.left,bounds.width-width-8))+'px';
    if(upward)menu.style.bottom=Math.max(8,bounds.bottom-rect.top+4)+'px';else menu.style.top=(rect.bottom-bounds.top+4)+'px';
    button.focus();this.highlight(this.active.index);
  }
  private highlight(index:number){
    const a=this.active;if(!a)return;a.index=index;
    Array.from(a.menu.children).forEach((item,i)=>(item as HTMLElement).dataset.active=String(i===index));
    const item=a.menu.children[index] as HTMLElement;if(!item)return;
    a.button.setAttribute('aria-activedescendant',item.id);
    if(item.offsetTop<a.menu.scrollTop)a.menu.scrollTop=item.offsetTop;
    else if(item.offsetTop+item.offsetHeight>a.menu.scrollTop+a.menu.clientHeight)a.menu.scrollTop=item.offsetTop+item.offsetHeight-a.menu.clientHeight;
  }
  private commit(index:number){
    const a=this.active,option=a?.options[index];if(!a||!option||option.disabled)return;
    a.select.value=option.value;this.close();a.select.dispatchEvent(new Event('change',{bubbles:true}));this.sync();a.button.focus();
  }
  private key(event:KeyboardEvent,select:HTMLSelectElement,button:HTMLButtonElement){
    const a=this.active?.select===select?this.active:undefined;
    if(event.key==='Tab'){this.close();return;}
    if(event.key==='Escape'){if(a){event.preventDefault();this.close();}return;}
    if(['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      if(!a){this.open(select,button);return;}
      if(event.key==='Enter'||event.key===' '){this.commit(a.index);return;}
      const enabled=a.options.map((option,i)=>option.disabled?-1:i).filter(i=>i>=0);if(!enabled.length)return;
      const current=enabled.indexOf(a.index),next=event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1)!:enabled[(current+(event.key==='ArrowUp'?-1:1)+enabled.length)%enabled.length];
      this.highlight(next);return;
    }
    if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();if(!a)this.open(select,button);
      const now=Date.now();this.search=now-this.searchTime<600?this.search+event.key:event.key;this.searchTime=now;
      const active=this.active;if(!active)return;
      const found=active.options.findIndex(option=>!option.disabled&&option.text.toLowerCase().startsWith(this.search.toLowerCase()));if(found>=0)this.highlight(found);
    }
  }
  close(){const a=this.active;if(!a)return;a.menu.remove();a.button.setAttribute('aria-expanded','false');a.button.removeAttribute('aria-controls');a.button.removeAttribute('aria-activedescendant');this.active=undefined;this.search='';}
  destroy(){this.close();this.controller.abort();for(const [select,button]of this.buttons){button.remove();select.hidden=false;select.removeAttribute('aria-hidden');select.removeAttribute('tabindex');}this.buttons.clear();}
}
