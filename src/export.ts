import type { VariableColumnResult, Alignment, AlignmentStats, ExportRegion, ExportOptions, ColorMode, FastaOptions, Sequence } from './types';
import { columnDetail } from './analysis';
import { isGap } from './model';
import { reverseComplementSequence } from './strand';
import { getColorScheme, residueColor, dynamicColor, dynamicSchemes, textColor } from './colors';
import { annotationColor } from './variants';
export const escapeXml=(s:unknown)=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
export function resolveRegion(a:Alignment,region:ExportRegion={}) {
  const start=region.start??1,end=region.end??a.width;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>a.width) throw new Error('Export range must use valid inclusive alignment coordinates.');
  const byId=new Map(a.rows.map((r,i)=>[r.id,i]));
  const rows=region.rowIds?region.rowIds.map(id=>{const r=byId.get(id);if(r===undefined)throw new Error(`Unknown export sequence “${id}”.`);return r;}):a.rows.map((_,i)=>i);
  if(new Set(rows).size!==rows.length)throw new Error('Export rows must be unique.');
  const mask=region.columns;
  if(mask&&mask.length!==a.width)throw new Error('Export column mask must have one entry per alignment column.');
  const columns=mask?Array.from({length:end-start+1},(_,i)=>start-1+i).filter(c=>mask[c]):undefined;
  if(columns&&!columns.length)throw new Error('No visible columns in the export range.');
  return {start,end,rows,columns};
}
/** The columns of an aligned sequence that a resolved region keeps. */
const cut=(sequence:string,r:ReturnType<typeof resolveRegion>)=>r.columns?r.columns.map(c=>sequence[c]).join(''):sequence.slice(r.start-1,r.end);
const fastaChoices={gaps:['keep','remove'],letterCase:['original','upper','lower'],header:['name','name-species','id-name'],orientation:['source','reverse-complement']};
/** Validate export settings from untrusted input; returns a copy. */
export function validateExportOptions(input:unknown):ExportOptions {
  if(typeof input!=='object'||input===null||Array.isArray(input))throw new Error('Export options must be an object.');
  const result:ExportOptions={};
  for(const [key,value] of Object.entries(input)){if(key!=='columns'||(value!=='all'&&value!=='visible'))throw new Error(`Invalid export option ${key}.`);result.columns=value;}
  return result;
}
/** Validate FASTA settings from untrusted input; returns a copy. */
export function validateFastaOptions(input:unknown):FastaOptions {
  if(typeof input!=='object'||input===null||Array.isArray(input))throw new Error('FASTA options must be an object.');
  const result:Record<string,unknown>={};
  for(const [key,value] of Object.entries(input)){
    if(key==='columns'){if(value!=='all'&&value!=='visible')throw new Error('Invalid FASTA option columns.');}
    else if(key==='lineWidth'){if(typeof value!=='number'||!Number.isInteger(value)||(value!==0&&(value<10||value>1000)))throw new Error('FASTA line width must be 0 (unwrapped) or 10 to 1000.');}
    else if(!Object.hasOwn(fastaChoices,key)||!(fastaChoices[key as keyof typeof fastaChoices] as string[]).includes(value as string))throw new Error(`Invalid FASTA option ${key}.`);
    result[key]=value;
  }
  return result as FastaOptions;
}
const headers={name:(r:Sequence)=>r.name,'name-species':(r:Sequence)=>r.species?`${r.name} ${r.species}`:r.name,'id-name':(r:Sequence)=>`${r.id} ${r.name}`};
/** One FASTA record with gap removal, case and line width applied. */
export function formatFastaRecord(header:string,sequence:string,options:FastaOptions={}):string {
  validateFastaOptions(options);const width=options.lineWidth??80;
  let seq=options.gaps==='remove'?sequence.replace(/[-.]/g,''):sequence;
  if(options.letterCase==='upper')seq=seq.toUpperCase();else if(options.letterCase==='lower')seq=seq.toLowerCase();
  const lines=width?seq.match(new RegExp(`.{1,${width}}`,'g'))??[]:seq?[seq]:[];
  return `>${header.replace(/[\r\n]/g,' ')}\n${lines.map(line=>line+'\n').join('')}`;
}
export function exportFasta(a:Alignment,region:ExportRegion={},options:FastaOptions={}):string {
  validateFastaOptions(options);const resolved=resolveRegion(a,region),header=headers[options.header??'name'],flip=options.orientation==='reverse-complement';
  return resolved.rows.map(r=>{const sequence=cut(a.rows[r].sequence,resolved);return formatFastaRecord(header(a.rows[r])+(flip?' (reverse complement)':''),flip?reverseComplementSequence(sequence,a.alphabet):sequence,options);}).join('');
}
const plainName=(name:string)=>name.replace(/\s+/g,'_').replace(/^#/,'_')||'seq';
const uniqueNames=(names:string[])=>{
  const used=new Set<string>(),seen=new Map<string,number>();
  return names.map(name=>{
    let out=name,n=seen.get(name)??1;
    while(used.has(out))out=`${name}_${++n}`;
    seen.set(name,n);used.add(out);return out;
  });
};
function textRows(a:Alignment,region:ExportRegion) {
  const resolved=resolveRegion(a,region),{rows}=resolved;
  if(!rows.length)throw new Error('Select at least one row to export.');
  const sequences=rows.map(r=>cut(a.rows[r].sequence,resolved));
  return {width:sequences[0].length,rows:rows.map((r,i)=>({name:a.rows[r].name,sequence:sequences[i]}))};
}
const padNames=(names:string[],extra:number)=>names.reduce((max,n)=>Math.max(max,n.length),0)+extra;
/** CLUSTAL text with 60-column blocks; `*` marks columns where every row carries the same non-gap residue. Whitespace in names becomes `_` and repeated names get `_2`, `_3` suffixes. */
export function exportClustal(a:Alignment,region:ExportRegion={}):string {
  const {width,rows}=textRows(a,region),names=uniqueNames(rows.map(r=>plainName(r.name))),pad=padNames(names,6),out=['CLUSTAL W (1.83) multiple sequence alignment\n\n'];
  for(let from=0;from<width;from+=60) {
    rows.forEach((r,i)=>out.push(names[i].padEnd(pad)+r.sequence.slice(from,from+60)+'\n'));
    let cons='';
    for(let c=from;c<Math.min(width,from+60);c++){const first=rows[0].sequence[c].toUpperCase();cons+=!isGap(first)&&rows.every(r=>r.sequence[c].toUpperCase()===first)?'*':' ';}
    out.push(' '.repeat(pad)+cons.trimEnd()+'\n\n');
  }
  return out.join('').replace(/\n\n$/,'\n');
}
/** Stockholm 1.0 with one unwrapped sequence line per row. An alignment parsed from Stockholm also writes back its comment lines and every #=GF, #=GS, #=GR and #=GC tag, known or not, cut to the exported rows and columns. */
export function exportStockholm(a:Alignment,region:ExportRegion={}):string {
  const {rows}=textRows(a,region),names=uniqueNames(rows.map(r=>plainName(r.name))),pad=padNames(names,2),st=a.metadata.stockholm;
  if(!st)return `# STOCKHOLM 1.0\n${rows.map((r,i)=>names[i].padEnd(pad)+r.sequence+'\n').join('')}//\n`;
  const resolved=resolveRegion(a,region),orig=resolved.rows.map(r=>a.rows[r].name),out=[`# STOCKHOLM 1.0\n`];
  const gr=names.flatMap((n,i)=>Object.entries(st.GR[orig[i]]??{}).map(([tag,v])=>[`#=GR ${n} ${tag}`,cut(v,resolved)] as const));
  const gc=Object.entries(st.GC).map(([tag,v])=>[`#=GC ${tag}`,cut(v,resolved)] as const);
  const w=Math.max(pad,...gr.map(([l])=>l.length+1),...gc.map(([l])=>l.length+1));
  for(const h of a.metadata.headers?.slice(1)??[])out.push(h+'\n');
  for(const [tag,values] of Object.entries(st.GF))for(const v of values)out.push(`#=GF ${tag} ${v}\n`);
  names.forEach((n,i)=>{for(const [tag,values] of Object.entries(st.GS[orig[i]]??{}))for(const v of values)out.push(`#=GS ${n} ${tag} ${v}\n`);});
  rows.forEach((r,i)=>{out.push(names[i].padEnd(w)+r.sequence+'\n');for(const [label,v] of gr.filter(([l])=>l.startsWith(`#=GR ${names[i]} `)))out.push(label.padEnd(w)+v+'\n');});
  for(const [label,v] of gc)out.push(label.padEnd(w)+v+'\n');
  return out.join('')+'//\n';
}
const uniqueStrictNames=(names:string[])=>{
  const used=new Set<string>();
  return names.map(name=>{
    let out=name.slice(0,10),n=0;
    while(used.has(out)){const suffix=String(++n);out=name.slice(0,10-suffix.length)+suffix;}
    used.add(out);return out;
  });
};
/** PHYLIP with one line per sequence. `strict` pads names to 10 characters, truncates longer names and appends numeric suffixes to keep them unique. */
export function exportPhylip(a:Alignment,region:ExportRegion={},options:{variant?:'relaxed'|'strict'}={}):string {
  if(options.variant!==undefined&&options.variant!=='relaxed'&&options.variant!=='strict')throw new Error('PHYLIP variant must be relaxed or strict.');
  const {width,rows}=textRows(a,region),names=rows.map(r=>plainName(r.name)),strict=options.variant==='strict',pad=strict?10:padNames(names,2);
  const labels=(strict?uniqueStrictNames(names):names).map(n=>n.padEnd(pad));
  return `${rows.length} ${width}\n${rows.map((r,i)=>labels[i]+r.sequence+'\n').join('')}`;
}
const nexusName=(name:string)=>/^[A-Za-z0-9_.]+$/.test(name)?name:`'${name.replace(/[\r\n]+/g,' ').replace(/'/g,"''")}'`;
/** NEXUS DATA block with gap `-`, missing `?` and quoted names where needed. `.` gaps are written as `-`. */
export function exportNexus(a:Alignment,region:ExportRegion={}):string {
  const {width,rows}=textRows(a,region),names=uniqueNames(rows.map(r=>r.name.replace(/[\r\n]+/g,' '))).map(nexusName),pad=padNames(names,2);
  return `#NEXUS\nBEGIN DATA;\n  DIMENSIONS NTAX=${rows.length} NCHAR=${width};\n  FORMAT DATATYPE=${a.alphabet.toUpperCase()} GAP=- MISSING=?;\n  MATRIX\n${rows.map((r,i)=>`    ${names[i].padEnd(pad)}${r.sequence.replace(/\./g,'-')}\n`).join('')}  ;\nEND;\n`;
}
/** Per-column statistics; `region.columns` (a mask as in ExportRegion) limits the rows to kept columns. */
export function exportStatistics(s:AlignmentStats,region:Pick<ExportRegion,'columns'>={}):string {
  const mask=region.columns;
  if(mask&&mask.length!==s.width)throw new Error('Export column mask must have one entry per alignment column.');
  if(mask&&!Array.prototype.some.call(mask,Boolean))throw new Error('No visible columns in the export range.');
  const lines=['column\trows\tgap_count\tgap_fraction\tconsensus\tmodal_frequency_non_gap\tconsensus_support_all_rows\tentropy_bits\tinformation_bits\tquality'];
  for(let c=1;c<=s.width;c++){if(mask&&!mask[c-1])continue;const d=columnDetail(s,c);lines.push([c,d.total,d.gapCount,d.gapFraction??'NA',d.tied?'tie':d.consensus??'NA',d.frequency??'NA',d.support??'NA',d.entropy??'NA',d.information??'NA',d.quality??'NA'].join('\t'));}
  return lines.join('\n')+'\n';
}
/** Display index ranges (inclusive) of consecutive kept columns inside the one-based alignment columns left to right. */
function runs(cols:number[],left:number,right:number):[number,number][] {
  const out:[number,number][]=[];
  cols.forEach((col,i)=>{if(col+1<left||col+1>right)return;const last=out[out.length-1];if(last&&last[1]===i-1&&cols[i-1]===col-1)last[1]=i;else out.push([i,i]);});
  return out;
}
/** Tab-separated variable-column table: column, reference residue number and letter, alleles as residue:count, gap count and class. */
export function exportVariableColumns(r:VariableColumnResult):string {
  return ['column\treference_residue_number\treference_residue\talleles\tgap_count\tclass',...r.columns.map(c=>[c.column,c.referenceResidue??'NA',c.reference,c.alleles.map(x=>`${x.residue}:${x.count}`).join(','),c.gapCount,c.kind].join('\t'))].join('\n')+'\n';
}
export interface FigureOptions { colorMode?:ColorMode; referenceId?:string; matchDisplay?:'letter'|'dot'; colorThreshold?:number; consensusThreshold?:number }
export function exportSvg(a:Alignment,s:AlignmentStats,region:ExportRegion={},schemeId='soft',options:FigureOptions={}):string {
  const {start,end,rows,columns}=resolveRegion(a,region),cols=columns??Array.from({length:end-start+1},(_,i)=>start-1+i),count=cols.length,masked=!!columns&&count<end-start+1;
  if(!rows.length)throw new Error('Select at least one row to export.');
  if(count*rows.length>200000)throw new Error('Figure export is limited to 200,000 cells. Narrow the selected rows or columns.');
  const cw=16,rh=22,gutter=250,top=72,width=gutter+count*cw+24,height=top+rows.length*rh+100,scheme=getColorScheme(schemeId);
  const dynamic=dynamicSchemes.has(schemeId),colorThreshold=options.colorThreshold??0,consensusThreshold=options.consensusThreshold??0,mode=options.colorMode??'all',ref=options.referenceId?a.rows.findIndex(r=>r.id===options.referenceId):0;
  const wantDots=options.matchDisplay==='dot',byRef=!mode.startsWith('consensus');
  if((mode.startsWith('reference')||wantDots&&byRef)&&ref<0)throw new Error('Unknown figure reference.');
  const dots=wantDots&&(!byRef||rows.includes(ref));
  const chunks=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escapeXml(a.name)}</title><metadata>${escapeXml(JSON.stringify({source:a.metadata.source,alphabet:a.alphabet,start,end,...(masked?{columns:'visible',hiddenColumns:end-start+1-count}:{}),statisticsRows:s.total,definition:'Consensus support = modal non-gap count / all rows in statistics scope',palette:scheme.label,colorMode:mode,matchDisplay:dots?'dot':'letter',referenceId:a.rows[ref]?.id}))}</metadata><rect width="100%" height="100%" fill="#ffffff"/><g font-family="monospace" font-size="12" fill="#243447"><text x="16" y="25" font-size="17">${escapeXml(a.name)}</text><text x="16" y="46">Alignment columns ${start}–${end}${masked?` (${count} visible)`:''} · ${rows.length} sequences · ${a.alphabet}</text>`];
  cols.forEach((col,i)=>{const c=col+1;if(i===0||c%10===0)chunks.push(`<text x="${gutter+i*cw}" y="${top-8}">${c}</text>`);});
  const used=new Set<string>();
  for(const [j,r] of rows.entries()) {
    const y=top+j*rh;
    chunks.push(`<text x="16" y="${y+15}"><title>${escapeXml(a.rows[r].name)}</title>${escapeXml(a.rows[r].name.slice(0,30))}</text>`);
    for(const [i,col] of cols.entries()) {
      const c=col+1,residue=String.fromCharCode(a.codes[r*a.width+c-1]),color=dynamic?dynamicColor(scheme,residue,s,c-1,colorThreshold,consensusThreshold):residueColor(residue,scheme,s.support[c-1]),x=gutter+i*cw;used.add(residue);      const comparison=mode.startsWith('consensus')?s.consensus[c-1]:a.codes[ref*a.width+c-1],code=a.codes[r*a.width+c-1],same=code===comparison&&code!==45&&code!==63;
      const faded=mode!=='all'&&(mode.endsWith('differences')?same:!same);
      chunks.push(`<g opacity="${faded?'0.22':'1'}"><rect x="${x}" y="${y}" width="${cw}" height="${rh-1}" fill="${color}"/><text x="${x+cw/2}" y="${y+15}" text-anchor="middle" fill="${textColor(color)}">${dots&&same&&r!==ref&&!isGap(code)?'.':residue==='-'?'·':escapeXml(residue)}</text></g>`);
    }
    for(const annotation of a.annotations)if(annotation.mapping==='mapped'&&(!annotation.rowId||annotation.rowId===a.rows[r].id)&&annotation.start!<=end&&annotation.end!>=start){
      const left=Math.max(start,annotation.start!),right=Math.min(end,annotation.end!),stroke=annotationColor(annotation);
      for(const [from,to] of runs(cols,left,right))chunks.push(`<rect x="${gutter+from*cw+1}" y="${y+1}" width="${(to-from+1)*cw-2}" height="${rh-3}" fill="none" stroke="${stroke}" stroke-width="2"><title>${escapeXml(annotation.label)}</title></rect>`);
    }
  }
  if(masked)for(let i=0;i<=count;i++){
    const before=i?cols[i-1]+1:start-1,after=i<count?cols[i]+1:end+1;
    if(after-before>1)chunks.push(`<line x1="${gutter+i*cw}" y1="${top-4}" x2="${gutter+i*cw}" y2="${top+rows.length*rh+2}" stroke="#a63d59" stroke-width="2" stroke-dasharray="4 3"><title>${after-before-1} hidden column${after-before>2?'s':''}: ${before+1}–${after-1}</title></line>`);
  }
  const y=top+rows.length*rh+24;
  chunks.push(`<text x="16" y="${y}">${escapeXml(scheme.label)} · statistics: ${s.total} rows · gaps retained${masked?' · hidden columns collapsed':''}</text>`);
  if(dynamic)chunks.push(`<text x="16" y="${y+26}">${escapeXml(scheme.description)}</text>`);
  else{let x=16;for(const residue of Array.from(used).sort()){const color=residueColor(residue,scheme,1);chunks.push(`<rect x="${x}" y="${y+12}" width="18" height="20" fill="${color}"/><text x="${x+9}" y="${y+26}" text-anchor="middle" fill="${textColor(color)}">${escapeXml(residue)}</text>`);x+=22;}}
  chunks.push('</g></svg>');return chunks.join('');
}
export async function exportPng(a:Alignment,s:AlignmentStats,region:ExportRegion={},scheme='soft',options:FigureOptions={}):Promise<Blob> {
  const svg=exportSvg(a,s,region,scheme,options),blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
  try {
    const img=new Image();img.src=url;await img.decode();
    if(img.width>16384||img.height>16384||img.width*img.height>32_000_000)throw new Error('PNG dimensions are too large. Export SVG or select a smaller region.');
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
    canvas.getContext('2d')!.drawImage(img,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed.')),'image/png'));
  } finally {URL.revokeObjectURL(url);}
}
