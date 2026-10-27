import { parseAlignment } from './parsers';
import type { Alignment, Annotation } from './types';
export interface PaviVariant {
  variant_id:string; alignment_start_pos?:number; alignment_end_pos?:number;
  seq_start_pos?:number; seq_end_pos?:number; seq_substitution_type?:string;
  hgvs_protein?:string; molecular_consequences?:string[]; [key:string]:unknown;
}
export interface PaviSequenceInfo { species?:string; embedded_variants?:PaviVariant[]; non_coding_variants?:PaviVariant[]; requested_variant_ids?:string[]; error?:string }
export function fromPavi(text:string,info:Record<string,PaviSequenceInfo>,annotationInfo:Record<string,{hasDisease?:boolean;hasPhenotype?:boolean}>={}):Alignment {
  const a=parseAlignment(text,{alphabet:'protein',name:'PAVI alignment'});
  for(const row of a.rows) {
    const sourceId=row.name.split(/\s/)[0],seqInfo=info[sourceId];
    if(!seqInfo) continue;
    row.species=seqInfo.species;
    row.metadata={sourceId,...seqInfo};
    for(const [index,v] of [...(seqInfo.embedded_variants??[]),...(seqInfo.non_coding_variants??[])].entries()) {
      const mapped=Number.isInteger(v.alignment_start_pos)&&Number.isInteger(v.alignment_end_pos)&&v.alignment_start_pos!>=1&&v.alignment_end_pos!>=v.alignment_start_pos!&&v.alignment_end_pos!<=a.width;
      const annotation:Annotation={id:`${row.id}:${v.variant_id}:${index}`,rowId:row.id,label:v.hgvs_protein||v.variant_id,mapping:mapped?'mapped':'unmapped',kind:v.seq_substitution_type??'variant',consequence:v.molecular_consequences,disease:annotationInfo[v.variant_id]?.hasDisease,phenotype:annotationInfo[v.variant_id]?.hasPhenotype,metadata:{...v,sourceId}};
      if(mapped) {annotation.start=v.alignment_start_pos;annotation.end=v.alignment_end_pos;}
      a.annotations.push(annotation);
    }
  }
  return a;
}
