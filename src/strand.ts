import type { Alphabet } from './types';

const swaps=['CG','RY','KM','BV','DH'],tables=new Map<Alphabet,Uint8Array>();
/** Complement of each ASCII code 0 to 127. A pairs with T (DNA) or U (RNA), T and U pair with A, and IUPAC codes swap in pairs (C/G, R/Y, K/M, B/V, D/H). Every other code, gaps included, maps to itself. */
export function complementTable(alphabet:Alphabet):Uint8Array {
  const cached=tables.get(alphabet);if(cached)return cached;
  const table=Uint8Array.from({length:128},(_,i)=>i);
  const set=(a:string,b:string)=>{table[a.charCodeAt(0)]=b.charCodeAt(0);table[b.charCodeAt(0)]=a.charCodeAt(0);};
  for(const [a,b] of swaps)set(a,b);
  if(alphabet==='rna'){set('A','U');table[84]=65;}else{set('A','T');table[85]=65;}
  tables.set(alphabet,table);return table;
}
/** Complement of a residue string, keeping case. Protein sequences have no complement and throw. */
export function complementSequence(sequence:string,alphabet:Alphabet):string {
  if(alphabet==='protein')throw new Error('Reverse complement needs a DNA or RNA alignment.');
  const table=complementTable(alphabet);let out='';
  for(let i=0;i<sequence.length;i++){const code=sequence.charCodeAt(i),lower=code>=97&&code<=122,up=lower?code-32:code,mapped=up<128?table[up]:up;out+=String.fromCharCode(lower?mapped+32:mapped);}
  return out;
}
/** Reverse complement of a residue string, keeping case and gaps. */
export const reverseComplementSequence=(sequence:string,alphabet:Alphabet):string=>[...complementSequence(sequence,alphabet)].reverse().join('');
/** Letter drawn for a residue code: complemented when the view and the row flag differ, as in the grid. Protein is never complemented. */
export const displayCode=(alphabet:Alphabet,code:number,reverse:boolean,flagged:boolean):number=>alphabet!=='protein'&&reverse!==flagged&&code<128?complementTable(alphabet)[code]:code;
