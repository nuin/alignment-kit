import { type Alignment, type ExportRegion } from '../types';
import { $, download } from '../controls';
import { exportFasta, exportClustal, exportStockholm, exportPhylip, exportNexus, formatFastaRecord, exportStatistics, exportSvg, exportPng, resolveRegion } from '../export';
import { consensusSequence } from '../analysis';
import { reverseComplementSequence } from '../strand';
import { type Core } from './core';
const textExports:Record<string,{ext:string;write:(a:Alignment,region:ExportRegion)=>string}>={clustal:{ext:'aln',write:exportClustal},stockholm:{ext:'sto',write:exportStockholm},phylip:{ext:'phy',write:(a,r)=>exportPhylip(a,r)},nexus:{ext:'nex',write:exportNexus}};
export function exportRegion(v:Core, a:Alignment):ExportRegion {
  const m=v.columns,left=v.firstColumn()+1,right=(m.cols[Math.max(0,Math.min(m.count,Math.ceil((v.scroll.scrollLeft+v.scroll.clientWidth-v.gutter)/v.options.cellWidth))-1)]??a.width-1)+1,start=v.selection?.start??Math.min(left,right);
  return {start,end:v.selection?.end??Math.max(start,left,right),rowIds:v.selectedRows.size?[...v.selectedRows]:[...(v.pinned?[a.rows[v.reference].id]:[]),...v.rows.slice(Math.floor(v.scroll.scrollTop/v.options.rowHeight),Math.ceil((v.scroll.scrollTop+v.scroll.clientHeight)/v.options.rowHeight)).filter(i=>i>=0).map(i=>a.rows[i].id)]};
}
/** Attach the column mask when `visible` is set or the FASTA option columns is 'visible'. */
export function fastaRegion(v:Core, region:ExportRegion,visible=v.options.fasta.columns==='visible'):ExportRegion {return visible?{...region,columns:v.columns.mask}:region;}
/** Rows to copy: checked rows in display order (filtered-out ones last), else the selected row, else the export rows. */
export function copyRegion(v:Core, a:Alignment):ExportRegion {
  const region=v.exportRegion(a);
  if(v.selectedRows.size) {
    const display=[...(v.pinned?[v.reference]:[]),...v.filteredRows.filter(i=>!v.pinned||i!==v.reference)].map(i=>a.rows[i].id);
    const shown=display.filter(id=>v.selectedRows.has(id)),seen=new Set(shown);
    region.rowIds=[...shown,...a.rows.map(r=>r.id).filter(id=>v.selectedRows.has(id)&&!seen.has(id))];
  } else if(v.selection?.rowId) region.rowIds=[v.selection.rowId];
  return region;
}
export function copyPayload(v:Core):{text:string;region:ReturnType<typeof resolveRegion>} {
  v.assertAlive();if(!v.a)throw new Error('No alignment is loaded.');
  const region=v.fastaRegion(v.copyRegion(v.a));if(!region.rowIds?.length)throw new Error('No sequences to copy.');
  const resolved=resolveRegion(v.a,region);
  return {text:(v.stats?v.consensusFasta(resolved.start,resolved.end,!!resolved.columns):'')+exportFasta(v.a,region,v.options.fasta),region:resolved};
}
export function getConsensus(v:Core, options:{threshold?:number}={}):string {
  v.assertAlive();if(!v.a)throw new Error('No alignment is loaded.');if(!v.stats)throw new Error('Column statistics are still being calculated.');
  return consensusSequence(v.stats,v.a.alphabet,options.threshold??v.options.consensusThreshold);
}
export function consensusFasta(v:Core, start:number,end:number,visible=false):string {
  const s=v.stats!,t=v.options.consensusThreshold,mask=v.columns.mask;let sequence=consensusSequence(s,v.a!.alphabet,t,start,end);
  if(visible)sequence=[...sequence].filter((_,i)=>mask[start-1+i]).join('');
  const flip=v.options.fasta.orientation==='reverse-complement';if(flip)sequence=reverseComplementSequence(sequence,v.a!.alphabet);
  return formatFastaRecord(`consensus columns ${start}-${end}${visible?' (visible columns)':''}${flip?' (reverse complement)':''}; ${v.options.statisticsScope} rows (${s.total}); threshold ${t}`,sequence,v.options.fasta);
}
export function getSelectionText(v:Core):string {return v.copyPayload().text;}
export async function copySelection(v:Core):Promise<void> {
  try {
    const {text,region}=v.copyPayload();
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard access needs a secure (HTTPS) page. Use Export instead.');
    await navigator.clipboard.writeText(text);
    if(v.disposed)return;
    const summary=`Copied ${region.rows.length.toLocaleString()} sequence${region.rows.length===1?'':'s'}, columns ${region.start}–${region.end}, as FASTA.`;
    v.message(summary);$(v.root,'.ak-live').textContent=summary;
  }catch(error){throw v.error(error);}
}
export function fastaPanel(v:Core, open:boolean):void {
  const panel=$(v.root,'.ak-fasta-options');panel.hidden=!open;v.menus.sync();
  (open?panel.querySelector<HTMLElement>('.ak-select-trigger'):v.root.querySelector<HTMLElement>('.ak-select-trigger[aria-label="Export alignment"]'))?.focus();
}
export async function exportKind(v:Core, kind:string):Promise<void> {
  if(!v.a)return;
  try{
    const region=v.exportRegion(v.a);
    if(kind==='fasta-all')download(exportFasta(v.a,v.fastaRegion({}),v.options.fasta),'alignment.fasta');
    if(kind==='fasta')download(exportFasta(v.a,v.fastaRegion(region),v.options.fasta),'selection.fasta');
    if(kind==='fasta-visible')download(exportFasta(v.a,v.fastaRegion({},true),v.options.fasta),'visible-columns.fasta');
    const text=textExports[kind.replace(/-all$/,'')];
    if(text)download(text.write(v.a,kind.endsWith('-all')?{}:region),`${kind.endsWith('-all')?'alignment':'selection'}.${text.ext}`);
    if(kind==='state')download(JSON.stringify(v.getState(),null,2),'alignment-view.json','application/json');
    if(['svg','png','tsv','consensus'].includes(kind)&&!v.stats)throw new Error('Wait for column statistics to finish before exporting.');
    if(kind==='consensus')download(v.consensusFasta(region.start!,region.end!,v.options.fasta.columns==='visible'),'consensus.fasta');
    if(kind==='tsv')download(exportStatistics(v.stats!),'column-statistics.tsv','text/tab-separated-values');
    if(kind==='svg')download(exportSvg({...v.a,annotations:v.filteredAnnotations.visible},v.stats!,region,v.options.colorScheme,{colorMode:v.options.colorMode,matchDisplay:v.options.matchDisplay,referenceId:v.a.rows[v.reference].id}),'alignment.svg','image/svg+xml');
    if(kind==='png')download(await exportPng({...v.a,annotations:v.filteredAnnotations.visible},v.stats!,region,v.options.colorScheme,{colorMode:v.options.colorMode,matchDisplay:v.options.matchDisplay,referenceId:v.a.rows[v.reference].id}),'alignment.png');
  }catch(error){v.error(error);}
}
