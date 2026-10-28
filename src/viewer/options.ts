import { type ViewerVisibility, type ViewerOptions, type CustomTrack } from '../types';
import { getColorScheme, colorSchemes } from '../colors';
import { $ } from '../controls';
import { validateFastaOptions } from '../export';
import { columnPos } from '../mask';
import { validateTracks } from '../tracks';
import { type Core, bounded } from './core';
export const protein='Reverse complement needs a DNA or RNA alignment. This one is protein.';
export function setOptions(v:Core, options:ViewerOptions):void {
  v.assertAlive();if(options.colorScheme)getColorScheme(options.colorScheme);
  if(options.rulerCoordinates!==undefined&&!['alignment','reference'].includes(options.rulerCoordinates))throw new Error('Unknown ruler coordinate mode.');
  const gap=options.hideGapColumns;
  if(gap!==undefined&&gap!==null&&!(typeof gap==='number'&&gap>=0&&gap<=1))throw v.error(new Error('hideGapColumns must be null or a number from 0 to 1.'));
  if(options.hideAllGapColumns!==undefined&&typeof options.hideAllGapColumns!=='boolean')throw v.error(new Error('hideAllGapColumns must be a boolean.'));
  if(options.reverseComplement!==undefined&&typeof options.reverseComplement!=='boolean')throw v.error(new Error('reverseComplement must be a boolean.'));
  const maskSig=()=>`${v.options.hideGapColumns}|${v.options.hideAllGapColumns}|${v.reversed}`,maskBefore=maskSig(),anchor=v.a?v.firstColumn():0;
  const oldScope=v.options.statisticsScope;
  const wasPinned=v.pinned;
  const {alignment:_,worker:__,workerUrl:___,visibility,fasta,tracks,groupBy,...visual}=options;
  if(visual.logoMode!==undefined&&visual.logoMode!=='frequency'&&visual.logoMode!=='bits')throw v.error(new Error('logoMode must be "frequency" or "bits".'));
  if(visual.reverseComplement&&v.a?.alphabet==='protein'){visual.reverseComplement=false;v.message(protein);}
  let validTracks:CustomTrack[]|undefined;
  if(tracks!==undefined){try{validTracks=validateTracks(tracks);}catch(error){throw v.error(error);}}
  if(validTracks){v.customTracks=validTracks;v.trackErrors.clear();v.checkTracks();v.trackKey='';}
  const mergedFasta=fasta?validateFastaOptions({...v.options.fasta,...fasta}):v.options.fasta;
  if(options.showToolbar!==undefined){v.visibility.toolbar=options.showToolbar;v.visibility.tools=options.showToolbar;}
  if(options.showInspector!==undefined)v.visibility.inspector=options.showInspector;
  if(options.showLogo!==undefined)v.visibility.logo=options.showLogo;
  for(const key of Object.keys(visibility??{}) as (keyof ViewerVisibility)[])if(typeof visibility![key]==='boolean')v.visibility[key]=visibility![key]!;
  v.menus.close();v.ensureTab();
  Object.assign(v.options,visual);v.options.fasta=mergedFasta;
  v.options.showInspector=v.visibility.inspector;v.options.showLogo=v.visibility.logo;
  if(v.a&&!colorSchemes(v.a.alphabet).some(s=>s.id===v.options.colorScheme))v.options.colorScheme=v.a.alphabet==='protein'?'soft':'soft-nucleotide';
  v.options.cellWidth=bounded(v.options.cellWidth,3,32);v.options.rowHeight=bounded(v.options.rowHeight,18,48);v.options.labelWidth=bounded(v.options.labelWidth,100,420);v.options.height=bounded(v.options.height,360,2000);v.options.consensusThreshold=bounded(v.options.consensusThreshold,0,1);{const w=Math.round(bounded(v.options.conservationWindow,1,51));v.options.conservationWindow=w%2?w:w-1;}v.options.treeWidth=bounded(v.options.treeWidth,0,400);
  const masked=maskSig()!==maskBefore;if(masked)v.colMap=undefined;
  const regroup=groupBy!==undefined&&groupBy!==v.groupBy;if(regroup)v.groupBy=groupBy!;
  v.root.style.height=v.options.height+'px';v.root.dataset.theme=v.options.theme;v.root.dataset.inspector=String(v.options.showInspector);v.root.dataset.dragPan=String(v.options.dragToPan);
  if(wasPinned!==v.pinned||regroup)v.rebuildRows();
  $<HTMLSelectElement>(v.root,'[aria-label="Color scheme"]').value=v.options.colorScheme;
  $<HTMLSelectElement>(v.root,'[aria-label="Residues to color"]').value=v.options.colorMode;
  $<HTMLSelectElement>(v.root,'[aria-label="Statistics scope"]').value=v.options.statisticsScope;
  $<HTMLSelectElement>(v.root,'[aria-label="Ruler coordinates"]').value=v.options.rulerCoordinates;
  $<HTMLInputElement>(v.root,'[aria-label="Show frequency logo"]').checked=v.options.showLogo;
  $<HTMLInputElement>(v.root,'[aria-label="Dots for matches"]').checked=v.options.matchDisplay==='dot';
  $<HTMLSelectElement>(v.root,'[aria-label="FASTA orientation"]').value=v.options.fasta.orientation??'source';
  const f=v.options.fasta,width=$<HTMLSelectElement>(v.root,'[aria-label="FASTA line width"]'),lineWidth=String(f.lineWidth??80);
  if(![...width.options].some(o=>o.value===lineWidth))width.add(new Option(lineWidth,lineWidth));
  width.value=lineWidth;$<HTMLSelectElement>(v.root,'[aria-label="FASTA gaps"]').value=f.gaps??'keep';
  $<HTMLSelectElement>(v.root,'[aria-label="FASTA letter case"]').value=f.letterCase??'original';$<HTMLSelectElement>(v.root,'[aria-label="FASTA header"]').value=f.header??'name';$<HTMLSelectElement>(v.root,'[aria-label="FASTA columns"]').value=f.columns??'all';
  v.labelKey='';v.overviewDirty=true;v.inspectorDirty=true;v.layout();
  if(masked){v.scroll.scrollLeft=columnPos(v.columns,Math.min(anchor,Math.max(0,v.columns.width-1)))*v.options.cellWidth;v.emit('state',v.getState());}
  const focused=v.root.ownerDocument.activeElement as HTMLElement|null;
  if(focused&&v.root.contains(focused)&&focused.closest('[hidden]')){const target=v.visibility.alignment?v.scroll:v.root;if(target===v.root)target.tabIndex=-1;target.focus();}
  if(oldScope!==v.options.statisticsScope&&v.a)void v.updateStats().catch(()=>{});
}
export function zoom(v:Core, value:number):void {const available=v.scroll.clientWidth-v.gutter,center=(v.scroll.scrollLeft+available/2)/v.options.cellWidth;v.setOptions({cellWidth:value});v.scroll.scrollLeft=Math.max(0,center*v.options.cellWidth-available/2);v.schedule();}
