import type { Alignment, AlignmentSummary, ColumnScope, VariableColumn, VariableColumnResult, RowGc } from './types';
import { SYMBOLS, STRIDE } from './analysis';
import { rowOffset } from './model';
/** Most variable columns a summary lists unless `limit` says otherwise. */
export const MAX_VARIABLE_COLUMNS=50000;
const BLOCK=4096;
const slot=new Int16Array(128).fill(-1);
for(let i=0;i<SYMBOLS.length;i++)slot[SYMBOLS.charCodeAt(i)]=i;
export interface ColumnAnalysis { summary:AlignmentSummary; variable:VariableColumnResult }
/** One sweep over the chosen rows and columns in blocks of 4096 columns, so memory stays flat. Costs about rows x columns cell reads for the counts plus one pass each for reference identity and GC. Pure; the viewer runs it in the worker. */
export function analyzeColumns(a:Alignment,scope:ColumnScope={}):ColumnAnalysis {
  const start=scope.start??1,end=scope.end??a.width,ref=scope.reference??0,rows=scope.rows??a.rows.map((_,i)=>i);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>a.width)throw new Error('Summary range must use valid inclusive alignment columns.');
  if(!Number.isInteger(ref)||ref<0||ref>=a.rows.length)throw new Error('Invalid reference row.');
  if(!rows.length)throw new Error('A summary needs at least one row.');
  if(rows.some(r=>!Number.isInteger(r)||r<0||r>=a.rows.length))throw new Error('Invalid summary row.');
  const limit=Number.isFinite(scope.limit)?Math.max(0,Math.floor(scope.limit!)):MAX_VARIABLE_COLUMNS;
  const W=a.width,codes=a.codes,n=rows.length,cols=end-start+1,canonical=a.alphabet==='protein'?'ACDEFGHIKLMNPQRSTVWY':a.alphabet==='rna'?'ACGU':'ACGT';
  const valid=new Uint8Array(128),canonSlots=[...canonical].map(c=>slot[c.charCodeAt(0)]);for(const c of canonical)valid[c.charCodeAt(0)]=1;
  const refOff=ref*W;let refPos=rowOffset(a.rows[ref])-1;for(let c=0;c<start-1;c++)if(codes[refOff+c]!==45)refPos++;
  const counts=new Uint32Array(Math.min(BLOCK,cols)*STRIDE),columns:VariableColumn[]=[];
  let conserved=0,constantWithGaps=0,variable=0,singleton=0,informative=0,gapOnly=0,gapCells=0,matches=0,compared=0;
  for(let b=start-1;b<end;b+=BLOCK){
    const e=Math.min(end,b+BLOCK),len=e-b;counts.fill(0,0,len*STRIDE);
    for(let i=0;i<n;i++){const off=rows[i]*W;for(let c=b;c<e;c++)counts[(c-b)*STRIDE+slot[codes[off+c]]]++;}
    for(let c=b;c<e;c++){
      const off=(c-b)*STRIDE,gaps=counts[off+27],rc=codes[refOff+c];if(rc!==45)refPos++;
      let distinct=0,twice=0;for(let k=0;k<27;k++){const x=counts[off+k];if(x){distinct++;if(x>1)twice++;}}
      gapCells+=gaps;
      let m=0;for(const k of canonSlots){const x=counts[off+k];matches+=x*(x-1)/2;m+=x;}compared+=m*(m-1)/2;
      if(!distinct){gapOnly++;continue;}
      if(distinct===1){if(gaps)constantWithGaps++;else conserved++;continue;}
      variable++;const kind=twice>=2?'informative':'singleton';if(kind==='informative')informative++;else singleton++;
      if(columns.length<limit){
        const alleles=[];for(let k=0;k<27;k++)if(counts[off+k])alleles.push({residue:SYMBOLS[k],count:counts[off+k]});
        alleles.sort((x,y)=>y.count-x.count||x.residue.localeCompare(y.residue));
        columns.push({column:c+1,referenceResidue:rc===45?null:refPos,reference:String.fromCharCode(rc),alleles,gapCount:gaps,kind});
      }
    }
  }
  let identityToReference:AlignmentSummary['identityToReference']=null;
  if(rows.some(r=>r!==ref)){
    let mt=0,cmp=0;
    for(const r of rows){if(r===ref)continue;const off=r*W;for(let c=start-1;c<end;c++){const x=codes[off+c],y=codes[refOff+c];if(valid[x]&&valid[y]){cmp++;if(x===y)mt++;}}}
    identityToReference={matches:mt,compared:cmp,identity:cmp?mt/cmp:null};
  }
  let rowGc:RowGc[]|null=null;
  if(a.alphabet!=='protein')rowGc=rows.map(r=>{let gc=0,bases=0;const off=r*W;for(let c=start-1;c<end;c++){const x=codes[off+c];if(x===71||x===67){gc++;bases++;}else if(x===65||x===84||x===85)bases++;}return {id:a.rows[r].id,name:a.rows[r].name,gc:bases?gc/bases:null,bases};});
  const summary:AlignmentSummary={start,end,columns:cols,rows:n,referenceId:a.rows[ref].id,conserved,constantWithGaps,variable,singleton,parsimonyInformative:informative,gapOnly,gapFraction:gapCells/(n*cols),meanPairwiseIdentity:compared?matches/compared:null,identityToReference,rowGc};
  return {summary,variable:{columns,total:variable,truncated:variable>columns.length}};
}
/** Column class counts, GC per row and identity estimates for the chosen rows and columns. */
export function summarizeColumns(a:Alignment,scope:ColumnScope={}):AlignmentSummary {return analyzeColumns(a,{...scope,limit:0}).summary;}
/** Columns with two or more distinct residues, with allele counts and the reference residue number. */
export function variableColumns(a:Alignment,scope:ColumnScope={}):VariableColumnResult {return analyzeColumns(a,scope).variable;}
