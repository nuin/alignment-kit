import type { Alignment, Alphabet, Sequence, SequenceInput, ParseOptions, Annotation, AlignmentMetadata } from './types';

export const isGap = (c:string|number) => c === '-' || c === '.' || c === 45 || c === 46;
const kinds=new Uint8Array(128).fill(4);
for(let c=65;c<=90;c++)kinds[c]=kinds[c+32]=0;
for(const [letters,k] of [['ACGNacgn',1],['Tt',2],['Uu',3]] as const)for(const ch of letters)kinds[ch.charCodeAt(0)]=k;
/** Tally slot of a character code: 0 a letter outside A, C, G, T, U, N; 1 A, C, G or N; 2 T; 3 U; 4 not a residue (gaps, `*`, anything else). */
export const residueKind=(code:number):number=>code<128?kinds[code]:4;
/** Alphabet from a tally indexed by `residueKind`. Nucleotide when at least 90% of the letters are A, C, G, T, U or N (RNA when U appears without T), so a protein made of IUPAC letters such as ASDHKVNM is protein. `other` is the share of letters outside that set. A tally with no letters gives dna and 0. */
export function alphabetOf(tally:ArrayLike<number>):{alphabet:Alphabet;other:number} {
  const residues=tally[0]+tally[1]+tally[2]+tally[3],other=residues?tally[0]/residues:0;
  return {alphabet:other>0.1?'protein':tally[3]&&!tally[2]?'rna':'dna',other};
}
export function createAlignment(input:SequenceInput[], options:ParseOptions & {annotations?:Annotation[];metadata?:AlignmentMetadata} = {}):Alignment {
  if (!input.length) throw new Error('An alignment needs at least one sequence.');
  const width = input[0].sequence.length;
  if (!width) throw new Error('The first sequence is empty.');
  if (width * input.length > 250_000_000) throw new Error('This alignment exceeds the 250 million cell input limit. Load a subset.');
  const codes = new Uint8Array(width * input.length);
  const ids = new Set<string>();
  let hash = 2166136261; const tally = [0,0,0,0,0];
  const rows = input.map((row, r) => {
    if(row.sequence.length !== width) throw new Error(`Sequence “${row.name}” has length ${row.sequence.length}; expected ${width}. Supply aligned sequences of equal length.`);
    const id = row.id ?? `seq-${r+1}`;
    if(ids.has(id)) throw new Error(`Duplicate sequence ID “${id}”. IDs must be unique; display names may repeat.`);
    ids.add(id);
    for (let c=0; c<width; c++) {
      let code = row.sequence.charCodeAt(c);
      if(code >= 97 && code <= 122) code -= 32;
      if(code === 46) code = 45;
      if(!((code>=65 && code<=90)||code===42||code===45)) throw new Error(`Invalid residue symbol in “${row.name}”, column ${c+1}.`);
      codes[r*width+c] = code;
      hash = Math.imul(hash ^ code,16777619);
      tally[kinds[code]]++;
    }
    for(const ch of id+row.name) hash = Math.imul(hash ^ ch.charCodeAt(0),16777619);
    return {...row,id};
  });
  const alphabet = options.alphabet ?? alphabetOf(tally).alphabet;
  const annotations = (options.annotations ?? []).map(a=>({...a}));
  for (const a of annotations) {
    if(a.rowId && !ids.has(a.rowId)) throw new Error(`Annotation “${a.id}” refers to unknown sequence “${a.rowId}”.`);
    if(a.mapping==='mapped' && (!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start!<1||a.end!<a.start!||a.end!>width)) throw new Error(`Annotation “${a.id}” has invalid alignment coordinates.`);
  }
  return {id:`${(hash>>>0).toString(16)}-${rows.length}-${width}-${alphabet}`,name:options.name??'Untitled alignment',alphabet,width,rows,codes,annotations,metadata:{...options.metadata,source:options.source??options.metadata?.source}};
}

function validateRow(a:Alignment,row:number) {
  if(!Number.isInteger(row)||row<0||row>=a.rows.length) throw new Error('Invalid sequence row.');
}
export function alignmentToSequence(a:Alignment,row:number,column:number):number|null {
  validateRow(a,row);
  if(!Number.isInteger(column)||column<1||column>a.width) throw new Error('Alignment coordinate is outside the alignment.');
  const offset=row*a.width;
  if(a.codes[offset+column-1]===45) return null;
  let position=0;
  for(let c=0;c<column;c++) if(a.codes[offset+c]!==45) position++;
  return position;
}
export function sequenceToAlignment(a:Alignment,row:number,position:number):number|null {
  validateRow(a,row);
  if(!Number.isInteger(position)||position<1) throw new Error('Sequence coordinate must be a positive integer.');
  let p=0;
  for(let c=0;c<a.width;c++) if(a.codes[row*a.width+c]!==45 && ++p===position) return c+1;
  return null;
}
/** Number of the first residue in a row: `metadata.start` when it is a positive integer, else 1. */
export const rowOffset=(row:Pick<Sequence,'metadata'>):number=>{const s=row.metadata?.start;return typeof s==='number'&&Number.isSafeInteger(s)&&s>=1?s:1;};
/** Residue number of a column in a row, honoring the row offset; null in a gap. */
export function columnToResidue(a:Alignment,row:number,column:number):number|null {
  const p=alignmentToSequence(a,row,column);return p===null?null:p+rowOffset(a.rows[row])-1;
}
/** Alignment column of a residue number in a row, honoring the row offset; null when the row has no such residue. */
export function residueToColumn(a:Alignment,row:number,residue:number):number|null {
  validateRow(a,row);if(!Number.isInteger(residue))return null;const p=residue-rowOffset(a.rows[row])+1;return p<1?null:sequenceToAlignment(a,row,p);
}
/** Alphabet the residues suggest, ignoring the alphabet set on the alignment; the rule is `alphabetOf`. Gaps and `*` are not residues. Large alignments are sampled at about one million cells. */
export function detectAlphabet(a:Pick<Alignment,'codes'>):{alphabet:Alphabet;other:number} {
  const codes=a.codes,step=Math.max(1,Math.floor(codes.length/1_000_000)),tally=[0,0,0,0,0];
  for(let i=0;i<codes.length;i+=step)tally[residueKind(codes[i])]++;
  return alphabetOf(tally);
}
