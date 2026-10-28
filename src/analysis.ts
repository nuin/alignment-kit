import type { Alignment, AlignmentStats, ColumnDetail, Identity } from './types';
export const SYMBOLS='ABCDEFGHIJKLMNOPQRSTUVWXYZ*-';
export const STRIDE=28;
const symbolIndex=new Int16Array(128).fill(-1);
for(let i=0;i<SYMBOLS.length;i++) symbolIndex[SYMBOLS.charCodeAt(i)]=i;
const AMINO='ARNDCQEGHILKMFPSTWYV';
const BLOSUM62=[[4,-1,-2,-2,0,-1,-1,0,-2,-1,-1,-1,-1,-2,-1,1,0,-3,-2,0],[-1,5,0,-2,-3,1,0,-2,0,-3,-2,2,-1,-3,-2,-1,-1,-3,-2,-3],[-2,0,6,1,-3,0,0,0,1,-3,-3,0,-2,-3,-2,1,0,-4,-2,-3],[-2,-2,1,6,-3,0,2,-1,-1,-3,-4,-1,-3,-3,-1,0,-1,-4,-3,-3],[0,-3,-3,-3,9,-3,-4,-3,-3,-1,-1,-3,-1,-2,-3,-1,-1,-2,-2,-1],[-1,1,0,0,-3,5,2,-2,0,-3,-2,1,0,-3,-1,0,-1,-2,-1,-2],[-1,0,0,2,-4,2,5,-2,0,-3,-3,1,-2,-3,-1,0,-1,-3,-2,-2],[0,-2,0,-1,-3,-2,-2,6,-2,-4,-4,-2,-3,-3,-2,0,-2,-2,-3,-3],[-2,0,1,-1,-3,0,0,-2,8,-3,-3,-1,-2,-1,-2,-1,-2,-2,2,-3],[-1,-3,-3,-3,-1,-3,-3,-4,-3,4,2,-3,1,0,-3,-2,-1,-3,-1,3],[-1,-2,-3,-4,-1,-2,-3,-4,-3,2,4,-2,2,0,-3,-2,-1,-2,-1,1],[-1,2,0,-1,-3,1,1,-2,-1,-3,-2,5,-1,-3,-1,0,-1,-3,-2,-2],[-1,-1,-2,-3,-1,0,-2,-3,-2,1,2,-1,5,0,-2,-1,-1,-1,-1,1],[-2,-3,-3,-3,-2,-3,-3,-3,-1,0,0,-3,0,6,-4,-2,-2,1,3,-1],[-1,-2,-2,-1,-3,-1,-1,-2,-2,-3,-3,-1,-2,-4,7,-1,-1,-4,-3,-2],[1,-1,1,0,-1,0,0,0,-1,-2,-2,0,-1,-2,-1,4,1,-3,-2,-2],[0,-1,0,-1,-1,-1,-1,-2,-2,-1,-1,-1,-1,-2,-1,1,5,-2,-2,0],[-3,-3,-4,-4,-2,-2,-3,-2,-2,-3,-2,-3,-1,1,-4,-3,-2,11,2,-3],[-2,-2,-2,-3,-2,-1,-2,-3,2,-1,-1,-2,-1,3,-3,-2,-2,2,7,-1],[0,-3,-3,-3,-1,-2,-2,-3,-3,3,1,-2,1,-1,-2,-2,0,-3,-1,4]];
/** BLOSUM62 entries over the 20 standard amino acids; quality is rescaled from [BLOSUM_MIN, BLOSUM_MAX] to [0, 1]. */
export const BLOSUM_MIN=-4,BLOSUM_MAX=11;
/** BLOSUM62 score of two residue letters, or null when either is not one of the 20 standard amino acids. */
export function blosum62(x:string,y:string):number|null {const i=AMINO.indexOf(x),j=AMINO.indexOf(y);return i<0||j<0?null:BLOSUM62[i][j];}
const aminoSlots=[...AMINO].map(r=>SYMBOLS.indexOf(r));
/** Shannon entropy in bits over the non-gap residue counts of one column; NaN when there are none. */
function columnEntropy(counts:Uint32Array,off:number):number {
  let n=0;for(let k=0;k<27;k++)n+=counts[off+k];
  if(!n)return NaN;
  let h=0;for(let k=0;k<27;k++){const x=counts[off+k];if(x){const p=x/n;h-=p*Math.log2(p);}}
  return h;
}
/** Mean pairwise BLOSUM62 score over pairs of rows holding standard amino acids, scaled to 0..1; NaN below two scored residues. */
function columnQuality(counts:Uint32Array,off:number):number {
  let n=0,sum=0;
  for(let i=0;i<20;i++){
    const x=counts[off+aminoSlots[i]];if(!x)continue;n+=x;sum+=x*(x-1)/2*BLOSUM62[i][i];
    for(let j=i+1;j<20;j++){const y=counts[off+aminoSlots[j]];if(y)sum+=x*y*BLOSUM62[i][j];}
  }
  return n<2?NaN:(sum/(n*(n-1)/2)-BLOSUM_MIN)/(BLOSUM_MAX-BLOSUM_MIN);
}
/** Centered moving average over `window` columns (odd), skipping NaN; edges average the columns that exist. */
export function movingAverage(values:ArrayLike<number>,window:number,column:number):number {
  const half=(window-1)/2,from=Math.max(0,column-half),to=Math.min(values.length-1,column+half);let sum=0,n=0;
  for(let c=from;c<=to;c++)if(!Number.isNaN(values[c])){sum+=values[c];n++;}
  return n?sum/n:NaN;
}
export function calculateStats(a:Alignment, rows?:number[]):AlignmentStats {
  const counts=new Uint32Array(a.width*STRIDE), gaps=new Uint32Array(a.width), consensus=new Uint8Array(a.width), frequency=new Float32Array(a.width),support=new Float32Array(a.width),entropy=new Float32Array(a.width),information=new Float32Array(a.width),quality=new Float32Array(a.width).fill(NaN);
  const alphabetSize=a.alphabet==='protein'?20:4;
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
    const n=total-gaps[c],h=columnEntropy(counts,off);
    entropy[c]=h;information[c]=n?Math.max(0,Math.log2(alphabetSize)-(h+(alphabetSize-1)/(2*Math.LN2*n))):NaN;
    if(a.alphabet==='protein')quality[c]=columnQuality(counts,off);
  }
  return {width:a.width,total,counts,gaps,consensus,frequency,support,entropy,information,quality};
}
const finite=(x:number)=>Number.isNaN(x)?null:x;
export function columnDetail(s:AlignmentStats,column:number):ColumnDetail {
  if(!Number.isInteger(column)||column<1||column>s.width) throw new Error('Invalid column.');
  const c=column-1, counts=[];
  for(let k=0;k<27;k++) if(s.counts[c*STRIDE+k]) counts.push({residue:SYMBOLS[k],count:s.counts[c*STRIDE+k]});
  counts.sort((a,b)=>b.count-a.count || a.residue.localeCompare(b.residue));
  return {column,total:s.total,gapCount:s.gaps[c],gapFraction:s.total?s.gaps[c]/s.total:null,consensus:s.consensus[c]===45||s.consensus[c]===63?null:String.fromCharCode(s.consensus[c]),tied:s.consensus[c]===63,frequency:Number.isNaN(s.frequency[c])?null:s.frequency[c],support:Number.isNaN(s.support[c])?null:s.support[c],entropy:finite(s.entropy[c]),information:finite(s.information[c]),quality:finite(s.quality[c]),counts};
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
export function pairwiseMatrix(a:Alignment,rows:number[]):Identity[][] {
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
