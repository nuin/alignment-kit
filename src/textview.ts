import type { Alignment } from './types';
import { isGap, rowOffset } from './model';
import { displayCode } from './strand';

export const TEXT_CELL_LIMIT=200_000;
export interface TextViewOptions {
  /** Row indexes in display order. Default: every row. */
  rows?:number[];
  /** Zero-based alignment columns in display order. Default: every column, left to right. */
  columns?:ArrayLike<number>;
  /** Residues per line, 10 to 200. Default 60. */
  block?:number;
  /** Complement the letters of every row (reverse complement view). */
  reverse?:boolean;
  /** Row indexes whose letters are complemented, as in the grid's per-row strand. */
  flagged?:Set<number>;
  /** Most residues to write; rows past it are dropped and counted in `omitted`. Default 200,000. */
  limit?:number;
}
export interface TextView { text:string; rows:number; omitted:number }
const NAME_MAX=30;
/**
 * Plain text blocks of `block` columns: a line with the first and last alignment column of the block, then one line per row with the
 * name, the residues and the residue number (row offset applied) of the last residue in the block. Rows past the residue limit are left out.
 */
export function formatTextView(a:Alignment,options:TextViewOptions={}):TextView {
  const rows=options.rows??a.rows.map((_,i)=>i),cols=options.columns??Array.from({length:a.width},(_,i)=>i),count=cols.length;
  const block=Math.max(10,Math.min(200,Math.floor(options.block??60))),limit=options.limit??TEXT_CELL_LIMIT;
  const kept=count?rows.slice(0,Math.max(1,Math.floor(limit/count))):[],omitted=rows.length-kept.length;
  if(!kept.length)return {text:'',rows:0,omitted};
  const names=kept.map(r=>{const n=a.rows[r].name;return n.length>NAME_MAX?n.slice(0,NAME_MAX-1)+'…':n;}),pad=Math.max(...names.map(n=>n.length))+2;
  const lines=kept.map(r=>{
    const base=r*a.width,numbers=new Int32Array(a.width);let n=rowOffset(a.rows[r])-1;
    for(let c=0;c<a.width;c++){if(!isGap(a.codes[base+c]))n++;numbers[c]=n;}
    const flag=options.flagged?.has(r)??false,out:string[]=[];
    for(let from=0;from<count;from+=block){
      let s='',last:number|null=null;
      for(let d=from;d<Math.min(count,from+block);d++){const c=cols[d],code=a.codes[base+c];s+=String.fromCharCode(displayCode(a.alphabet,code,options.reverse??false,flag));if(!isGap(code))last=numbers[c];}
      out.push(s+(last===null?'':' '+last));
    }
    return out;
  });
  const out:string[]=[];
  for(let b=0,from=0;from<count;b++,from+=block){
    const first=String(cols[from]+1),end=String(cols[Math.min(count,from+block)-1]+1),span=Math.min(block,count-from);
    out.push(' '.repeat(pad)+first+(span>first.length+end.length?' '.repeat(span-first.length-end.length)+end:''));
    kept.forEach((_,i)=>out.push(names[i].padEnd(pad)+lines[i][b]));
    out.push('');
  }
  return {text:out.join('\n').trimEnd()+'\n',rows:kept.length,omitted};
}
