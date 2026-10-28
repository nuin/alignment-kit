import type { Alignment, AlignmentStats, ColumnDetail, Identity } from './types';
export const SYMBOLS='ABCDEFGHIJKLMNOPQRSTUVWXYZ*-';
export const STRIDE=28;
const symbolIndex=new Int16Array(128).fill(-1);
for(let i=0;i<SYMBOLS.length;i++) symbolIndex[SYMBOLS.charCodeAt(i)]=i;
export function calculateStats(a:Alignment, rows?:number[]):AlignmentStats {
  const counts=new Uint32Array(a.width*STRIDE), gaps=new Uint32Array(a.width), consensus=new Uint8Array(a.width), frequency=new Float32Array(a.width),support=new Float32Array(a.width);
  const total=rows?.length??a.rows.length;
  for(let i=0;i<total;i++) {
    const r=rows?rows[i]:i;
    if(!Number.isInteger(r)||r<0||r>=a.rows.length) throw new Error('Invalid statistics row.');
    const offset=r*a.width;
    for(let c=0;c<a.width;c++) counts[c*STRIDE+symbolIndex[a.codes[offset+c]]]++;
  }
  for(let c=0;c<a.width;c++) {
    const off=c*STRIDE; gaps[c]=counts[off+27];
    let max=0,code=0,tied=false;
    for(let k=0;k<27;k++) {
      const n=counts[off+k];
      if(n>max) {max=n;code=SYMBOLS.charCodeAt(k);tied=false;}
      else if(n && n===max) tied=true;
    }
    consensus[c]=max?(tied?63:code):45;
    frequency[c]=total>gaps[c]?max/(total-gaps[c]):NaN;
    support[c]=total?max/total:NaN;
  }
  return {width:a.width,total,counts,gaps,consensus,frequency,support};
}
export function columnDetail(s:AlignmentStats,column:number):ColumnDetail {
  if(!Number.isInteger(column)||column<1||column>s.width) throw new Error('Invalid column.');
  const c=column-1, counts=[];
  for(let k=0;k<27;k++) if(s.counts[c*STRIDE+k]) counts.push({residue:SYMBOLS[k],count:s.counts[c*STRIDE+k]});
  counts.sort((a,b)=>b.count-a.count || a.residue.localeCompare(b.residue));
  return {column,total:s.total,gapCount:s.gaps[c],gapFraction:s.total?s.gaps[c]/s.total:null,consensus:s.consensus[c]===45||s.consensus[c]===63?null:String.fromCharCode(s.consensus[c]),tied:s.consensus[c]===63,frequency:Number.isNaN(s.frequency[c])?null:s.frequency[c],support:Number.isNaN(s.support[c])?null:s.support[c],counts};
}
export function pairwiseIdentity(a:Alignment,rowA:number,rowB:number):Identity {
  if(!a.rows[rowA]||!a.rows[rowB]) throw new Error('Invalid sequence row.');
  const canonical=a.alphabet==='protein'?'ACDEFGHIKLMNPQRSTVWY':a.alphabet==='rna'?'ACGU':'ACGT';
  const valid=new Uint8Array(128); for(const c of canonical) valid[c.charCodeAt(0)]=1;
  let matches=0,compared=0;
  for(let c=0;c<a.width;c++) {
    const x=a.codes[rowA*a.width+c],y=a.codes[rowB*a.width+c];
    if(valid[x]&&valid[y]) {compared++;if(x===y) matches++;}
  }
  return {matches,compared,identity:compared?matches/compared:null};
}
export function pairwiseMatrix(a:Alignment,rows:number[]) {
  if(rows.length>200) throw new Error('Pairwise comparison is limited to 200 selected sequences.');
  if(new Set(rows).size!==rows.length) throw new Error('Select distinct sequence rows.');
  return rows.map(rowA=>rows.map(rowB=>pairwiseIdentity(a,rowA,rowB)));
}
const iupac:Record<string,string>={AG:'R',CT:'Y',CG:'S',AT:'W',GT:'K',AC:'M',CGT:'B',AGT:'D',ACT:'H',ACG:'V',ACGT:'N'};
const expand:Record<string,string>={A:'A',C:'C',G:'G',T:'T',U:'T',...Object.fromEntries(Object.entries(iupac).map(([bases,code])=>[code,bases]))};
/** Consensus symbol for a 0-based column: modal non-gap residue; X/N below `threshold` (modal frequency among non-gap rows); ties as the IUPAC code covering every tied base, ambiguity codes expanded (DNA/RNA), or X; all-gap columns '-'. */
export function consensusSymbol(s:AlignmentStats,alphabet:Alignment['alphabet'],column:number,threshold=0):string {
  const off=column*STRIDE,unknown=alphabet==='protein'?'X':'N';let max=0;const tied:string[]=[];
  for(let k=0;k<27;k++){const n=s.counts[off+k];if(n>max){max=n;tied.length=0;tied.push(SYMBOLS[k]);}else if(n&&n===max)tied.push(SYMBOLS[k]);}
  if(!max)return '-';
  if(max/(s.total-s.gaps[column])<threshold)return unknown;
  if(tied.length===1)return tied[0];
  if(alphabet==='protein')return 'X';
  if(tied.some(b=>!expand[b]))return 'N';
  const bases=[...new Set(tied.flatMap(b=>[...expand[b]]))].sort().join('');
  return bases.length===1?bases:iupac[bases]??'N';
}
/** Consensus over inclusive 1-based columns `start`..`end`. */
export function consensusSequence(s:AlignmentStats,alphabet:Alignment['alphabet'],threshold=0,start=1,end=s.width):string {
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>s.width)throw new Error('Consensus range must use valid inclusive alignment columns.');
  if(!(threshold>=0&&threshold<=1))throw new Error('Consensus threshold must be between 0 and 1.');
  let out='';for(let c=start-1;c<end;c++)out+=consensusSymbol(s,alphabet,c,threshold);return out;
}
