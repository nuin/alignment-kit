import type { Alignment, SequenceInput, ParseOptions, Annotation, AlignmentMetadata } from './types';

export const isGap = (c:string|number) => c === '-' || c === '.' || c === 45 || c === 46;
export function createAlignment(input:SequenceInput[], options:ParseOptions & {annotations?:Annotation[];metadata?:AlignmentMetadata} = {}):Alignment {
  if (!input.length) throw new Error('An alignment needs at least one sequence.');
  const width = input[0].sequence.length;
  if (!width) throw new Error('The first sequence is empty.');
  if (width * input.length > 250_000_000) throw new Error('This alignment exceeds the 250 million cell input limit. Load a subset.');
  const codes = new Uint8Array(width * input.length);
  const ids = new Set<string>();
  let hash = 2166136261, nucleotide = true, hasU = false, hasT = false;
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
      if(!'ACGTUNRYKMSWBDHV-'.includes(String.fromCharCode(code))) nucleotide = false;
      if(code===85) hasU=true;
      if(code===84) hasT=true;
    }
    for(const ch of id+row.name) hash = Math.imul(hash ^ ch.charCodeAt(0),16777619);
    return {...row,id};
  });
  const alphabet = options.alphabet ?? (nucleotide ? (hasU && !hasT ? 'rna':'dna') : 'protein');
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
