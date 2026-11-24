import {columnToResidue} from './model';
import {displayCode} from './strand';
import type {Alignment} from './types';

const PAGE_SIZE=25;
export function renderColumnRows(parent:HTMLElement,a:Alignment,column:number,rows:number[],reverse=false,strands?:Set<string>):void {
  const doc=parent.ownerDocument,section=doc.createElement('section'),heading=doc.createElement('h4'),caption=doc.createElement('p'),table=doc.createElement('table');
  section.className='ak-column-residues';heading.textContent='Sequences at this column';caption.className='ak-caption';
  table.className='ak-variants';table.setAttribute('aria-label',`Sequence residues at column ${column}`);
  const head=table.createTHead().insertRow();for(const label of ['Sequence','Residue','Position']){const cell=doc.createElement('th');cell.scope='col';cell.textContent=label;head.append(cell);}
  const body=table.createTBody(),nav=doc.createElement('div');nav.className='ak-inspector-actions';let page=0;
  const button=(text:string,label:string)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);nav.append(b);return b;};
  const previous=button('Previous','Previous column sequences'),next=button('Next','Next column sequences');
  const draw=()=>{
    body.replaceChildren();const start=page*PAGE_SIZE,end=Math.min(rows.length,start+PAGE_SIZE);
    caption.textContent=rows.length?`${start+1}–${end} of ${rows.length.toLocaleString()} visible sequences · ungapped positions`:'No visible sequences';
    for(const index of rows.slice(start,end)){
      const row=a.rows[index],residue=String.fromCharCode(displayCode(a.alphabet,a.codes[index*a.width+column-1],reverse,!!strands?.has(row.id))),position=columnToResidue(a,index,column),tr=body.insertRow();
      for(const value of [row.name,residue==='-'?'Gap':residue,position===null?'—':String(position)])tr.insertCell().textContent=value;
    }
    previous.disabled=page===0;next.disabled=end>=rows.length;nav.hidden=rows.length<=PAGE_SIZE;
  };
  previous.addEventListener('click',()=>{page--;draw();});next.addEventListener('click',()=>{page++;draw();});
  const scroll=doc.createElement('div');scroll.className='ak-column-table';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Sequence residues');scroll.append(table);
  section.append(heading,caption,scroll,nav);parent.append(section);draw();
}
