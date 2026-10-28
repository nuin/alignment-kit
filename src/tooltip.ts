import type { Annotation } from './types';
/** URL templates with an `{id}` placeholder, keyed by source or id type (lowercase): `pubmed` (or `pmid`), `evidence` (or `eco`), or a source name. */
export type AnnotationLinks = Record<string,string>;
export interface AnnotationDetails { evidence:string[]; source:string[]; pubmed:string[] }
const parts=(value:unknown,split:boolean):string[]=>{
  const out:string[]=[];
  for(const item of Array.isArray(value)?value:[value]){
    if(typeof item!=='string'&&typeof item!=='number')continue;
    for(const piece of (split?String(item).split(/[,;|\s]+/):[String(item)]))if(piece.trim()&&out.length<20)out.push(piece.trim().slice(0,120));
  }
  return out;
};
/** Evidence codes, source and PubMed IDs from `metadata.evidence`, `source`, `pubmed` or `pmid`. */
export function annotationDetails(a:Annotation):AnnotationDetails {
  const m=a.metadata??{};
  return {evidence:parts(m.evidence,true),source:parts(m.source,false),pubmed:[...parts(m.pubmed,true),...parts(m.pmid,true)].map(id=>id.replace(/^pmid:?/i,'')).filter(Boolean)};
}
/** Check that every template is an http or https URL containing `{id}`; returns a copy with lowercase keys. */
export function validateAnnotationLinks(value:unknown):AnnotationLinks {
  if(typeof value!=='object'||value===null||Array.isArray(value))throw new Error('annotationLinks must be an object of URL templates.');
  const out:AnnotationLinks={};
  for(const [key,template] of Object.entries(value)){
    if(!key.trim())throw new Error('annotationLinks keys must be non-empty.');
    let url:URL|undefined;
    if(typeof template==='string'&&template.includes('{id}'))try{url=new URL(template.split('{id}').join('x'));}catch{url=undefined;}
    if(!url||(url.protocol!=='https:'&&url.protocol!=='http:'))throw new Error(`annotationLinks.${key} must be an http or https URL containing {id}.`);
    out[key.toLowerCase()]=template as string;
  }
  return out;
}
/** The link for `id` under the first matching key, or undefined when no template applies. */
export function annotationLink(links:AnnotationLinks,keys:string[],id:string):string|undefined {
  for(const key of keys){const k=key.toLowerCase(),template=Object.hasOwn(links,k)?links[k]:undefined;if(template)return template.split('{id}').join(encodeURIComponent(id));}
  return undefined;
}
