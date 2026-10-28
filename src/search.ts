import type { Alignment, Alphabet, Hit, SearchMode, SearchOptions, SearchResult } from './types';

export const MAX_HITS=10000;
const MAX_PATTERN=500;
const nucleotide:Record<string,string>={R:'AG',Y:'CTU',S:'CG',W:'ATU',K:'GTU',M:'AC',B:'CGTU',D:'AGTU',H:'ACTU',V:'ACG',T:'TU',U:'TU'};
const protein:Record<string,string>={B:'DN',Z:'EQ',J:'IL'};
const complement:Record<string,string>={A:'T',C:'G',G:'C',T:'A',U:'A',R:'Y',Y:'R',K:'M',M:'K',B:'V',V:'B',D:'H',H:'D'};
const escape=(text:string):string=>text.replace(/[\\^$.*+?()[\]{}|/-]/g,'\\$&');
const isNucleotide=(alphabet:Alphabet):boolean=>alphabet!=='protein';

function iupac(pattern:string,alphabet:Alphabet):string {
  const table=isNucleotide(alphabet)?nucleotide:protein,any=isNucleotide(alphabet)?'N':'X';
  return [...pattern.toUpperCase()].map(ch=>{
    if(ch===any)return '.';
    if(!/[A-Z*]/.test(ch)||(ch==='*'&&isNucleotide(alphabet)))throw new Error(`Unexpected “${ch}” in the pattern. Use letters${isNucleotide(alphabet)?'':' or *'}, /regex/, or PROSITE syntax such as N-{P}-[ST]-{P}.`);
    if(ch==='*')return '\\*';
    return table[ch]?`[${table[ch]}${table[ch].includes(ch)?'':ch}]`:ch;
  }).join('');
}

function repeat(text:string|undefined):string {
  if(text===undefined)return '';
  const m=/^\((\d+)(?:,(\d+))?\)$/.exec(text);
  if(!m||(m[2]!==undefined&&Number(m[2])<Number(m[1])))throw new Error(`Invalid PROSITE repeat ${text}.`);
  return m[2]===undefined?`{${m[1]}}`:`{${m[1]},${m[2]}}`;
}

function prosite(pattern:string):string {
  let text=pattern.trim().replace(/\.$/,''),head='',tail='';
  if(text.startsWith('<')){head='^';text=text.slice(1).replace(/^-/,'');}
  if(text.endsWith('>')&&!/\[[^\]]*>\]$/.test(text)){tail='$';text=text.slice(0,-1).replace(/-$/,'');}
  if(!text)throw new Error('PROSITE pattern has no elements.');
  const body=text.split('-').map(element=>{
    const m=/^(x|X|[A-Za-z]|\[([A-Za-z<>]+)\]|\{([A-Za-z]+)\})(\(\d+(?:,\d+)?\))?$/.exec(element);
    if(!m)throw new Error(`Invalid PROSITE element “${element}”.`);
    let core:string;
    if(m[2]!==undefined){
      const letters=m[2].toUpperCase().replace(/[<>]/g,''),start=m[2].includes('<'),end=m[2].includes('>');
      core=start||end?`(?:${[letters&&`[${letters}]`,start&&'^',end&&'$'].filter(Boolean).join('|')})`:`[${letters}]`;
    }
    else if(m[3]!==undefined)core=`[^${m[3].toUpperCase()}]`;
    else core=/^[xX]$/.test(m[1])?'.':m[1].toUpperCase();
    return core+repeat(m[4]);
  }).join('');
  return head+body+tail;
}

/** Count label for the status bar and Hits tab, such as "12 hits" or "10,000+ hits". */
export function hitCount(result:SearchResult):string {
  const n=result.hits.length;
  return `${n.toLocaleString()}${result.truncated?'+':''} ${n===1&&!result.truncated?'hit':'hits'}`;
}

/** The syntax auto mode picks: /.../ is a regex; '-' between elements, x, braces, brackets, parentheses, < or > is PROSITE; anything else is IUPAC. */
export function detectMode(pattern:string):Exclude<SearchMode,'auto'> {
  const text=pattern.trim();
  if(/^\/.+\/i?$/.test(text))return 'regex';
  if(/[-{}<>[\]()]|x/.test(text))return 'prosite';
  return 'iupac';
}

/** Compile a motif into a global, case-insensitive RegExp over ungapped residues. Throws a readable Error for invalid input. */
export function compilePattern(pattern:string,options:{alphabet:Alphabet;mode?:SearchMode}):RegExp {
  const text=pattern.trim(),mode=options.mode&&options.mode!=='auto'?options.mode:detectMode(text);
  if(!text)throw new Error('Enter a motif to search for.');
  if(text.length>MAX_PATTERN)throw new Error(`Patterns are limited to ${MAX_PATTERN} characters.`);
  let source:string;
  if(mode==='regex'){
    const m=/^\/(.+)\/i?$/.exec(text);
    try{return new RegExp(m?m[1]:text,'gi');}catch(error){throw new Error(`Invalid regular expression: ${(error as Error).message}`);}
  }
  if(mode==='literal')source=escape(text.toUpperCase());
  else if(mode==='prosite')source=prosite(text);
  else if(mode==='iupac')source=iupac(text,options.alphabet);
  else throw new Error(`Unknown search mode “${mode as string}”.`);
  return new RegExp(source,'gi');
}

function reverseComplement(sequence:string,alphabet:Alphabet):string {
  const t=alphabet==='rna'?'U':'T';let out='';
  for(let i=sequence.length-1;i>=0;i--){const c=complement[sequence[i]]??sequence[i];out+=c==='T'?t:c;}
  return out;
}

/** Search ungapped rows and report every match, overlapping included, with alignment columns (one-based, inclusive). Stops at 10,000 hits. */
export function findHits(alignment:Alignment,pattern:string,options:SearchOptions={}):SearchResult {
  const re=compilePattern(pattern,{alphabet:alignment.alphabet,mode:options.mode});
  const limit=Math.max(1,Math.min(MAX_HITS,Math.floor(options.limit??MAX_HITS))),both=isNucleotide(alignment.alphabet)&&options.strands!=='forward';
  const hits:Hit[]=[],width=alignment.width;
  for(const row of options.rows??alignment.rows.map((_,i)=>i)){
    const offset=row*width,columns:number[]=[];let sequence='';
    for(let c=0;c<width;c++){const code=alignment.codes[offset+c];if(code!==45){columns.push(c+1);sequence+=String.fromCharCode(code);}}
    const found:Hit[]=[],id=alignment.rows[row].id;
    for(const strand of both?(['+','-'] as const):(['+'] as const)){
      const text=strand==='+'?sequence:reverseComplement(sequence,alignment.alphabet),n=text.length;
      re.lastIndex=0;
      for(let m=re.exec(text);m;m=re.exec(text)){
        re.lastIndex=m.index+1;if(!m[0].length)continue;
        const from=strand==='+'?m.index:n-m.index-m[0].length,to=from+m[0].length-1;
        found.push({rowId:id,row,start:columns[from],end:columns[to],seqStart:from+1,seqEnd:to+1,strand,match:m[0]});
      }
    }
    found.sort((x,y)=>x.start-y.start||x.end-y.end);
    for(const hit of found){if(hits.length>=limit)return {hits,truncated:true};hits.push(hit);}
  }
  return {hits,truncated:false};
}
