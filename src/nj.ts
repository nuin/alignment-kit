import type { Alignment } from './types';
/** Largest row count `neighborJoiningTree` accepts. Distances cost rows² × columns and joining costs rows³. */
export const MAX_NJ_ROWS=1000;
/** A neighbor-joining guide tree. `missing` counts row pairs with no comparable residue; they get the largest observed distance. */
export interface NjTree { newick:string; rows:number; missing:number }

/** p-distance (1 − identity over canonical residues both rows hold) for each pair of `rows`, as a rows × rows matrix. NaN where a pair shares no comparable residue. */
export function pDistances(a:Alignment,rows:number[]):Float64Array {
  const n=rows.length,w=a.width,d=new Float64Array(n*n);
  const canonical=a.alphabet==='protein'?'ACDEFGHIKLMNPQRSTVWY':a.alphabet==='rna'?'ACGU':'ACGT';
  const valid=new Uint8Array(256);for(const c of canonical)valid[c.charCodeAt(0)]=1;
  for(const r of rows)if(!a.rows[r])throw new Error('Invalid sequence row.');
  for(let i=0;i<n;i++){const oi=rows[i]*w;for(let j=i+1;j<n;j++){const oj=rows[j]*w;let same=0,seen=0;
    for(let c=0;c<w;c++){const x=a.codes[oi+c],y=a.codes[oj+c];if(valid[x]&&valid[y]){seen++;if(x===y)same++;}}
    d[i*n+j]=d[j*n+i]=seen?1-same/seen:NaN;}}
  return d;
}
const quote=(s:string)=>`'${s.replace(/'/g,"''")}'`;
const len=(x:number)=>String(+Math.max(0,x).toPrecision(6));
/** Unrooted neighbor-joining tree (Saitou and Nei 1987) from a symmetric n × n distance matrix, as Newick with quoted `names`. Negative branch lengths are set to 0. Ties join the first pair found. */
export function neighborJoining(dist:Float64Array,names:string[]):string {
  const n=names.length;if(dist.length!==n*n)throw new Error('The distance matrix does not match the names.');
  if(n===0)throw new Error('A tree needs at least one sequence.');
  const label=names.map(quote);if(n===1)return `${label[0]};`;
  const d=Float64Array.from(dist);if(n===2)return `(${label[0]}:${len(d[1]/2)},${label[1]}:${len(d[1]/2)});`;
  const alive=Array.from({length:n},(_,i)=>i),r=new Float64Array(n);
  for(let i=0;i<n;i++){let s=0;for(let j=0;j<n;j++)s+=d[i*n+j];r[i]=s;}
  while(alive.length>3){
    const m=alive.length;let best=Infinity,bi=0,bj=1;
    for(let x=0;x<m;x++){const i=alive[x];for(let y=x+1;y<m;y++){const j=alive[y],q=(m-2)*d[i*n+j]-r[i]-r[j];if(q<best){best=q;bi=x;bj=y;}}}
    const i=alive[bi],j=alive[bj],dij=d[i*n+j],li=dij/2+(r[i]-r[j])/(2*(m-2));
    label[i]=`(${label[i]}:${len(li)},${label[j]}:${len(dij-li)})`;alive.splice(bj,1);r[i]=0;
    for(const k of alive){if(k===i)continue;const dk=(d[i*n+k]+d[j*n+k]-dij)/2;r[k]+=dk-d[i*n+k]-d[j*n+k];d[i*n+k]=d[k*n+i]=dk;r[i]+=dk;}
  }
  const [a,b,c]=alive,ab=d[a*n+b],ac=d[a*n+c],bc=d[b*n+c];
  return `(${label[a]}:${len((ab+ac-bc)/2)},${label[b]}:${len((ab+bc-ac)/2)},${label[c]}:${len((ac+bc-ab)/2)});`;
}
/** Neighbor-joining guide tree over `rows` (default every row) from p-distances, leaves named by row ID. For quick exploration: no distance correction, no bootstrap. */
export function neighborJoiningTree(a:Alignment,rows:number[]=a.rows.map((_,i)=>i)):NjTree {
  if(rows.length>MAX_NJ_ROWS)throw new Error(`A neighbor-joining tree is limited to ${MAX_NJ_ROWS} sequences; this view has ${rows.length}.`);
  if(new Set(rows).size!==rows.length)throw new Error('Select distinct sequence rows.');
  const d=pDistances(a,rows);let max=0,missing=0;
  for(const x of d)if(x>max)max=x;
  for(let k=0;k<d.length;k++)if(Number.isNaN(d[k])){d[k]=max||1;missing++;}
  return {newick:neighborJoining(d,rows.map(r=>a.rows[r].id)),rows:rows.length,missing:missing/2};
}
