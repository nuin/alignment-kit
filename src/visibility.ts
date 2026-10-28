import type { Alphabet, ViewerVisibility } from './types';

/** Every presentation switch defaults on, except the frequency logo and the entropy and quality tracks. */
export const defaultVisibility: Readonly<Required<ViewerVisibility>> = Object.freeze({
  toolbar:true, tools:true, overview:true, overviewTitle:true, tracks:true, alignment:true,
  inspector:true, inspectorTabs:true, status:true, statusSummary:true, statusDetails:true,
  open:true, search:true, colorScheme:true, zoom:true, fit:true, theme:true,
  inspectorToggle:true, fullscreen:true, export:true, goTo:true, motif:true,
  order:true, colorMode:true, logoToggle:true, matchDots:true, statisticsScope:true, alphabet:true,
  rulerCoordinates:true, ruler:true, modalFrequency:true, gapFraction:true, consensus:true, logo:false, entropy:false, quality:false, stockholmTracks:true, reference:true,
  labels:true, rowNames:true, rowSpecies:true, rowSelection:true, rowPinning:true, labelResize:true,
  residueLetters:true, annotationMarks:true, selectionOverlay:true,
  positionTab:true, featuresTab:true, compareTab:true, colorsTab:true, hitsTab:true, summaryTab:true,
  pinReference:true, rowFeaturesToggle:true, featureType:true, featureConsequence:true,
  diseaseFilter:true, phenotypeFilter:true, featurePagination:true, calculateIdentity:true, clearRows:true,
  messages:true, emptyState:true, rowHiding:true, rowReordering:true, tree:true, columnMasking:true,
});

const selectors: Partial<Record<keyof ViewerVisibility,string>> = {
  toolbar:'.ak-toolbar',tools:'.ak-tools',overview:'.ak-overview-wrap',overviewTitle:'.ak-overview-title',alignment:'.ak-grid',
  inspector:'.ak-inspector',inspectorTabs:'.ak-tabs',status:'.ak-status',statusSummary:'.ak-status-main',statusDetails:'.ak-status-detail',
  open:'[data-action="open"],.ak-toolbar-divider',search:'.ak-search',colorScheme:'.ak-scheme-label',zoom:'.ak-zoom',fit:'[data-action="fit"]',
  theme:'[data-action="theme"]',inspectorToggle:'[data-action="inspect"]',fullscreen:'[data-action="fullscreen"]',export:'select[aria-label="Export alignment"]',
  goTo:'[aria-label="Go to alignment column"]',motif:'.ak-motif',order:'select[aria-label="Sequence order"]',colorMode:'select[aria-label="Residues to color"]',
  logoToggle:'[aria-label="Show frequency logo"]',matchDots:'[aria-label="Dots for matches"]',statisticsScope:'select[aria-label="Statistics scope"]',alphabet:'select[aria-label="Sequence alphabet"]',rulerCoordinates:'select[aria-label="Ruler coordinates"]',
  labels:'.ak-labels,.ak-track-labels',rowNames:'.ak-row-name',rowSpecies:'.ak-row-species',rowSelection:'[data-select-row]',rowPinning:'[data-pin]',labelResize:'.ak-gutter-resize',
  positionTab:'[data-tab="position"]',featuresTab:'[data-tab="annotations"]',compareTab:'[data-tab="compare"]',colorsTab:'[data-tab="legend"]',hitsTab:'[data-tab="hits"]',summaryTab:'[data-tab="summary"]',
  pinReference:'[data-action="pin-selected"]',rowFeaturesToggle:'[data-action="toggle-row-features"]',featureType:'select[aria-label="Feature type"]',
  featureConsequence:'select[aria-label="Feature consequence"]',diseaseFilter:'[aria-label="Features with disease evidence"]',phenotypeFilter:'[aria-label="Features with phenotype evidence"]',
  featurePagination:'.ak-feature-pagination',rowHiding:'[data-hide],[data-action="show-hidden"]',tree:'.ak-tree-canvas',columnMasking:'[data-action="hide-columns"],[data-action="show-columns"]',calculateIdentity:'[data-action="compare"]',clearRows:'[data-action="clear-rows"]',
};
export const inspectorTabs = {position:'positionTab',annotations:'featuresTab',compare:'compareTab',legend:'colorsTab',hits:'hitsTab',summary:'summaryTab'} as const;
export function applyVisibility(root:HTMLElement,v:Required<ViewerVisibility>) {
  const own=new Set<HTMLElement>();
  for(const [key,selector] of Object.entries(selectors))for(const element of root.querySelectorAll<HTMLElement>(selector)) {
    let target=element;
    if(element.matches('select,input:not([data-select-row])'))target=element.closest('label')??(element.matches('select')?element.nextElementSibling as HTMLElement:element);
    if(target){target.hidden=!v[key as keyof ViewerVisibility]||target.dataset.empty==='true';if(target.hidden)own.add(target);}
  }
  const tabs=Object.values(inspectorTabs).some(key=>v[key]);
  root.querySelector<HTMLElement>('.ak-inspector')!.hidden=!v.inspector||!tabs;
  root.querySelector<HTMLElement>('.ak-gutter-resize')!.hidden=!v.labels||!v.labelResize;
  // Avoid decorative empty rows and action containers when every child is hidden.
  for(const parent of root.querySelectorAll<HTMLElement>('.ak-toolbar,.ak-tools,.ak-inspector-actions,.ak-checks')) {
    const children=[...parent.children].filter(child=>!child.matches('input.ak-file,.ak-toolbar-divider,select')) as HTMLElement[];
    const enabled=parent.matches('.ak-toolbar')?v.toolbar:parent.matches('.ak-tools')?v.tools:true;
    parent.hidden=own.has(parent)||!enabled||!children.some(child=>!child.hidden);
  }
  for(const button of root.querySelectorAll<HTMLElement>('[data-row]'))button.hidden=!v.rowNames&&!v.rowSpecies;
}
export type TrackName='ruler'|'modalFrequency'|'gapFraction'|'entropy'|'quality'|'consensus'|'logo'|'reference';
export const trackNames:readonly TrackName[]=['ruler','modalFrequency','gapFraction','entropy','quality','consensus','logo','reference'];
/** One geometry source for both canvas tracks and their DOM labels. Column tracks come first, then `extra` tracks in order, then the pinned reference row so it sits directly above the body. Quality needs a protein alignment. */
export function trackLayout(v:Required<ViewerVisibility>,rowHeight:number,extra:readonly {height:number}[]=[],alphabet?:Alphabet) {
  const offsets:Record<TrackName,number|null>={ruler:null,modalFrequency:null,gapFraction:null,entropy:null,quality:null,consensus:null,logo:null,reference:null};
  const custom:{offset:number;height:number}[]=[];
  let height=0;
  for(const [name,size] of [['ruler',26],['modalFrequency',26],['gapFraction',26],['entropy',26],['quality',26],['consensus',36],['logo',45]] as const) {
    if(v.tracks&&v[name]&&!(name==='quality'&&alphabet&&alphabet!=='protein')){offsets[name]=height;height+=size;}
  }
  if(v.tracks)for(const t of extra){custom.push({offset:height,height:t.height});height+=t.height;}
  if(v.tracks&&v.reference){offsets.reference=height;height+=rowHeight;}
  return {offsets,custom,height};
}
