import type {Alignment,Annotation} from './types';
import {columnToResidue} from './model';
import {annotationColor,variantOf,variantClassLabels} from './variants';
import {annotationDetails,renderAnnotationDetails} from './annotation-details';

const span=(parent:HTMLElement,text:string,className:string):HTMLSpanElement=>{
  const node=parent.ownerDocument.createElement('span');node.className=className;node.textContent=text;parent.append(node);return node;
};
const range=(start:number,end:number)=>start===end?String(start):`${start}–${end}`;
function position(a:Alignment,n:Annotation):string {
  if(n.mapping!=='mapped'||n.start===undefined||n.end===undefined)return a.alphabet==='protein'?'No protein position':'No alignment position';
  const row=a.rows.findIndex(r=>r.id===n.rowId),columns=`Column ${range(n.start,n.end)}`;
  if(row<0)return columns;
  const first=columnToResidue(a,row,n.start),last=columnToResidue(a,row,n.end);
  return first===null||last===null?columns:`${a.alphabet==='protein'?'Residue':'Position'} ${range(first,last)} · ${columns.toLowerCase()}`;
}
export function renderVariantCard(button:HTMLButtonElement,a:Alignment,n:Annotation,index:number):void {
  button.replaceChildren();button.type='button';button.className='ak-variant-card';button.dataset.variantCard=n.id;
  button.style.setProperty('--ak-variant-color',annotationColor(n));
  const fields=annotationDetails(n),info=variantOf(n),row=a.rows.find(r=>r.id===n.rowId);
  const title=info?.hgvs??n.label,short=title.includes(':p.')?title.slice(title.indexOf(':p.')+1):title;
  const top=span(button,'','ak-variant-card-top');span(top,String(index+1).padStart(2,'0'),'ak-variant-card-number');
  span(top,short,'ak-variant-card-title').title=title;
  span(button,row?.name??'Alignment-wide variant','ak-variant-card-row').title=row?.name??'';
  if(row?.species)span(button,row.species,'ak-variant-card-species');
  const tags=span(button,'','ak-variant-card-tags');
  if(fields.some(f=>f.label==='Region'&&f.value==='Non-coding'))span(tags,'Noncoding','ak-variant-card-tag');
  span(tags,n.consequence?.join(', ').replaceAll('_',' ')??(info?variantClassLabels[info.consequenceClass]:'Variant'),'ak-variant-card-consequence');
  const impact=fields.find(f=>f.label==='Impact');if(impact)span(tags,String(impact.value),'ak-variant-card-tag');
  if(n.disease===true)span(tags,'Disease','ak-variant-card-tag');if(n.phenotype===true)span(tags,'Phenotype','ak-variant-card-tag');
  span(button,position(a,n),'ak-variant-card-position');
}
export function renderVariantDetails(parent:HTMLElement,n:Annotation):void {
  parent.replaceChildren();span(parent,n.label,'ak-variant-details-title');renderAnnotationDetails(parent,n);
}
