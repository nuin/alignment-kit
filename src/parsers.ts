import { createAlignment } from './model';
import type { Alignment, AlignmentMetadata, ParseOptions, SequenceInput } from './types';

export function parseAlignment(text:string, options:ParseOptions={}):Alignment {
  const clean=text.replace(/^\uFEFF/,'').trim();
  const format=options.format??(clean.startsWith('>')?'fasta':clean.startsWith('# STOCKHOLM')?'stockholm':/^(CLUSTAL|MUSCLE)/i.test(clean)?'clustal':undefined);
  if(!format) throw new Error('Unrecognized alignment format. Use aligned FASTA, Stockholm or CLUSTAL. A3M insertion notation is not supported.');
  const rows:SequenceInput[]=[], metadata:AlignmentMetadata={format,headers:[]};
  if(format==='fasta') {
    let current:SequenceInput|undefined;
    clean.split(/\r?\n/).forEach((line,i)=>{
      if(line.startsWith('>')) {
        const name=line.slice(1).trim();
        if(!name) throw new Error(`Missing FASTA name at line ${i+1}.`);
        current={name,sequence:''}; rows.push(current);
      } else if(line.trim() && !line.startsWith(';')) {
        if(!current) throw new Error(`Sequence before FASTA header at line ${i+1}.`);
        current.sequence+=line.replace(/\s/g,'');
      }
    });
  } else {
    const byName=new Map<string,SequenceInput>();
    const dict = <T>():Record<string,T> => Object.create(null);
    const st={GF:dict<string[]>(),GS:dict<Record<string,string[]>>(),GC:dict<string>(),GR:dict<Record<string,string>>()};
    const block=new Map<string,number>(); let expectedNames:string[]|undefined;
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
          if(kind==='GF') (st.GF[key]??=[]).push(value);
          if(kind==='GC') st.GC[key]=(st.GC[key]??'')+value.trim();
          if(kind==='GS'||kind==='GR') {
            const sep=value.search(/\s/); if(sep<0) throw new Error(`Malformed Stockholm annotation at line ${i+1}.`);
            const tag=value.slice(0,sep),v=value.slice(sep).trim();
            if(kind==='GS') ((st.GS[key]??=dict<string[]>())[tag]??=[]).push(v);
            else (st.GR[key]??=dict<string>())[tag]=((st.GR[key]??=dict<string>())[tag]??'')+v;
          }
        } else metadata.headers!.push(line);
        continue;
      }
      if(format==='clustal' && /^\s+[*:.\s]+$/.test(line)) continue;
      const m=line.trim().match(/^(\S+)\s+([A-Za-z.*-]+)(?:\s+\d+)?\s*$/);
      if(!m) throw new Error(`Malformed ${format} sequence at line ${i+1}.`);
      const [,name,sequence]=m;
      if(block.has(name))throw new Error(`Duplicate sequence “${name}” in alignment block at line ${i+1}. Separate interleaved blocks with a blank line.`);
      block.set(name,sequence.length);
      if(!byName.has(name)) {const row={name,sequence:''};byName.set(name,row);rows.push(row);}
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
      options={...options,name:options.name??st.GF.ID?.[0]};
    }
  }
  return createAlignment(rows,{...options,metadata});
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
