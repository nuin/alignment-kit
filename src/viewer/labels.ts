import type { Core, On } from './core';


export function buildLabels(v:Core,first:number,last:number):void {
  const a=v.a;if(!a)return;
  const fragment=document.createDocumentFragment();
  for(let i=first;i<last;i++){
    const item=v.rows[i],label=document.createElement('div');label.dataset.index=String(i);
    if(item<0) {
      const group=v.groupList[-item-1],toggle=document.createElement('button'),name=document.createElement('span'),count=document.createElement('small');
      label.className='ak-row-label ak-group-label';label.style.setProperty('--ak-group',group.color);
      toggle.type='button';toggle.dataset.group=group.name;toggle.title=`${group.name}: ${group.count} sequences`;toggle.setAttribute('aria-expanded',String(!group.collapsed));
      name.className='ak-group-name';name.textContent=`${group.collapsed?'▸':'▾'} ${group.name}`;count.className='ak-group-count';count.textContent=String(group.count);toggle.append(name,count);label.append(toggle);fragment.append(label);continue;
    }
    const row=a.rows[item];label.className='ak-row-label';label.draggable=v.visibility.rowReordering;if(v.rowStrands.has(row.id)&&a.alphabet!=='protein')label.dataset.reverseStrand='true';
    if(v.rowGroup[item]>=0){label.dataset.grouped='true';label.style.setProperty('--ak-group',v.groupList[v.rowGroup[item]].color);}
    const check=document.createElement('input');check.type='checkbox';check.checked=v.selectedRows.has(row.id);check.setAttribute('aria-label',`Select ${row.name}`);check.dataset.selectRow=row.id;
    const button=document.createElement('button');button.type='button';button.dataset.row=row.id;button.title=row.name+(row.species?' · '+row.species:'');const name=document.createElement('span');name.className='ak-row-name';name.textContent=row.name;button.append(name);if(row.species){const species=document.createElement('small');species.className='ak-row-species';species.textContent=row.species;button.append(species);}
    const hide=document.createElement('button');hide.type='button';hide.dataset.hide=row.id;hide.className='ak-hide';hide.textContent='×';hide.title='Hide this row';hide.setAttribute('aria-label',`Hide ${row.name}`);
    const pin=document.createElement('button');pin.type='button';pin.dataset.pin=row.id;pin.className='ak-pin';pin.textContent='◇';pin.setAttribute('aria-label',`Pin ${row.name} as reference`);
    label.append(check,button);
    if(a.alphabet!=='protein'){const reverse=v.rowStrands.has(row.id),strand=document.createElement('button');strand.type='button';strand.dataset.strand=row.id;strand.className='ak-strand';strand.textContent=reverse?'−':'+';strand.setAttribute('aria-pressed',String(reverse));strand.setAttribute('aria-label',`Reverse strand for ${row.name}`);strand.title=reverse?'Reverse strand: residues shown complemented. Click to clear.':'Forward strand. Click to show this row complemented.';label.append(strand);}
    label.append(hide,pin);fragment.append(label);
  }v.labels.replaceChildren(fragment);
  if(v.focusRow){v.labels.querySelector<HTMLElement>(`[data-row="${CSS.escape(v.focusRow)}"]`)?.focus();v.focusRow=undefined;}
}

export function bindLabels(v:Core,on:On):void {
  const labelRow=(event:Event)=>{const label=(event.target as HTMLElement).closest<HTMLElement>('.ak-row-label'),item=label?v.rows[Number(label.dataset.index)]:undefined;return item!==undefined&&item>=0&&v.a?item:undefined;};
  on(v.labels,'dragstart',(event:DragEvent)=>{const item=labelRow(event);if(item===undefined||!v.visibility.rowReordering){event.preventDefault();return;}v.dragId=v.a!.rows[item].id;event.dataTransfer?.setData('text/plain',v.dragId);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
  on(v.labels,'dragover',(event:DragEvent)=>{if(v.dragId)event.preventDefault();});
  on(v.labels,'drop',(event:DragEvent)=>{const id=v.dragId,item=labelRow(event);v.dragId=undefined;if(!id)return;event.preventDefault();event.stopPropagation();if(item!==undefined)v.moveRow(id,v.orderAll().indexOf(item));});
  on(v.labels,'dragend',()=>{v.dragId=undefined;});
  on(v.labels,'keydown',(event:KeyboardEvent)=>{
    const id=(event.target as HTMLElement).dataset?.row;if(!id||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!v.a||!v.visibility.rowReordering)return;
    event.preventDefault();const from=v.a.rows.findIndex(r=>r.id===id),to=v.stepRow(v.rowPos[from],event.key==='ArrowDown'?1:-1);
    if(to!==undefined){v.focusRow=id;v.moveRow(id,v.orderAll().indexOf(to));}
  });
}
