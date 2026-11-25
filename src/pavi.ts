import { parseAlignment } from './parsers';
import type { Alignment } from './types';
import { mapVariants, type VariantInput } from './variants';
export interface PaviVariant {
  variant_id:string; alignment_start_pos?:number; alignment_end_pos?:number;
  seq_start_pos?:number; seq_end_pos?:number; seq_substitution_type?:string;
  hgvs_protein?:string; molecular_consequences?:string[]; [key:string]:unknown;
}
export interface PaviSequenceInfo { species?:string; embedded_variants?:PaviVariant[]; non_coding_variants?:PaviVariant[]; requested_variant_ids?:string[]; error?:string }
function details(v:PaviVariant,nonCoding:boolean):{label:string;value:string}[] {
  const fields=[{label:'Variant ID',value:v.variant_id}];
  if(typeof v.impact==='string'&&v.impact.trim())fields.push({label:'Impact',value:v.impact});
  if(typeof v.genomic_seq_id==='string'&&Number.isSafeInteger(v.genomic_start_pos)&&Number.isSafeInteger(v.genomic_end_pos)){
    const start=Number(v.genomic_start_pos),end=Number(v.genomic_end_pos);
    if(start>0&&end>=start)fields.push({label:'Genomic location',value:`${v.genomic_seq_id}:${start}${end===start?'':`–${end}`}`});
  }
  if(typeof v.genomic_ref_seq==='string'&&typeof v.genomic_alt_seq==='string')fields.push({label:'Genomic change',value:`${v.genomic_ref_seq||'–'} → ${v.genomic_alt_seq||'–'}`});
  if(nonCoding)fields.push({label:'Region',value:'Non-coding'});
  return fields;
}
export function fromPavi(text:string,info:Record<string,PaviSequenceInfo>,annotationInfo:Record<string,{hasDisease?:boolean;hasPhenotype?:boolean}>={}):Alignment {
  const a=parseAlignment(text,{alphabet:'protein',name:'PAVI alignment'});
  for(const row of a.rows) {
    const sourceId=row.name.split(/\s/)[0],seqInfo=info[sourceId];
    if(!seqInfo) continue;
    row.species=seqInfo.species;
    row.metadata={sourceId,...seqInfo};
    const coding=seqInfo.embedded_variants??[],list=[...coding,...(seqInfo.non_coding_variants??[])];
    const inputs=list.map((v,index):VariantInput=>{const nonCoding=index>=coding.length,mapped=!nonCoding&&Number.isInteger(v.alignment_start_pos)&&Number.isInteger(v.alignment_end_pos);return {id:`${row.id}:${v.variant_id}:${index}`,rowId:row.id,...(mapped?{position:v.alignment_start_pos,end:v.alignment_end_pos}:{}),type:v.seq_substitution_type??'variant',...(v.molecular_consequences?{consequence:v.molecular_consequences}:{}),...(v.hgvs_protein?{hgvs:v.hgvs_protein}:{}),label:v.hgvs_protein||v.variant_id,disease:annotationInfo[v.variant_id]?.hasDisease,phenotype:annotationInfo[v.variant_id]?.hasPhenotype,metadata:{...v,sourceId,details:details(v,nonCoding)}};});
    a.annotations.push(...mapVariants(a,inputs,{coordinates:'alignment',hgvsPosition:false}).annotations);
  }
  return a;
}
