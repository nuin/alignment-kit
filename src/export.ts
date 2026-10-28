import type { Alignment, AlignmentStats, ExportRegion, ColorMode } from './types';
import { columnDetail } from './analysis';
import { getColorScheme, residueColor, textColor } from './colors';
export const escapeXml=(s:unknown)=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
export function resolveRegion(a:Alignment,region:ExportRegion={}) {
  const start=region.start??1,end=region.end??a.width;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>a.width) throw new Error('Export range must use valid inclusive alignment coordinates.');
  const byId=new Map(a.rows.map((r,i)=>[r.id,i]));
  const rows=region.rowIds?region.rowIds.map(id=>{const r=byId.get(id);if(r===undefined)throw new Error(`Unknown export sequence “${id}”.`);return r;}):a.rows.map((_,i)=>i);
  if(new Set(rows).size!==rows.length)throw new Error('Export rows must be unique.');
  return {start,end,rows};
}
export function exportFasta(a:Alignment,region:ExportRegion={}):string {
  const {start,end,rows}=resolveRegion(a,region);
  return rows.map(r=>`>${a.rows[r].name.replace(/[\r\n]/g,' ')}\n${a.rows[r].sequence.slice(start-1,end).match(/.{1,80}/g)!.join('\n')}\n`).join('');
}
export function exportStatistics(s:AlignmentStats):string {
  const lines=['column\trows\tgap_count\tgap_fraction\tconsensus\tmodal_frequency_non_gap\tconsensus_support_all_rows'];
  for(let c=1;c<=s.width;c++){const d=columnDetail(s,c);lines.push([c,d.total,d.gapCount,d.gapFraction??'NA',d.tied?'tie':d.consensus??'NA',d.frequency??'NA',d.support??'NA'].join('\t'));}
  return lines.join('\n')+'\n';
}
export interface FigureOptions { colorMode?:ColorMode; referenceId?:string }
export function exportSvg(a:Alignment,s:AlignmentStats,region:ExportRegion={},schemeId='soft',options:FigureOptions={}):string {
  const {start,end,rows}=resolveRegion(a,region),count=end-start+1;
  if(!rows.length)throw new Error('Select at least one row to export.');
  if(count*rows.length>200000)throw new Error('Figure export is limited to 200,000 cells. Narrow the selected rows or columns.');
  const cw=16,rh=22,gutter=250,top=72,width=gutter+count*cw+24,height=top+rows.length*rh+100,scheme=getColorScheme(schemeId);
  const mode=options.colorMode??'all',ref=options.referenceId?a.rows.findIndex(r=>r.id===options.referenceId):0;
  if(mode.startsWith('reference')&&ref<0)throw new Error('Unknown figure reference.');
  const chunks=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escapeXml(a.name)}</title><metadata>${escapeXml(JSON.stringify({source:a.metadata.source,alphabet:a.alphabet,start,end,statisticsRows:s.total,definition:'Consensus support = modal non-gap count / all rows in statistics scope',palette:scheme.label,colorMode:mode,referenceId:a.rows[ref]?.id}))}</metadata><rect width="100%" height="100%" fill="#ffffff"/><g font-family="monospace" font-size="12" fill="#243447"><text x="16" y="25" font-size="17">${escapeXml(a.name)}</text><text x="16" y="46">Alignment columns ${start}–${end} · ${rows.length} sequences · ${a.alphabet}</text>`];
  for(let c=start;c<=end;c++)if(c===start||c%10===0)chunks.push(`<text x="${gutter+(c-start)*cw}" y="${top-8}">${c}</text>`);
  const used=new Set<string>();
  for(const [j,r] of rows.entries()) {
    const y=top+j*rh;
    chunks.push(`<text x="16" y="${y+15}"><title>${escapeXml(a.rows[r].name)}</title>${escapeXml(a.rows[r].name.slice(0,30))}</text>`);
    for(let c=start;c<=end;c++) {
      const residue=String.fromCharCode(a.codes[r*a.width+c-1]),color=residueColor(residue,scheme,s.support[c-1]),x=gutter+(c-start)*cw;used.add(residue);
      const comparison=mode.startsWith('reference')?a.codes[ref*a.width+c-1]:s.consensus[c-1],code=a.codes[r*a.width+c-1],same=code===comparison&&code!==45&&code!==63;
      const faded=mode!=='all'&&(mode.endsWith('differences')?same:!same);
      chunks.push(`<g opacity="${faded?'0.22':'1'}"><rect x="${x}" y="${y}" width="${cw}" height="${rh-1}" fill="${color}"/><text x="${x+cw/2}" y="${y+15}" text-anchor="middle" fill="${textColor(color)}">${residue==='-'?'·':escapeXml(residue)}</text></g>`);
    }
    for(const annotation of a.annotations)if(annotation.mapping==='mapped'&&(!annotation.rowId||annotation.rowId===a.rows[r].id)&&annotation.start!<=end&&annotation.end!>=start){const left=Math.max(start,annotation.start!),right=Math.min(end,annotation.end!);chunks.push(`<rect x="${gutter+(left-start)*cw+1}" y="${y+1}" width="${(right-left+1)*cw-2}" height="${rh-3}" fill="none" stroke="${annotation.color&&/^#[0-9a-f]{6}$/i.test(annotation.color)?annotation.color:'#a63d59'}" stroke-width="2"><title>${escapeXml(annotation.label)}</title></rect>`);}
  }
  const y=top+rows.length*rh+24;
  chunks.push(`<text x="16" y="${y}">${escapeXml(scheme.label)} · statistics: ${s.total} rows · gaps retained</text>`);
  let x=16;for(const residue of Array.from(used).sort()){const color=residueColor(residue,scheme,1);chunks.push(`<rect x="${x}" y="${y+12}" width="18" height="20" fill="${color}"/><text x="${x+9}" y="${y+26}" text-anchor="middle" fill="${textColor(color)}">${escapeXml(residue)}</text>`);x+=22;}
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
