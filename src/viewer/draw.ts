import { buildLabels } from './labels';
import { renderPanel } from './panel';
import { applyVisibility, trackLayout, trackNames } from '../visibility';
import { type Alignment } from '../types';
import { hitCount } from '../search';
import { type RenderView } from '../renderer';
import { $ } from '../controls';
import { trackHeight } from '../tracks';
import { type Core } from './core';
export function view(v:Core):RenderView {return {a:v.a!,stats:v.stats,rows:v.rows,reference:v.reference,x:v.scroll.scrollLeft,y:v.scroll.scrollTop,cw:v.options.cellWidth,rh:v.options.rowHeight,gutter:v.gutter,scheme:v.options.colorScheme,mode:v.options.colorMode,matchDots:v.matchDots,dark:v.options.theme==='dark',selection:v.selection,annotations:v.annotationIndex,logo:v.options.showLogo,visibility:v.visibility,threshold:v.options.consensusThreshold,ruler:v.options.rulerCoordinates,hits:v.searchState?.byRow,activeHit:v.searchState?.result.hits[v.searchState.cursor],columns:v.columns,reverse:v.reversed,strands:v.rowStrands,tracks:v.drawnTracks(),logoMode:v.options.logoMode,window:v.options.conservationWindow,groups:v.groupList,trackError:(id,error)=>{if(!v.trackErrors.has(id)){v.trackErrors.add(id);v.error(new Error(`Track ${id}: render failed: ${error.message}`));}}};}
export function layout(v:Core):void {
  if(v.disposed)return;const rh=v.options.rowHeight,gutter=v.gutter;
  const extra=v.drawnTracks(),tracks=trackLayout(v.visibility,rh,extra.map(t=>({height:trackHeight(t)})),v.a?.alphabet);
  const showColumns=$(v.root,'[data-action="show-columns"]'),hiddenColumns=v.columns.width-v.columns.count;
  showColumns.dataset.empty=String(!hiddenColumns);showColumns.textContent=`Show all columns (${hiddenColumns.toLocaleString()} hidden)`;
  const showHidden=$(v.root,'[data-action="show-hidden"]');showHidden.dataset.empty=String(!v.hidden.size);showHidden.textContent=`Show hidden (${v.hidden.size})`;
  $(v.root,'.ak-tree-canvas').dataset.empty=String(!v.treeW);$<HTMLOptionElement>(v.root,'select[aria-label="Sequence order"] option[value="tree"]').hidden=!v.tree;
  v.menus.sync();applyVisibility(v.root,v.visibility);
  v.root.style.setProperty('--ak-tree',v.treeW+'px');v.root.style.setProperty('--ak-gutter',gutter+'px');v.root.style.setProperty('--ak-row-height',rh+'px');
  v.root.dataset.compactRows=String(rh<32);
  $(v.root,'.ak-tracks').style.height=tracks.height+'px';$(v.root,'.ak-tracks').hidden=tracks.height===0;
  const strip=$(v.root,'.ak-track-labels');
  strip.children[0].textContent=(v.options.rulerCoordinates==='reference'?'Reference residue':'Alignment position')+(v.reversed?' · reverse complement':'');
  const rcBox=$<HTMLInputElement>(v.root,'[aria-label="Reverse complement"]'),isProtein=v.a?.alphabet==='protein';rcBox.checked=v.reversed;rcBox.disabled=isProtein;rcBox.title=isProtein?'Reverse complement needs a DNA or RNA alignment.':'Show columns right to left with every residue complemented';
  $(v.root,'.ak-logo-label').textContent=v.options.logoMode==='bits'?'Information logo · bits':'Frequency logo · non-gap';
  [...strip.children].slice(0,trackNames.length).forEach((label,i)=>{const node=label as HTMLElement,offset=tracks.offsets[trackNames[i]];node.hidden=offset===null;node.style.top=((offset??0)+(trackNames[i]==='reference'?0:3))+'px';});
  const key=extra.map((t,i)=>`${t.id}|${t.label}|${tracks.custom[i]?.offset}`).join('\n');
  if(key!==v.trackKey){v.trackKey=key;for(const old of strip.querySelectorAll('.ak-custom-label'))old.remove();
    extra.forEach((t,i)=>{const slot=tracks.custom[i];if(!slot)return;const node=document.createElement('span');node.className='ak-custom-label';node.textContent=t.label;node.title=t.label;node.style.top=(slot.offset+Math.max(0,(slot.height-20)/2))+'px';strip.append(node);});}
  const message=$(v.root,'.ak-message');message.hidden=(!v.visibility.messages&&!v.pendingAlphabet)||!message.textContent;
  const spacer=$(v.root,'.ak-spacer');spacer.style.width=(gutter+v.columns.count*v.options.cellWidth)+'px';spacer.style.height=Math.max(1,v.rows.length*rh)+'px';
  $(v.root,'.ak-empty').hidden=!v.visibility.emptyState||(!!v.a&&v.rows.length>0);
  if(v.a&&!v.rows.length)$(v.root,'.ak-empty').textContent=v.hidden.size&&!v.filteredRows.length&&!v.query?'No sequences are visible. Use Show hidden to restore them.':v.pinned?(v.filteredRows.length?'The reference is pinned above.':'No sequences match this filter. The reference remains pinned.'):'No sequences match this filter.';
  $(v.root,'[aria-label="Zoom level"]').textContent=v.options.cellWidth+' px';
  v.schedule();
}
export function render(v:Core):void {
  if(!v.a||v.disposed)return;const width=$(v.root,'.ak-main').clientWidth,height=v.scroll.clientHeight;if(width<1)return;
  const rv=v.view();v.renderer.body($(v.root,'.ak-body-canvas'),rv,width,height);v.renderer.tracks($(v.root,'.ak-tracks canvas'),rv,width);
  const overview=$(v.root,'.ak-overview');if(v.overviewDirty&&v.visibility.overview){v.renderer.overview($(overview,'canvas'),rv,overview.clientWidth);v.overviewDirty=false;}
  const win=$(overview,'.ak-overview-window');const visible=Math.max(1,(width-v.gutter)/rv.cw),count=v.columns.count,left=rv.x/rv.cw/count;
  win.style.left=Math.min(1,left)*100+'%';win.style.width=Math.min(1,visible/count)*100+'%';overview.setAttribute('aria-valuemax',String(count));overview.setAttribute('aria-valuenow',String(Math.floor(rv.x/rv.cw)+1));
  v.treeHits=v.tree&&v.treeW?v.renderer.tree($(v.root,'.ak-tree-canvas'),rv,v.tree.layout,v.tree.leafRow,v.rowPos,v.treeW,height):[];
  const ref=$(v.root,'.ak-reference-label');ref.textContent=v.a.rows[v.reference]?.name??'Reference';ref.title='Pinned reference: '+ref.textContent;
  const first=Math.max(0,Math.floor(rv.y/rv.rh)),last=Math.min(v.rows.length,Math.ceil((rv.y+height)/rv.rh));
  const key=[first,last,v.rows.slice(first,last).join(','),[...v.selectedRows].join(','),v.a.alphabet,[...v.rowStrands].join(',')].join(':');
  if(v.labelKey!==key){v.labelKey=key;buildLabels(v,first,last);}
  for(const label of v.labels.children as HTMLCollectionOf<HTMLElement>)label.style.transform=`translateY(${Number(label.dataset.index)*rv.rh-rv.y}px)`;
  if(v.inspectorDirty)renderPanel(v);
  if(!v.tab)v.inspector.replaceChildren();
  applyVisibility(v.root,v.visibility);
  const m=v.columns,lead=(m.cols[Math.min(m.count-1,Math.floor(rv.x/rv.cw))]??0)+1,trail=(m.cols[Math.min(m.count,Math.ceil((rv.x+width-v.gutter)/rv.cw))-1]??v.a.width-1)+1,start=Math.min(lead,trail),end=Math.max(lead,trail);
  $(v.root,'.ak-status-main').textContent=`${v.a.rows.length.toLocaleString()} sequences${v.query?` · ${v.filteredRows.length.toLocaleString()} filtered`:''}${v.hidden.size?` · ${v.hidden.size.toLocaleString()} hidden`:''} · ${v.a.width.toLocaleString()} columns${m.count<m.width?` · ${(m.width-m.count).toLocaleString()} hidden`:''}${v.searchState?` · ${hitCount(v.searchState.result)}`:''}`;
  $(v.root,'.ak-status-detail').textContent=`${v.reversed?`${end}–${start}`:`${start}–${end}`} · ${v.stats?`${v.options.statisticsScope} rows`:'statistics pending'} · ${v.a.alphabet.toUpperCase()}${v.reversed?' · reverse complement':''}`;
  v.scroll.setAttribute('aria-rowcount',String(v.a.rows.length));v.scroll.setAttribute('aria-colcount',String(m.count));
  v.emit('viewport',{start,end,firstRow:first,lastRow:last,visibleRows:last-first,totalRows:v.a.rows.length});
}
