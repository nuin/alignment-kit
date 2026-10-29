import { createAlignment } from './model';
import type { Alignment, AlignmentMetadata, Alphabet, ParseOptions, ParseWarning, SequenceInput } from './types';

export function parseAlignment(text:string, options:ParseOptions={}):Alignment {
  const clean=text.replace(/^\uFEFF/,'').trim();
  const format=options.format??detectFormat(clean);
  if(!format) throw new Error('Unrecognized alignment format. Use aligned FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF or PIR. A3M insertion notation is not supported.');
  const rows:SequenceInput[]=[], metadata:AlignmentMetadata={format,headers:[]}, warnings:ParseWarning[]=[], lines:number[]=[];
  if(format==='fasta') {
    let current:SequenceInput|undefined;
    clean.split(/\r?\n/).forEach((line,i)=>{
      if(line.startsWith('>')) {
        const name=line.slice(1).trim();
        if(!name) throw new Error(`Missing FASTA name at line ${i+1}.`);
        current={name,sequence:''}; rows.push(current); lines.push(i+1);
      } else if(line.trim() && !line.startsWith(';')) {
        if(!current) throw new Error(`Sequence before FASTA header at line ${i+1}.`);
        current.sequence+=line.replace(/\s/g,'');
      }
    });
  } else if(format==='phylip') rows.push(...parsePhylip(clean));
  else if(format==='pir') rows.push(...parsePir(clean,lines));
  else if(format==='msf') {const msf=parseMsf(clean);rows.push(...msf.rows);options={...options,alphabet:options.alphabet??msf.alphabet};}
  else if(format==='nexus') {const nexus=parseNexus(clean);rows.push(...nexus.rows);options={...options,alphabet:options.alphabet??nexus.alphabet};}
  else {
    const byName=new Map<string,SequenceInput>();
    const dict = <T>():Record<string,T> => Object.create(null);
    const st={GF:dict<string[]>(),GS:dict<Record<string,string[]>>(),GC:dict<string>(),GR:dict<Record<string,string>>()};
    const seen=new Set<string>(),block=new Map<string,number>(); let expectedNames:string[]|undefined;
    const finishBlock=()=>{
      if(!block.size)return;
      if(new Set(block.values()).size!==1)throw new Error('Sequence lengths differ inside an alignment block.');
      const names=[...block.keys()];
      if(expectedNames && (names.length!==expectedNames.length||expectedNames.some(name=>!block.has(name))))throw new Error('Alignment blocks must contain the same sequence names.');
      expectedNames??=names;block.clear();
    };
    let terminated=false;
    for(const [i,line] of clean.split(/\r?\n/).entries()) {
      if(i===0) { metadata.headers!.push(line); continue; }
      if(!line.trim()) {finishBlock();continue;}
      if(line.trim()==='//') {finishBlock();terminated=true;continue;}
      if(terminated) throw new Error('Multiple Stockholm alignments in one file are not supported. Load one alignment at a time.');
      if(line.startsWith('#')) {
        const m=line.match(/^#=(GF|GS|GC|GR)\s+(\S+)\s+(.*)$/);
        if(m) {
          const [,kind,key,value]=m;
          if(kind==='GF')noteTag(warnings,seen,kind,key,i+1);
          if(kind==='GF') (st.GF[key]??=[]).push(value);
          if(kind==='GC') {noteTag(warnings,seen,kind,key,i+1);st.GC[key]=(st.GC[key]??'')+value.trim();}
          if(kind==='GS'||kind==='GR') {
            const sep=value.search(/\s/); if(sep<0) throw new Error(`Malformed Stockholm annotation at line ${i+1}.`);
            const tag=value.slice(0,sep),v=value.slice(sep).trim();
            noteTag(warnings,seen,kind,tag,i+1);
            if(kind==='GS') ((st.GS[key]??=dict<string[]>())[tag]??=[]).push(v);
            else (st.GR[key]??=dict<string>())[tag]=((st.GR[key]??=dict<string>())[tag]??'')+v;
          }
        } else {metadata.headers!.push(line);if(line.startsWith('#='))warnings.push({code:'unknown-stockholm-tag',message:`Unrecognized Stockholm line “${line.slice(0,40)}” kept in metadata.headers.`,line:i+1});}
        continue;
      }
      if(format==='clustal' && /^\s+[*:.\s]+$/.test(line)) continue;
      const m=line.trim().match(/^(\S+)\s+(\S+)(?:\s+\d+)?\s*$/);
      if(!m) throw new Error(`Malformed ${format} sequence at line ${i+1}.`);
      const [,name,sequence]=m;
      if(block.has(name))throw new Error(`Duplicate sequence “${name}” in alignment block at line ${i+1}. Separate interleaved blocks with a blank line.`);
      block.set(name,sequence.length);
      if(!byName.has(name)) {const row={name,sequence:''};byName.set(name,row);rows.push(row);lines.push(i+1);}
      byName.get(name)!.sequence+=sequence;
    }
    finishBlock();
    if(format==='stockholm') {
      if(!terminated) throw new Error('Stockholm alignment is missing its // terminator.');
      metadata.stockholm=st;
      const width=rows[0]?.sequence.length;
      for(const [tag,value] of Object.entries(st.GC)) if(value.length!==width) throw new Error(`Stockholm column annotation ${tag} has length ${value.length}; expected ${width}.`);
      for(const name of [...Object.keys(st.GS),...Object.keys(st.GR)]) if(!byName.has(name))throw new Error(`Stockholm annotation refers to unknown sequence “${name}”.`);
      for(const [name,tags] of Object.entries(st.GR))for(const [tag,value] of Object.entries(tags))if(value.length!==width)throw new Error(`Stockholm residue annotation ${name} ${tag} has length ${value.length}; expected ${width}.`);
      for(const row of rows){const m=row.name.match(/^.+\/(\d+)-(\d+)$/),start=m?Number(m[1]):0;if(m&&Number.isSafeInteger(start)&&start>=1&&start<=Number(m[2]))row.metadata={...row.metadata,start};}
      options={...options,name:options.name??st.GF.ID?.[0]};
    }
  }
  repairRows(rows,warnings,lines,options,format);
  if(warnings.length)metadata.warnings=warnings;
  return createAlignment(rows,{...options,metadata});
}

const known={GF:'ID AC DE AU SE GA TC NC TP SQ DC DR RC RN RM RT RA RL PI KW CC NE NH BM SM DT WK CB MB OS OC LO',GS:'WT AC DE DR OS OC LO ID',GR:'SS SA TM PP LI AS pAS sAS IN',GC:'RF SS_cons SA_cons TM_cons PP_cons AS_cons MM seq_cons'};
const noteTag=(warnings:ParseWarning[],seen:Set<string>,kind:string,tag:string,line:number)=>{
  const key=kind+' '+tag;if(seen.has(key))return;seen.add(key);
  if(!known[kind as keyof typeof known].split(' ').includes(tag))warnings.push({code:'unknown-stockholm-tag',message:`Unknown #=${kind} tag “${tag}” kept in metadata.stockholm.`,line});
};
/** Fix what can be fixed without failing: replace invalid residue characters, pad short rows when `padShort` is set, rename repeated names. Stockholm and CLUSTAL names are keys and never repeat. */
function repairRows(rows:SequenceInput[],warnings:ParseWarning[],lines:number[],options:ParseOptions,format:string):void {
  const at=(i:number)=>lines[i]?{line:lines[i]}:{},id=(i:number)=>rows[i].id??`seq-${i+1}`,bad=/[^A-Za-z*.-]/g;
  const nucleotide=options.alphabet?options.alphabet!=='protein':rows.every(r=>/^[ACGTUNRYKMSWBDHV.-]*$/i.test(r.sequence.replace(bad,'')));
  const fill=nucleotide?'N':'X';
  rows.forEach((row,i)=>{
    const first=row.sequence.search(bad);if(first<0)return;
    const count=row.sequence.match(bad)!.length;
    warnings.push({code:'invalid-residue',message:`Replaced ${count} invalid residue character${count===1?'':'s'} in “${row.name}” with ${fill}; the first is “${row.sequence[first]}” at column ${first+1}.`,...at(i),rowId:id(i)});
    row.sequence=row.sequence.replace(bad,fill);
  });
  if(options.padShort){
    const width=Math.max(...rows.map(r=>r.sequence.length));
    rows.forEach((row,i)=>{if(row.sequence.length<width){warnings.push({code:'unequal-length',message:`“${row.name}” has ${row.sequence.length} columns; padded with gaps to ${width}.`,...at(i),rowId:id(i)});row.sequence=row.sequence.padEnd(width,'-');}});
  }
  if(format!=='fasta'&&format!=='phylip'&&format!=='pir')return;
  const used=new Set(rows.map(r=>r.name)),seen=new Set<string>();
  rows.forEach((row,i)=>{
    if(!seen.has(row.name)){seen.add(row.name);return;}
    let n=2;while(used.has(`${row.name}_${n}`))n++;
    const name=`${row.name}_${n}`;used.add(name);seen.add(name);
    warnings.push({code:'duplicate-id',message:`Duplicate sequence name “${row.name}” renamed to “${name}”.`,...at(i),rowId:id(i)});row.name=name;
  });
}

function detectFormat(t:string):ParseOptions['format'] {
  if(/^>[A-Za-z0-9]{2};/.test(t)&&/\*[ \t]*$/m.test(t.split(/\r?\n>/,1)[0]))return 'pir';
  if(t.startsWith('>'))return 'fasta';
  if(t.startsWith('# STOCKHOLM'))return 'stockholm';
  if(/^(CLUSTAL|MUSCLE)/i.test(t))return 'clustal';
  if(/^#NEXUS\b/i.test(t))return 'nexus';
  if(/^!!(AA|NA)_MULTIPLE_ALIGNMENT/.test(t)||/\bMSF:\s*\d+.*\bCheck:\s*\d+.*\.\.\s*$/m.test(t))return 'msf';
  if(/^\d+\s+\d+(\s+[A-Za-z]+)?\s*$/.test(t.split(/\r?\n/,1)[0]))return 'phylip';
}
const strip=(s:string)=>s.replace(/\s/g,'');
const checkRows=(rows:SequenceInput[],n:number|undefined,m:number|undefined,label:string)=>{
  if((n!==undefined&&rows.length!==n)||rows.some(r=>!r.name||(m!==undefined&&r.sequence.length!==m)))throw new Error(`${label} does not contain ${n??'the expected number of'} sequences of ${m??'equal'} columns.`);
  return rows;
};
function parsePhylip(text:string):SequenceInput[] {
  const [head,...body]=text.split(/\r?\n/).filter(l=>l.trim()),h=head.trim().split(/\s+/),n=Number(h[0]),m=Number(h[1]);
  if(!(n>0&&m>0))throw new Error('Malformed PHYLIP header. Expected the sequence count and the column count.');
    const attempt=(strict:boolean,interleaved:boolean)=>{
    const rows:SequenceInput[]=[],named=(line:string)=>{const [name,rest]=strict?[line.slice(0,10).trim(),line.slice(10)]:line.trim().match(/^(\S+)\s*(.*)$/)!.slice(1);return {name,sequence:strip(rest)};};
    for(const [i,line] of body.entries()) {
      if(interleaved){if(i<n)rows.push(named(line));else rows[(i-n)%n].sequence+=strip(line);}
      else if(rows.length&&rows[rows.length-1].sequence.length<m)rows[rows.length-1].sequence+=strip(line);
      else rows.push(named(line));
    }
    return checkRows(rows,n,m,'PHYLIP data');
  };
  for(const [strict,interleaved] of [[false,false],[false,true],[true,false],[true,true]])try{
    return attempt(strict,interleaved);
  }catch{ /* Try the next PHYLIP layout. */ }
  throw new Error(`Malformed PHYLIP alignment. Expected ${n} sequences of ${m} columns, with relaxed or 10-character names, sequential or interleaved.`);
}
function parsePir(text:string,lines:number[]):SequenceInput[] {
  const rows:SequenceInput[]=[];let current:SequenceInput|undefined,state=0;
  for(const [i,raw] of text.split(/\r?\n/).entries()) {
    const line=raw.trim(),m=line.match(/^>[A-Za-z0-9]{2};\s*(.*)$/);
    if(m){if(!m[1])throw new Error(`Missing PIR identifier at line ${i+1}.`);current={name:m[1],sequence:''};rows.push(current);lines.push(i+1);state=1;continue;}
    if(!line){if(state===1)state=2;continue;}
    if(!current)throw new Error(`Sequence before PIR header at line ${i+1}.`);
    if(state===1){state=2;continue;}
    if(state===2){const end=line.indexOf('*');current.sequence+=strip(end<0?line:line.slice(0,end));if(end>=0)state=3;}
  }
  return checkRows(rows,undefined,undefined,'PIR data');
}
function parseMsf(text:string):{rows:SequenceInput[];alphabet?:Alphabet} {
  const lines=text.split(/\r?\n/),cut=lines.findIndex(l=>l.trim()==='//');
  if(cut<0)throw new Error('MSF alignment is missing its // separator.');
  const rows=new Map<string,SequenceInput>(),type=lines.slice(0,cut).join('\n').match(/\bType:\s*([PN])/i)?.[1].toUpperCase();
  for(const line of lines.slice(0,cut)){const m=line.match(/^\s*Name:\s*(\S+)/);if(m)rows.set(m[1],{name:m[1],sequence:''});}
  for(const line of lines.slice(cut+1)) {
    if(!line.trim()||/^\s*\d+(\s+\d+)?\s*$/.test(line))continue;
    const m=line.trim().match(/^(\S+)\s+(.+)$/);if(!m)throw new Error(`Malformed MSF sequence line “${line.trim()}”.`);
    let row=rows.get(m[1]);if(!row)rows.set(m[1],row={name:m[1],sequence:''});
    row.sequence+=strip(m[2]).replace(/[.~]/g,'-');
  }
  return {rows:checkRows([...rows.values()],undefined,undefined,'MSF data'),alphabet:type==='P'?'protein':undefined};
}
const stripNexusComments=(text:string)=>{
  let out='',depth=0,quote=false;
  for(const c of text){
    if(depth===0&&c==="'")quote=!quote;
    if(!quote&&c==='['){depth++;continue;}
    if(!quote&&c===']'&&depth){depth--;continue;}
    if(!depth)out+=c;
  }
  return out;
};
const nexusCommands=(text:string)=>{
  const out:string[]=[];let cur='',quote=false;
  for(const c of text){if(c==="'")quote=!quote;if(c===';'&&!quote){out.push(cur);cur='';}else cur+=c;}
  return out;
};
function nexusName(line:string):[string,string] {
  const q=line.match(/^\s*'((?:[^']|'')*)'\s*(.*)$/);
  if(q)return [q[1].replace(/''/g,"'"),q[2]];
  const m=line.trim().match(/^(\S+)\s*(.*)$/);
  return m?[m[1],m[2]]:['',''];
}
function parseNexus(text:string):{rows:SequenceInput[];alphabet?:Alphabet} {
  const block=nexusCommands(stripNexusComments(text).replace(/^\s*#NEXUS/i,'')).map(c=>c.trim());
  const begin=block.findIndex(c=>/^begin\s+(data|characters)$/i.test(c));
  if(begin<0)throw new Error('NEXUS file has no DATA or CHARACTERS block.');
  const opts:Record<string,string>={};let matrix:string|undefined,ntax:number|undefined,nchar:number|undefined;
  for(const cmd of block.slice(begin+1)) {
    const key=cmd.match(/^(\w+)\s*([\s\S]*)$/);if(!key)continue;
    const word=key[1].toLowerCase(),rest=key[2];
    if(word==='end'||word==='endblock')break;
    if(word==='matrix'){matrix=rest;break;}
    if(word==='dimensions'){ntax=Number(rest.match(/ntax\s*=\s*(\d+)/i)?.[1])||undefined;nchar=Number(rest.match(/nchar\s*=\s*(\d+)/i)?.[1])||undefined;}
    if(word==='format')for(const m of rest.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|(\S+))/g))opts[m[1].toLowerCase()]=m[2]??m[3];
    if(word==='format'&&/\binterleave\b(?!\s*=)/i.test(rest))opts.interleave='yes';
  }
  if(matrix===undefined)throw new Error('NEXUS block has no MATRIX command.');
  const lines=matrix.split(/\r?\n/).filter(l=>l.trim());
  const attempt=(wrapped:boolean)=>{
    const rows:SequenceInput[]=[],byName=new Map<string,SequenceInput>();
    for(const line of lines) {
      const last=rows[rows.length-1];
      if(wrapped&&last&&nchar!==undefined&&last.sequence.length<nchar){last.sequence+=strip(line);continue;}
      const [name,rest]=nexusName(line);let row=byName.get(name);
      if(!row){row={name,sequence:''};byName.set(name,row);rows.push(row);}
      row.sequence+=strip(rest);
    }
    return checkRows(rows,ntax,nchar,'NEXUS matrix');
  };
  let rows:SequenceInput[]|undefined;
  for(const wrapped of /^(yes|true|on)$/i.test(opts.interleave??'')?[false]:[false,true])try{rows=attempt(wrapped);break;}catch{ /* Try the next matrix layout. */ }
  if(!rows)throw new Error(`NEXUS matrix does not contain ${ntax??'the declared number of'} sequences of ${nchar??'equal'} columns.`);
  const match=opts.matchchar,gap=opts.gap,missing=opts.missing??'?',first=rows[0].sequence;
  for(const [r,row] of rows.entries()) {
    let seq='';
    for(let c=0;c<row.sequence.length;c++) {
      let ch=row.sequence[c];
      if(match&&ch===match){if(!r)throw new Error('NEXUS matchchar cannot appear in the first sequence.');ch=first[c];}
      seq+=(gap&&ch===gap)||(missing&&ch===missing)?'-':ch;
    }
    row.sequence=seq;
  }
  const type=opts.datatype?.toLowerCase();
  return {rows,alphabet:type==='protein'?'protein':type==='dna'?'dna':type==='rna'?'rna':undefined};
}

export async function readAlignmentInput(input:Blob|ArrayBuffer|string):Promise<string> {
  if(typeof input==='string') return input;
  const buffer=input instanceof Blob?await input.arrayBuffer():input;
  const bytes=new Uint8Array(buffer);
  const decode=(data:ArrayBuffer)=>new TextDecoder('utf-8',{fatal:true}).decode(data);
  if(bytes[0]===31 && bytes[1]===139) {
    const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return decode(await new Response(stream).arrayBuffer());
  }
  return decode(buffer);
}
