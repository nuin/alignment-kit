import type { Alignment, Annotation, AnnotationExportOptions } from './types';
import { filterAnnotations } from './annotations';
const enc=(s:string):string=>s.replace(/[\t\n\r;=&,%]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'));
const encSeqid=(s:string):string=>enc(s).replace(/^[#>]/,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const cell=(s:unknown):string=>String(s??'').replace(/[\t\r\n]+/g,' ');
interface Placed { a:Annotation; row?:number; seqStart?:number; seqEnd?:number }
/** Selects the annotations to write and adds each one's ungapped coordinates in its own row, counted from 1 at the first residue (row offsets such as seqA/51-120 are not applied, matching import). */
function place(alignment:Alignment,options:AnnotationExportOptions):Placed[] {
  const list=options.annotations??(options.filter?filterAnnotations(alignment.annotations,options.filter).visible:alignment.annotations);
  const index=new Map(alignment.rows.map((r,i)=>[r.id,i])),prefix=new Map<number,Int32Array>();
  const counts=(row:number):Int32Array=>{
    let p=prefix.get(row);
    if(!p){p=new Int32Array(alignment.width+1);for(let c=0;c<alignment.width;c++)p[c+1]=p[c]+(alignment.codes[row*alignment.width+c]!==45?1:0);prefix.set(row,p);}
    return p;
  };
  return list.map(a=>{
    const row=a.rowId===undefined?undefined:index.get(a.rowId);
    if(a.mapping!=='mapped'||a.start===undefined||a.end===undefined||row===undefined||a.start<1||a.end>alignment.width||a.end<a.start) return {a,row};
    const p=counts(row),seqStart=p[a.start-1]+1,seqEnd=p[a.end];
    return seqEnd>=seqStart?{a,row,seqStart,seqEnd}:{a,row};
  });
}
const mapped=(p:Placed):boolean=>p.a.mapping==='mapped'&&p.a.start!==undefined&&p.a.end!==undefined;
/** GFF3 with sequence coordinates by default (round-trips through importAnnotations); `coordinates:'alignment'` writes columns. Annotations without usable coordinates are skipped with a warning. */
export function exportAnnotationsGff3(alignment:Alignment,options:AnnotationExportOptions={}):string {
  const warnings=options.warnings??[],columns=options.coordinates==='alignment',out=['##gff-version 3'],seen=new Map<string,number>(),warned=new Set<string>();
  for(const r of alignment.rows)seen.set(r.name,(seen.get(r.name)??0)+1);
  for(const p of place(alignment,options)) {
    const {a}=p,row=p.row===undefined?undefined:alignment.rows[p.row];
    const start=columns?(mapped(p)?a.start:undefined):p.seqStart,end=columns?(mapped(p)?a.end:undefined):p.seqEnd;
    if(start===undefined||end===undefined||(!columns&&!row)){warnings.push(`${a.label} (${a.id}) skipped: ${a.mapping==='mapped'?'no residue of its sequence in the mapped columns':'unmapped'}.`);continue;}
    const dup=!!row&&options.seqid!=='id'&&seen.get(row.name)!>1;
    if(row&&dup&&!warned.has(row.name)){warned.add(row.name);warnings.push(`Row name “${row.name}” is used by ${seen.get(row.name)} rows; their seqid is the row id.`);}
    const seqid=row?(options.seqid==='id'||dup?row.id:row.name):alignment.name;
    const attrs=[`ID=${enc(a.id)}`,`Name=${enc(a.label)}`];
    if(row)attrs.push(`row_id=${enc(row.id)}`);
    if(!columns&&mapped(p))attrs.push(`aln_start=${a.start}`,`aln_end=${a.end}`);
    if(a.consequence?.length)attrs.push(`consequence=${a.consequence.map(enc).join(',')}`);
    if(a.disease!==undefined)attrs.push(`disease=${a.disease}`);
    if(a.phenotype!==undefined)attrs.push(`phenotype=${a.phenotype}`);
    out.push([encSeqid(seqid),'msa-canvas',enc(a.kind??'region'),start,end,'.','.','.',attrs.join(';')].join('\t'));
  }
  return out.join('\n')+'\n';
}
const header=['id','label','kind','row_id','row_name','mapping','aln_start','aln_end','seq_start','seq_end','consequence','disease','phenotype'];
/** TSV with every selected annotation. Unmapped ones keep empty coordinate cells; `seq_*` is empty for annotations without a row. */
export function exportAnnotationsTsv(alignment:Alignment,options:AnnotationExportOptions={}):string {
  const rows=place(alignment,options).map(p=>{
    const {a}=p,ok=mapped(p);
    return [a.id,a.label,a.kind,a.rowId,p.row===undefined?'':alignment.rows[p.row].name,a.mapping,ok?a.start:'',ok?a.end:'',p.seqStart??'',p.seqEnd??'',a.consequence?.join(','),a.disease,a.phenotype].map(cell).join('\t');
  });
  return [header.join('\t'),...rows].join('\n')+'\n';
}
/** JSON document with the alignment identity, the coordinate convention and one object per annotation (unmapped ones have null coordinates). */
export function exportAnnotationsJson(alignment:Alignment,options:AnnotationExportOptions={}):string {
  const annotations=place(alignment,options).map(p=>{
    const {a}=p,ok=mapped(p);
    return {id:a.id,label:a.label,kind:a.kind??null,rowId:a.rowId??null,rowName:p.row===undefined?null:alignment.rows[p.row].name,mapping:a.mapping,alignmentStart:ok?a.start!:null,alignmentEnd:ok?a.end!:null,sequenceStart:p.seqStart??null,sequenceEnd:p.seqEnd??null,consequence:a.consequence??[],disease:a.disease??null,phenotype:a.phenotype??null,metadata:a.metadata??{}};
  });
  return JSON.stringify({alignment:{id:alignment.id,name:alignment.name,width:alignment.width},coordinates:'one-based inclusive; sequence coordinates count ungapped residues from 1 at the first residue of the row, without row offsets',annotations},null,2)+'\n';
}
