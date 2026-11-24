import type {Annotation} from './types';

interface Detail {label:string;value:string|number}
const isDetail=(value:unknown):value is Detail=>{
  if(!value||typeof value!=='object'||!('label' in value)||!('value' in value))return false;
  return typeof value.label==='string'&&!!value.label.trim()&&(typeof value.value==='string'?!!value.value.trim():typeof value.value==='number'&&Number.isFinite(value.value));
};
/** Optional application fields in metadata.details are plain text, never HTML or URLs. */
export function annotationDetails(annotation:Annotation):Detail[] {
  const fields:Detail[]=[],custom=annotation.metadata?.details;
  if(annotation.consequence?.length)fields.push({label:'Consequence',value:annotation.consequence.join(', ')});
  const evidence=[annotation.disease&&'disease',annotation.phenotype&&'phenotype'].filter(Boolean).join(', ');
  if(evidence)fields.push({label:'Evidence of',value:evidence});
  if(Array.isArray(custom))fields.push(...custom.filter(isDetail));
  return fields;
}
export function renderAnnotationDetails(parent:HTMLElement,annotation:Annotation):void {
  const fields=annotationDetails(annotation);
  if(!fields.length)return;
  const doc=parent.ownerDocument,list=doc.createElement('dl');list.className='ak-annotation-details';
  for(const {label,value} of fields){const term=doc.createElement('dt'),detail=doc.createElement('dd');term.textContent=label;detail.textContent=String(value);list.append(term,detail);}
  parent.append(list);
}
