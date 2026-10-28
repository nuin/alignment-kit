import { defaultVisibility, applyVisibility, trackLayout, trackNames, inspectorTabs } from './visibility';
import type { ViewerVisibility, RulerCoordinates, Alignment, AlignmentStats, ViewerOptions, ViewerEvents, ViewerEvent, EventHandler, ViewState, Selection, AnnotationFilter, ParseOptions, ExportRegion, ColorMode, Annotation, AnnotationImportOptions, AnnotationImportResult, Hit, SearchOptions, SearchResult, CustomTrack } from './types';
import { importAnnotations } from './annotation-import';
import { createAlignment, sequenceToAlignment, columnToResidue, residueToColumn } from './model';
import { findHits, hitCount } from './search';
import { readAlignmentInput } from './parsers';
import { AnnotationIndex, filterAnnotations } from './annotations';
import { getColorScheme, colorSchemes } from './colors';
import { ThemedSelects } from './selects';
import { Renderer, type RenderView, type GroupInfo, type TreeHit } from './renderer';
import { buildShell, $, download } from './controls';
import { renderInspector } from './inspector';
import { exportFasta, exportClustal, exportStockholm, exportPhylip, exportNexus, formatFastaRecord, validateFastaOptions, exportStatistics, exportSvg, exportPng, resolveRegion, escapeXml as e } from './export';
import { WorkerTask } from './worker-client';
import { consensusSequence } from './analysis';
import { validateTrack, validateTracks, checkTrackLength, stockholmTracks, trackHeight } from './tracks';
import { encodeViewLink, decodeViewLink, isViewLink, type ViewLink } from './link';
import { computeColumnMask, mergeColumnRanges, subtractColumnRange, buildColumnMap, identityColumns, type ColumnMap, type ColumnRange } from './mask';
import { parseNewick, layoutTree, matchLeaves, leavesUnder, type TreeLayout } from './tree';

const groupColors=['#2463a6','#3a8a5f','#b5651d','#8a4fa3','#c0392b','#2a9d8f','#9c8a1d','#5c6bc0'];
interface BoundTree { layout:TreeLayout; leafRow:Int32Array; treePos:Int32Array; note:string }
/** View state that survives removeRows. */
interface Carry { reference:string; selection:Selection|null; selectedRows:string[]; query:string; sort:ViewState['sort']; hidden:string[]; manualOrder:string[]|null; collapsed:string[]; groupMap:Map<string,string>|null; tree?:TreeLayout; annotationFilter:AnnotationFilter; hiddenColumns:ColumnRange[] }

const bounded=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
const textExports:Record<string,{ext:string;write:(a:Alignment,region:ExportRegion)=>string}>={clustal:{ext:'aln',write:exportClustal},stockholm:{ext:'sto',write:exportStockholm},phylip:{ext:'phy',write:(a,r)=>exportPhylip(a,r)},nexus:{ext:'nex',write:exportNexus}};
export class AlignmentViewer {
  readonly element:HTMLElement;
  private root:HTMLElement;private scroll:HTMLElement;private labels:HTMLElement;private inspector:HTMLElement;
  private options:Required<Pick<ViewerOptions,'height'|'theme'|'colorScheme'|'colorMode'|'matchDisplay'|'cellWidth'|'rowHeight'|'labelWidth'|'showLogo'|'showInspector'|'showToolbar'|'statisticsScope'|'consensusThreshold'|'fasta'|'rulerCoordinates'|'logoMode'|'conservationWindow'|'treeWidth'|'hideGapColumns'|'hideAllGapColumns'>>;
  private a?:Alignment; private stats?:AlignmentStats;private fullStats?:AlignmentStats;
  private reference=0;private filteredRows:number[]=[];private rows:number[]=[];private query='';private sort:ViewState['sort']='input';private identities?:number[];private identityDetails?:import('./types').Identity[];
  private selection:Selection|null=null;private selectedRows=new Set<string>();private annotationFilter:AnnotationFilter={};
  private filteredAnnotations:ReturnType<typeof filterAnnotations>={visible:[],unknown:0,excluded:0};private annotationIndex=new AnnotationIndex([]);
  private renderer=new Renderer();private controller=new AbortController();private resize:ResizeObserver;private menus:ThemedSelects;
  private parser:WorkerTask;private analysis:WorkerTask;private comparison:WorkerTask;private ranking:WorkerTask;private request?:AbortController;
  private listeners=new Map<ViewerEvent,Set<(event:any)=>void>>();
  private frame=0;private disposed=false;private revision=0;private statsRevision=0;private loadRevision=0;
  private tab='position';private featurePage=0;private labelKey='';private overviewDirty=true;private inspectorDirty=true;
  private visibility:Required<ViewerVisibility>={...defaultVisibility};
  private get treeW(){return this.tree&&this.visibility.tree?this.options.treeWidth:0;}
  private get gutter(){return this.treeW+(this.visibility.labels?this.options.labelWidth:0);}
  private get matchDots(){return this.options.matchDisplay==='dot'&&(this.options.colorMode.startsWith('consensus')||this.pinned||this.filteredRows.includes(this.reference));}
  private get pinned(){return this.visibility.tracks&&this.visibility.reference;}
  getVisibility():Required<ViewerVisibility>{return {...this.visibility};}
  private manualHidden:ColumnRange[]=[];private colMap?:ColumnMap;
  /** Display to original column map; rebuilt when the alignment, the mask options or the hidden ranges change. */
  private get columns():ColumnMap {
    const a=this.a;if(!a)return identityColumns(0);
    return this.colMap??=buildColumnMap(computeColumnMask(a,{gapFraction:this.options.hideGapColumns,allGap:this.options.hideAllGapColumns,hidden:this.manualHidden}));
  }
  /** Original zero-based column at the left edge of the viewport. */
  private firstColumn():number {const m=this.columns;return m.cols[Math.min(m.count-1,Math.max(0,Math.floor(this.scroll.scrollLeft/this.options.cellWidth)))]??0;}
  /** One-based column after stepping over kept columns from `column`; hidden columns are skipped. */
  private stepColumn(column:number,step:1|-1):number {
    const m=this.columns,c=column-1,d=step<0?m.before[c]-1:m.mask[c]?m.before[c]+1:m.before[c];
    return m.cols[Math.max(0,Math.min(m.count-1,d))]+1;
  }
  /** Apply a new mask: rebuild the map, keep the same original column at the left edge and redraw. */
  private maskChanged(anchor:number) {
    this.colMap=undefined;this.overviewDirty=true;this.inspectorDirty=true;this.layout();
    this.scroll.scrollLeft=this.columns.before[Math.min(anchor,Math.max(0,this.columns.width-1))]*this.options.cellWidth;this.schedule();this.emit('state',this.getState());
  }
  private setManualHidden(ranges:ColumnRange[]) {const anchor=this.a?this.firstColumn():0;this.manualHidden=ranges;this.maskChanged(anchor);}
  /** Hide columns `start` to `end` (one-based, inclusive) without changing the alignment. Selection, search hits, annotations, tracks and statistics keep original coordinates. Throws when the range is invalid or would leave no column visible. */
  hideColumns(start:number,end:number):void {
    this.assertAlive();const a=this.a;if(!a)throw new Error('Load an alignment before hiding columns.');
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>a.width)throw new Error(`Hide columns needs a range inside 1 to ${a.width}.`);
    const ranges=mergeColumnRanges([...this.manualHidden,[start,end]]);
    if(ranges.length===1&&ranges[0][0]===1&&ranges[0][1]===a.width)throw new Error('At least one column must stay visible.');
    this.setManualHidden(ranges);
  }
  /** Show hidden columns. With no arguments, clears the manual ranges and turns off hideGapColumns and hideAllGapColumns; with a range, removes only that range from the manual ranges (gap-based hiding stays). */
  showColumns(start?:number,end?:number):void {
    this.assertAlive();
    if(start===undefined){const anchor=this.a?this.firstColumn():0;this.manualHidden=[];this.options.hideGapColumns=null;this.options.hideAllGapColumns=false;this.maskChanged(anchor);return;}
    if(!Number.isInteger(start)||!Number.isInteger(end??start)||start<1||(end??start)<start)throw new Error('Show columns needs a valid one-based range.');
    this.setManualHidden(subtractColumnRange(this.manualHidden,start,end??start));
  }
  /** 1 for a visible column, 0 for a hidden one; one entry per alignment column. Empty before an alignment is loaded. */
  getColumnMask():Uint8Array {this.assertAlive();return this.columns.mask.slice();}
  private columnHidden(column:number):boolean {
    if(this.columns.mask[column-1]!==0)return false;
    this.message(`Column ${column} is hidden. Use Show all columns to reveal it.`);return true;
  }
  private ensureTab(){if(!this.visibility[inspectorTabs[this.tab as keyof typeof inspectorTabs]])this.tab=Object.keys(inspectorTabs).find(key=>this.visibility[inspectorTabs[key as keyof typeof inspectorTabs]])??'';}
  private searchState?:{pattern:string;options:SearchOptions;result:SearchResult;byRow:Map<number,Hit[]>;cursor:number;full?:SearchResult};
  private customTracks:CustomTrack[]=[];private drawn?:{a:Alignment;row:number;flag:boolean;user:CustomTrack[];list:CustomTrack[]};private trackKey='';private trackErrors=new Set<string>();
  private selectionRow(){return this.selection?.rowId&&this.a?this.a.rows.findIndex(r=>r.id===this.selection!.rowId):this.pinned?this.reference:-1;}
  /** Tracks drawn after the built-ins: Stockholm lines first, then registered tracks whose values fit the alignment. Same array until an input changes. */
  private drawnTracks():CustomTrack[] {
    const a=this.a;if(!a)return [];
    const row=this.selectionRow(),flag=this.visibility.stockholmTracks,d=this.drawn;
    if(d&&d.a===a&&d.row===row&&d.flag===flag&&d.user===this.customTracks)return d.list;
    const list=[...(flag?stockholmTracks(a,row):[]),...this.customTracks.filter(t=>t.values===undefined||t.values.length===a.width)];
    this.drawn={a,row,flag,user:this.customTracks,list};return list;
  }
  private checkTracks(){if(this.a)for(const t of this.customTracks)try{checkTrackLength(t,this.a.width);}catch(error){this.error(error);}}
  private tracksChanged(){this.trackKey='';this.layout();}
  /** Register a track drawn below the built-in tracks. Throws (and emits `error`) for an invalid definition, a duplicate id or, once an alignment is loaded, a `values` length other than the alignment width. */
  addTrack(track:CustomTrack):void {
    this.assertAlive();
    try{const t=validateTrack(track);if(this.customTracks.some(x=>x.id===t.id))throw new Error(`Track ${t.id}: a track with this id already exists.`);if(this.a)checkTrackLength(t,this.a.width);this.customTracks=[...this.customTracks,t];}catch(error){throw this.error(error);}
    this.tracksChanged();
  }
  removeTrack(id:string):void {
    this.assertAlive();
    if(!this.customTracks.some(t=>t.id===id))throw this.error(new Error(`Unknown track: ${id}.`));
    this.customTracks=this.customTracks.filter(t=>t.id!==id);this.trackErrors.delete(id);this.tracksChanged();
  }
  /** Registered tracks in drawing order (copies). Tracks derived from Stockholm lines are not listed. */
  getTracks():CustomTrack[]{return this.customTracks.map(t=>({...t}));}
  private hidden=new Set<string>();private manualOrder:string[]|null=null;private collapsed=new Set<string>();private groupBy='';private groupMap:Map<string,string>|null=null;
  private groupList:GroupInfo[]=[];private rowPos=new Int32Array(0);private rowGroup=new Int32Array(0);private tree?:BoundTree;private treeHits:TreeHit[]=[];private dragId?:string;private focusRow?:string;
  private sourceUrl?:string;private nextSource?:string;private urlSync=false;private pendingLink?:ViewLink;private linkTimer?:ReturnType<typeof setTimeout>;private lastHash='';private loading=false;
  constructor(element:HTMLElement,options:ViewerOptions={}) {
    this.element=element;this.root=document.createElement('section');element.append(this.root);
    this.options={height:740,theme:'light',colorScheme:'soft',colorMode:'all',matchDisplay:'letter',cellWidth:16,rowHeight:36,labelWidth:230,showLogo:false,showInspector:true,showToolbar:true,statisticsScope:'all',consensusThreshold:0,rulerCoordinates:'alignment',logoMode:'frequency',conservationWindow:1,treeWidth:120,hideGapColumns:null,hideAllGapColumns:false,...options,fasta:{}};
    this.parser=new WorkerTask(options.workerUrl,options.worker!==false);this.analysis=new WorkerTask(options.workerUrl,options.worker!==false);this.comparison=new WorkerTask(options.workerUrl,options.worker!==false);this.ranking=new WorkerTask(options.workerUrl,options.worker!==false);
    buildShell(this.root);this.scroll=$(this.root,'.ak-scroll');this.labels=$(this.root,'.ak-labels');this.inspector=$(this.root,'.ak-inspector-content');
    this.menus=new ThemedSelects(this.root);
    if(options.urlSync&&typeof location!=='undefined'){
      this.urlSync=true;if(isViewLink(location.hash))this.pendingLink=decodeViewLink(location.hash);
      // In-page anchors such as #viewer are left alone; a link arriving mid-load waits for that load.
      window.addEventListener('hashchange',()=>{if(location.hash===this.lastHash||!isViewLink(location.hash))return;const link=decodeViewLink(location.hash);if(this.a&&!this.loading){this.pendingLink=undefined;void this.applyViewLink(link).catch(()=>{});}else this.pendingLink=link;},{signal:this.controller.signal});
    }
    this.bind();this.resize=new ResizeObserver(()=>{this.overviewDirty=true;this.layout();});this.resize.observe(this.root);
    this.setOptions(options);this.layout();
    if(options.alignment) void this.setAlignment(options.alignment).catch(()=>{});
  }
  on<K extends ViewerEvent>(event:K,handler:EventHandler<K>):()=>void {
    if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event)!.add(handler);return ()=>this.listeners.get(event)?.delete(handler);
  }
  private emit<K extends ViewerEvent>(event:K,value:ViewerEvents[K]) {if(event==='state'||event==='viewport')this.scheduleLink();for(const handler of this.listeners.get(event)??[])handler(value);}
  private error(error:unknown) {const err=error instanceof Error?error:new Error(String(error));if(err.name!=='AbortError'&&!this.disposed){this.message(err.message,true);this.emit('error',err);}return err;}
  private assertAlive(){if(this.disposed)throw new Error('This viewer has been destroyed.');}
  getAlignment():Alignment|undefined{return this.a;}
  getStatistics():AlignmentStats|undefined{return this.stats;}
  getSelectedRowIds():string[]{return [...this.selectedRows];}
  load(input:string|Blob|ArrayBuffer,options:ParseOptions={}):Promise<void> {return this.loadInput(input,options);}
  private async loadInput(input:string|Blob|ArrayBuffer,options:ParseOptions,source?:string):Promise<void> {
    this.assertAlive();this.parser.cancel();this.request?.abort();const token=++this.loadRevision;this.loading=true;
    this.message('Reading alignment…');
    try {
      if(input instanceof File&&/\.a3m(?:\.gz)?$/i.test(input.name))throw new Error('A3M insertion notation is not aligned FASTA. Convert it to a rectangular alignment first.');
      const text=await readAlignmentInput(input);
      if(this.disposed||token!==this.loadRevision)return;
      const alignment=await this.parser.parse(text,options);
      if(this.disposed||token!==this.loadRevision)return;
      this.nextSource=source;await this.setAlignment(alignment);
    } catch(error){if(token===this.loadRevision){this.loading=false;this.error(error);}if((error as Error).name!=='AbortError')throw error;}
  }
  async loadUrl(url:string,options:ParseOptions={}):Promise<void> {
    this.assertAlive();this.request?.abort();this.parser.cancel();const request=new AbortController();this.request=request;const token=++this.loadRevision;
    this.message('Fetching alignment…');
    try {
      const parsed=new URL(url,document.baseURI);if(/\.a3m(?:\.gz)?$/i.test(parsed.pathname))throw new Error('A3M insertion notation is not aligned FASTA. Convert it before loading.');if(!['https:','http:'].includes(parsed.protocol))throw new Error('Alignment URLs must use HTTP or HTTPS.');
      const response=await fetch(parsed,{signal:request.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();if(token!==this.loadRevision||this.disposed)return;
      this.request=undefined;
      await this.loadInput(bytes,{...options,source:options.source??{url:parsed.href,retrieved:new Date().toISOString()}},parsed.href);
    }catch(error){if((error as Error).name==='AbortError')return;const err=new Error(`Could not load this URL: ${(error as Error).message}. The server must allow browser CORS requests. Download the file and use Open alignment instead.`);if(token===this.loadRevision)this.error(err);throw err;}
  }
  async setAlignment(alignment:Alignment):Promise<void> {return this.replace(alignment);}
  private async replace(alignment:Alignment,carry?:Carry):Promise<void> {
    this.assertAlive();++this.loadRevision;this.request?.abort();this.parser.cancel();this.analysis.cancel();this.comparison.cancel();this.ranking.cancel();const revision=++this.revision;
    if(!alignment.rows.length||alignment.width<1||alignment.codes.length!==alignment.width*alignment.rows.length)throw this.error(new Error('Invalid alignment model. Use createAlignment or parseAlignment.'));
    this.sourceUrl=this.nextSource;this.nextSource=undefined;this.loading=true;
    const index=new Map(alignment.rows.map((r,i)=>[r.id,i])),known=(id:string)=>index.has(id);
    this.a=alignment;this.trackErrors.clear();this.checkTracks();this.stats=undefined;this.fullStats=undefined;this.reference=index.get(carry?.reference??'')??0;this.selection=carry?.selection??null;this.selectedRows=new Set(carry?.selectedRows.filter(known));this.query=carry?.query??'';this.sort=carry?.sort??'input';this.identities=undefined;this.identityDetails=undefined;this.annotationFilter=carry?.annotationFilter??{};this.featurePage=0;
    this.hidden=new Set(carry?.hidden.filter(known));this.manualOrder=carry?.manualOrder?.filter(known)??null;this.collapsed=new Set(carry?.collapsed);this.groupMap=carry?.groupMap??null;this.tree=carry?.tree?this.bindTree(carry.tree):undefined;this.manualHidden=carry?.hiddenColumns??[];this.colMap=undefined;
    this.menus.close();const schemes=colorSchemes(alignment.alphabet);
    if(!schemes.some(s=>s.id===this.options.colorScheme))this.options.colorScheme=alignment.alphabet==='protein'?'soft':'soft-nucleotide';
    const palette=$<HTMLSelectElement>(this.root,'select[aria-label="Color scheme"]');palette.replaceChildren(...schemes.map(s=>new Option(s.label,s.id)));palette.value=this.options.colorScheme;
    this.dropSearch();this.scroll.scrollLeft=0;this.scroll.scrollTop=0;
    $<HTMLInputElement>(this.root,'[aria-label="Filter sequences"]').value=this.query;
    $<HTMLSelectElement>(this.root,'[aria-label="Sequence alphabet"]').value=alignment.alphabet;
    $<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value=this.sort;
    this.rebuildAnnotations();this.rebuildRows();this.inspectorDirty=true;this.overviewDirty=true;this.layout();
    this.message('Calculating exact column statistics…');
    try{await this.updateStats();}catch(error){if(this.revision===revision)this.loading=false;throw error;}
    if(!this.disposed&&this.revision===revision&&this.a===alignment){
      this.message('');this.emit('ready',alignment);
      this.loading=false;const link=this.pendingLink;this.pendingLink=undefined;if(link)await this.applyViewLink(link).catch(()=>[]);
    }
  }
  setOptions(options:ViewerOptions) {
    this.assertAlive();if(options.colorScheme)getColorScheme(options.colorScheme);
    if(options.rulerCoordinates!==undefined&&!['alignment','reference'].includes(options.rulerCoordinates))throw new Error('Unknown ruler coordinate mode.');
    const gap=options.hideGapColumns;
    if(gap!==undefined&&gap!==null&&!(typeof gap==='number'&&gap>=0&&gap<=1))throw this.error(new Error('hideGapColumns must be null or a number from 0 to 1.'));
    if(options.hideAllGapColumns!==undefined&&typeof options.hideAllGapColumns!=='boolean')throw this.error(new Error('hideAllGapColumns must be a boolean.'));
    const maskSig=()=>`${this.options.hideGapColumns}|${this.options.hideAllGapColumns}`,maskBefore=maskSig(),anchor=this.a?this.firstColumn():0;
    const oldScope=this.options.statisticsScope;
    const wasPinned=this.pinned;
    const {alignment:_,worker:__,workerUrl:___,visibility,fasta,tracks,groupBy,...visual}=options;
    if(visual.logoMode!==undefined&&visual.logoMode!=='frequency'&&visual.logoMode!=='bits')throw this.error(new Error('logoMode must be "frequency" or "bits".'));
    let validTracks:CustomTrack[]|undefined;
    if(tracks!==undefined){try{validTracks=validateTracks(tracks);}catch(error){throw this.error(error);}}
    if(validTracks){this.customTracks=validTracks;this.trackErrors.clear();this.checkTracks();this.trackKey='';}
    const mergedFasta=fasta?validateFastaOptions({...this.options.fasta,...fasta}):this.options.fasta;
    if(options.showToolbar!==undefined){this.visibility.toolbar=options.showToolbar;this.visibility.tools=options.showToolbar;}
    if(options.showInspector!==undefined)this.visibility.inspector=options.showInspector;
    if(options.showLogo!==undefined)this.visibility.logo=options.showLogo;
    for(const key of Object.keys(visibility??{}) as (keyof ViewerVisibility)[])if(typeof visibility![key]==='boolean')this.visibility[key]=visibility![key]!;
    this.menus.close();this.ensureTab();
    Object.assign(this.options,visual);this.options.fasta=mergedFasta;
    this.options.showInspector=this.visibility.inspector;this.options.showLogo=this.visibility.logo;
    if(this.a&&!colorSchemes(this.a.alphabet).some(s=>s.id===this.options.colorScheme))this.options.colorScheme=this.a.alphabet==='protein'?'soft':'soft-nucleotide';
    this.options.cellWidth=bounded(this.options.cellWidth,3,32);this.options.rowHeight=bounded(this.options.rowHeight,18,48);this.options.labelWidth=bounded(this.options.labelWidth,100,420);this.options.height=bounded(this.options.height,360,2000);this.options.consensusThreshold=bounded(this.options.consensusThreshold,0,1);{const w=Math.round(bounded(this.options.conservationWindow,1,51));this.options.conservationWindow=w%2?w:w-1;}this.options.treeWidth=bounded(this.options.treeWidth,0,400);
    const masked=maskSig()!==maskBefore;if(masked)this.colMap=undefined;
    const regroup=groupBy!==undefined&&groupBy!==this.groupBy;if(regroup)this.groupBy=groupBy!;
    this.root.style.height=this.options.height+'px';this.root.dataset.theme=this.options.theme;this.root.dataset.inspector=String(this.options.showInspector);
    if(wasPinned!==this.pinned||regroup)this.rebuildRows();
    $<HTMLSelectElement>(this.root,'[aria-label="Color scheme"]').value=this.options.colorScheme;
    $<HTMLSelectElement>(this.root,'[aria-label="Residues to color"]').value=this.options.colorMode;
    $<HTMLSelectElement>(this.root,'[aria-label="Statistics scope"]').value=this.options.statisticsScope;
    $<HTMLSelectElement>(this.root,'[aria-label="Ruler coordinates"]').value=this.options.rulerCoordinates;
    $<HTMLInputElement>(this.root,'[aria-label="Show frequency logo"]').checked=this.options.showLogo;
    $<HTMLInputElement>(this.root,'[aria-label="Dots for matches"]').checked=this.options.matchDisplay==='dot';
    const f=this.options.fasta,width=$<HTMLSelectElement>(this.root,'[aria-label="FASTA line width"]'),lineWidth=String(f.lineWidth??80);
    if(![...width.options].some(o=>o.value===lineWidth))width.add(new Option(lineWidth,lineWidth));
    width.value=lineWidth;$<HTMLSelectElement>(this.root,'[aria-label="FASTA gaps"]').value=f.gaps??'keep';
    $<HTMLSelectElement>(this.root,'[aria-label="FASTA letter case"]').value=f.letterCase??'original';$<HTMLSelectElement>(this.root,'[aria-label="FASTA header"]').value=f.header??'name';$<HTMLSelectElement>(this.root,'[aria-label="FASTA columns"]').value=f.columns??'all';
    this.labelKey='';this.overviewDirty=true;this.inspectorDirty=true;this.layout();
    if(masked){this.scroll.scrollLeft=this.columns.before[Math.min(anchor,Math.max(0,this.columns.width-1))]*this.options.cellWidth;this.emit('state',this.getState());}
    const focused=this.root.ownerDocument.activeElement as HTMLElement|null;
    if(focused&&this.root.contains(focused)&&focused.closest('[hidden]')){const target=this.visibility.alignment?this.scroll:this.root;if(target===this.root)target.tabIndex=-1;target.focus();}
    if(oldScope!==this.options.statisticsScope&&this.a)void this.updateStats().catch(()=>{});
  }
  private async updateStats() {
    if(!this.a)return;const token=++this.statsRevision,a=this.a,scope=this.options.statisticsScope;
    this.analysis.cancel();
    if(scope==='all'&&this.fullStats){this.stats=this.fullStats;this.inspectorDirty=true;this.overviewDirty=true;this.schedule();return;}
    this.stats=undefined;this.inspectorDirty=true;this.schedule();
    try {
      const result=await this.analysis.stats(a,scope==='filtered'?this.filteredRows:undefined);
      if(this.disposed||token!==this.statsRevision||this.a!==a)return;
      this.stats=result;if(scope==='all')this.fullStats=result;
      this.inspectorDirty=true;this.overviewDirty=true;this.message('');this.schedule();
    }catch(error){this.error(error);if((error as Error).name!=='AbortError')throw error;}
  }
  /** Every row index in the current sort order, ignoring filters, hiding, grouping and pinning. */
  private orderAll():number[] {
    const a=this.a;if(!a)return [];const order=a.rows.map((_,i)=>i),late=1e9;
    if(this.sort==='name')order.sort((x,y)=>a.rows[x].name.localeCompare(a.rows[y].name)||x-y);
    if(this.sort==='identity'&&this.identities)order.sort((x,y)=>this.identities![y]-this.identities![x]||x-y);
    if(this.sort==='manual'&&this.manualOrder){const pos=new Map(this.manualOrder.map((id,i)=>[id,i])),at=(i:number)=>pos.get(a.rows[i].id)??late+i;order.sort((x,y)=>at(x)-at(y));}
    if(this.sort==='tree'&&this.tree){const pos=this.tree.treePos,at=(i:number)=>pos[i]>=0?pos[i]:late+i;order.sort((x,y)=>at(x)-at(y));}
    return order;
  }
  private groupName(row:number):string|null {
    const r=this.a!.rows[row];if(this.groupMap)return this.groupMap.get(r.id)||'Ungrouped';if(!this.groupBy)return null;
    const value=this.groupBy==='species'?r.species:r.metadata?.[this.groupBy];return value===undefined||value===null||value===''?'Ungrouped':String(value);
  }
  private rebuildRows() {
    if(!this.a)return;const a=this.a,q=this.query.trim().toLocaleLowerCase(),all=this.orderAll();
    this.filteredRows=all.filter(i=>!this.hidden.has(a.rows[i].id)&&(!q||`${a.rows[i].name} ${a.rows[i].species??''}`.toLocaleLowerCase().includes(q)));
    const shown=this.filteredRows.filter(i=>!this.pinned||i!==this.reference);
    this.groupList=[];this.rowGroup=new Int32Array(a.rows.length).fill(-1);
    if(!this.groupMap&&!this.groupBy)this.rows=shown;
    else {
      // Names come from every row so a group keeps its color while filters change; Ungrouped sorts last.
      const names=[...new Set(all.map(i=>this.groupName(i)!))].sort((x,y)=>(x==='Ungrouped'?1:0)-(y==='Ungrouped'?1:0)||x.localeCompare(y));
      const buckets=new Map<string,number[]>();for(const i of shown){const name=this.groupName(i)!,list=buckets.get(name);if(list)list.push(i);else buckets.set(name,[i]);}
      this.rows=[];
      names.forEach((name,n)=>{
        const list=buckets.get(name);if(!list)return;
        const group={name,count:list.length,color:groupColors[n%groupColors.length],collapsed:this.collapsed.has(name)};this.groupList.push(group);this.rows.push(-this.groupList.length);
        if(!group.collapsed)for(const i of list){this.rows.push(i);this.rowGroup[i]=this.groupList.length-1;}
      });
    }
    this.rowPos=new Int32Array(a.rows.length).fill(-1);this.rows.forEach((row,p)=>{if(row>=0)this.rowPos[row]=p;});
    this.labelKey='';this.layout();
      if(this.searchState)this.runSearch(this.searchState.pattern,this.searchState.options,true);
  }
  private rowsChanged() {this.rebuildRows();this.inspectorDirty=true;if(this.options.statisticsScope==='filtered')void this.updateStats().catch(()=>{});this.emit('state',this.getState());}
  setFilter(query:string) {this.assertAlive();this.query=query;this.scroll.scrollTop=0;this.rebuildRows();$<HTMLInputElement>(this.root,'[aria-label="Filter sequences"]').value=query;if(this.options.statisticsScope==='filtered')void this.updateStats().catch(()=>{});this.emit('state',this.getState());}
  async setSort(sort:ViewState['sort']) {
    this.assertAlive();if(!['input','name','identity','manual','tree'].includes(sort))throw new Error('Unknown sequence order.');
    if(sort==='tree'&&!this.tree)throw new Error('Load a tree with setTree before ordering by tree.');
    if(sort==='manual'&&!this.manualOrder&&this.a)this.manualOrder=this.orderAll().map(i=>this.a!.rows[i].id);
    this.sort=sort;$<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value=sort;
    if(sort==='identity'&&this.a) {
      const a=this.a,ref=this.reference;this.message('Comparing sequences with the reference…');
      try{const results=await this.ranking.identities(a,ref,a.rows.map((_,i)=>i));if(this.disposed)return;if(this.a!==a||this.reference!==ref||this.sort!==sort){this.message('');return;}this.identityDetails=results;this.inspectorDirty=true;this.identities=results.map(r=>r.identity??-1);this.message('');}catch(error){this.error(error);return;}
    }
    this.rebuildRows();this.emit('state',this.getState());
  }
  private rowIndexes(ids:string[]):number[] {
    const a=this.a;if(!a)throw new Error('No alignment is loaded.');
    return ids.map(id=>{const i=a.rows.findIndex(r=>r.id===id);if(i<0)throw new Error(`Unknown sequence ID “${id}”.`);return i;});
  }
  /** Hide rows from the grid, the filtered statistics scope and exports of visible rows; the alignment is unchanged. */
  hideRows(ids:string[]) {this.assertAlive();for(const i of this.rowIndexes(ids))this.hidden.add(this.a!.rows[i].id);this.rowsChanged();}
  /** Show the given hidden rows, or every hidden row when `ids` is omitted. */
  showRows(ids?:string[]) {this.assertAlive();if(ids)for(const id of ids)this.hidden.delete(id);else this.hidden.clear();this.rowsChanged();}
  /** All row IDs in the current sort order, including hidden and filtered rows; moveRow indexes into this list. */
  getRowOrder():string[] {this.assertAlive();return this.orderAll().map(i=>this.a!.rows[i].id);}
  /** Move a row to a zero-based position of getRowOrder() (clamped) and switch to manual order. */
  moveRow(id:string,index:number) {
    this.assertAlive();if(!Number.isInteger(index))throw new Error('Row index must be an integer.');
    this.rowIndexes([id]);const order=this.getRowOrder().filter(x=>x!==id);order.splice(bounded(index,0,order.length),0,id);
    this.manualOrder=order;this.sort='manual';$<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value='manual';this.rebuildRows();this.emit('state',this.getState());
  }
  /** Delete rows from a copy of the alignment, keep the view and recompute statistics. The alignment ID changes. */
  async removeRows(ids:string[]):Promise<void> {
    this.assertAlive();const a=this.a;this.rowIndexes(ids);const drop=new Set(ids);
    if(!drop.size)return;if(drop.size>=a!.rows.length)throw new Error('At least one sequence must remain.');
    const next=createAlignment(a!.rows.filter(r=>!drop.has(r.id)),{name:a!.name,alphabet:a!.alphabet,metadata:a!.metadata,annotations:a!.annotations.filter(x=>!x.rowId||!drop.has(x.rowId))});
    const filter=this.annotationFilter,selected=this.selection?.rowId;
    await this.replace(next,{reference:a!.rows[this.reference].id,selection:selected&&drop.has(selected)?null:this.selection,selectedRows:[...this.selectedRows],query:this.query,sort:this.sort==='identity'?'input':this.sort,hidden:[...this.hidden],manualOrder:this.manualOrder,collapsed:[...this.collapsed],groupMap:this.groupMap,tree:this.tree?.layout,annotationFilter:{...filter,hiddenRowIds:filter.hiddenRowIds?.filter(id=>!drop.has(id))},hiddenColumns:this.manualHidden});
    if(this.a===next&&this.tree?.note)this.message(this.tree.note);
  }
  /** Group rows by an explicit map of row ID to group name, or pass null to fall back to the groupBy option. Unlisted rows go to Ungrouped. */
  setGroups(groups:Record<string,string>|null) {
    this.assertAlive();if(groups!==null&&(typeof groups!=='object'||Array.isArray(groups)))throw new Error('Groups must be an object of row ID to group name, or null.');
    this.groupMap=groups?new Map(Object.entries(groups).map(([id,name])=>[id,String(name)])):null;this.rebuildRows();this.emit('state',this.getState());
  }
  /** Collapse or expand a group by name; omit `collapsed` to toggle. */
  toggleGroup(name:string,collapsed?:boolean) {
    this.assertAlive();if(collapsed??!this.collapsed.has(name))this.collapsed.add(name);else this.collapsed.delete(name);
    this.rebuildRows();this.emit('state',this.getState());
  }
  /** Show a Newick tree left of the labels and order rows by it. Pass null to remove it. Leaves match rows by ID, then by name; mismatches are reported in a message. */
  setTree(newick:string|null) {
    this.assertAlive();
    if(newick===null){this.tree=undefined;if(this.sort==='tree')this.sort='input';}
    else {
      if(!this.a)throw this.error(new Error('Load an alignment before setting a tree.'));
      let layout:TreeLayout;try{layout=layoutTree(parseNewick(newick));}catch(error){throw this.error(error);}
      this.tree=this.bindTree(layout);this.sort='tree';
    }
    $<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value=this.sort;this.rebuildRows();this.emit('state',this.getState());
  }
  private bindTree(layout:TreeLayout):BoundTree {
    const rows=this.a!.rows,match=matchLeaves(layout,rows),treePos=new Int32Array(rows.length).fill(-1);let rank=0;
    layout.nodes.forEach((node,k)=>{if(node.children.length)return;if(match.leafRow[k]>=0)treePos[match.leafRow[k]]=rank;rank++;});
    const notes=[match.unmatchedLeaves.length?`${match.unmatchedLeaves.length} tree leaves match no sequence (${match.unmatchedLeaves.slice(0,3).map(name=>name||'unnamed').join(', ')}${match.unmatchedLeaves.length>3?', …':''}).`:'',match.unmatchedRows?`${match.unmatchedRows} sequences have no leaf in the tree.`:''].filter(Boolean);
    const note=notes.length?`Tree: ${notes.join(' ')}`:'';if(note)this.message(note);
    return {layout,leafRow:match.leafRow,treePos,note};
  }
  private selectClade(node:number,add=false) {
    const tree=this.tree;if(!tree||!this.a)return;const visible=new Set(this.filteredRows);if(this.pinned)visible.delete(this.reference);if(!add)this.selectedRows.clear();
    for(const leaf of leavesUnder(tree.layout,node)){const row=tree.leafRow[leaf];if(row>=0&&visible.has(row))this.selectedRows.add(this.a.rows[row].id);}
    this.labelKey='';this.inspectorDirty=true;this.schedule();$(this.root,'.ak-live').textContent=`${this.selectedRows.size} sequences selected from the tree`;
  }
  setReference(id:string) {
    this.assertAlive();if(!this.a)return;const row=this.a.rows.findIndex(r=>r.id===id);if(row<0)throw new Error('Unknown reference sequence.');
    this.reference=row;this.identities=undefined;this.identityDetails=undefined;this.rebuildRows();this.inspectorDirty=true;this.schedule();if(this.sort==='identity')void this.setSort('identity');this.emit('state',this.getState());
  }
  setSelection(selection:Selection|null,scrollIntoView=true,keepTab=false) {
    this.assertAlive();if(!this.a)return;
    if(selection&&(!Number.isInteger(selection.start)||!Number.isInteger(selection.end)||selection.start<1||selection.end<selection.start||selection.end>this.a.width||(selection.rowId&&!this.a.rows.some(r=>r.id===selection.rowId))))throw new Error('Invalid selection coordinates or row ID.');
    const before=this.drawnTracks();
    this.selection=selection?{...selection}:null;if(this.drawnTracks()!==before)this.layout();if(!keepTab)this.tab='position';this.ensureTab();this.inspectorDirty=true;
    if(selection){$<HTMLInputElement>(this.root,'[aria-label="Go to alignment column"]').value=this.goToText(selection.start);if(scrollIntoView)this.reveal(selection);$(this.root,'.ak-live').textContent=`Column ${selection.start}${selection.end!==selection.start?` through ${selection.end}`:''}${selection.rowId?`, ${this.a.rows.find(r=>r.id===selection.rowId)?.name}`:''}`;}
    this.schedule();this.emit('selection',this.selection);this.emit('state',this.getState());
  }
  private goToText(column:number):string {
    if(this.options.rulerCoordinates!=='reference'||!this.a)return String(column);
    return String(columnToResidue(this.a,this.reference,column)??'');
  }
  /** Select residue `position` (1-based, numbered as in the ruler, so offset by `metadata.start`) of the row with this ID. Returns false and shows a message when the row or residue does not exist. */
  goToResidue(rowId:string,position:number):boolean {
    this.assertAlive();if(!this.a)return false;
    const row=this.a.rows.findIndex(r=>r.id===rowId);
    if(row<0){this.message(`No sequence with ID ${rowId}.`);return false;}
    const column=Number.isInteger(position)?residueToColumn(this.a,row,position):null;
    if(column===null){this.message(`${this.a.rows[row].name} has no residue ${position}.`);return false;}
    if(this.columnHidden(column))return false;
    this.setSelection({start:column,end:column,rowId});return true;
  }
  private goTo(input:string):boolean {
    const a=this.a;if(!a)return false;const text=input.trim(),plain=/^\d+$/.test(text),split=text.lastIndexOf(':');
    if(plain){
      const n=Number(text);
      if(this.options.rulerCoordinates==='reference'){
        const column=residueToColumn(a,this.reference,n);
        if(column===null){this.message(`${a.rows[this.reference].name} has no residue ${n}.`);return false;}
        if(this.columnHidden(column))return false;
        this.setSelection({start:column,end:column});return true;
      }
      if(n>=1&&n<=a.width){if(this.columnHidden(n))return false;this.setSelection({start:n,end:n});return true;}
      this.message(`Enter a column from 1 to ${a.width}.`);return false;
    }
    const key=text.slice(0,split).trim(),number=text.slice(split+1).trim();
    if(split>0&&/^\d+$/.test(number)){
      const row=a.rows.find(r=>r.id===key)??a.rows.find(r=>r.name===key);
      if(!row){this.message(`No sequence named ${key}.`);return false;}
      return this.goToResidue(row.id,Number(number));
    }
    this.message('Enter a number or row:residue, for example 123 or seq-1:45.');return false;
  }
  private reveal(s:Selection) {
    const available=this.scroll.clientWidth-this.gutter,x=this.columns.before[s.start-1]*this.options.cellWidth;
    if(x<this.scroll.scrollLeft||x+this.options.cellWidth>this.scroll.scrollLeft+available)this.scroll.scrollLeft=Math.max(0,x-available/2);
    if(s.rowId&&this.a){const r=this.a.rows.findIndex(x=>x.id===s.rowId),index=r<0?-1:this.rowPos[r],y=index*this.options.rowHeight;if(index>=0&&(y<this.scroll.scrollTop||y+this.options.rowHeight>this.scroll.scrollTop+this.scroll.clientHeight))this.scroll.scrollTop=y;}
  }
  setAnnotationFilter(filter:AnnotationFilter) {this.assertAlive();this.annotationFilter={...filter};this.featurePage=0;this.rebuildAnnotations();this.inspectorDirty=true;this.schedule();}
  addAnnotations(list:Annotation[]):void {
    this.assertAlive();if(!this.a)throw new Error('Load an alignment before adding annotations.');
    const ids=new Set(this.a.annotations.map(a=>a.id)),rows=new Set(this.a.rows.map(r=>r.id));
    for(const a of list){
      if(ids.has(a.id))throw new Error(`Duplicate annotation ID “${a.id}”.`);ids.add(a.id);
      if(a.rowId&&!rows.has(a.rowId))throw new Error(`Annotation “${a.id}” refers to unknown sequence “${a.rowId}”.`);
      if(a.mapping==='mapped'&&(!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start!<1||a.end!<a.start!||a.end!>this.a.width))throw new Error(`Annotation “${a.id}” has invalid alignment coordinates.`);
    }
    this.a.annotations=[...this.a.annotations,...list.map(a=>({...a}))];this.refreshAnnotations();
  }
  removeAnnotations(ids?:string[]):void {
    this.assertAlive();if(!this.a)return;const drop=ids&&new Set(ids);
    this.a.annotations=drop?this.a.annotations.filter(a=>!drop.has(a.id)):[];this.refreshAnnotations();
  }
  importAnnotations(text:string,options:AnnotationImportOptions={}):AnnotationImportResult {
    this.assertAlive();if(!this.a)throw new Error('Load an alignment before importing annotations.');
    const result=importAnnotations(this.a,text,options);this.addAnnotations(result.annotations);
    const mapped=result.annotations.filter(a=>a.mapping==='mapped').length;
    this.message(`Imported ${result.annotations.length} annotations (${mapped} mapped).${result.warnings.length?` ${result.warnings.length} warnings: ${result.warnings.slice(0,3).join(' ')}${result.warnings.length>3?' …':''}`:''}`);
    return result;
  }
  private async openFile(file:File) {
    if(this.a&&/\.(?:gff3?|bed|gb|gbk|genbank|embl)(?:\.gz)?$/i.test(file.name)){
      try{this.importAnnotations(await readAlignmentInput(file));}catch(error){this.error(error);}
      return;
    }
    await this.load(file,{name:file.name}).catch(()=>{});
  }
  private refreshAnnotations() {this.rebuildAnnotations();this.featurePage=Math.min(this.featurePage,Math.max(0,Math.ceil(this.filteredAnnotations.visible.length/30)-1));this.inspectorDirty=true;this.overviewDirty=true;this.schedule();}
  private rebuildAnnotations() {this.filteredAnnotations=filterAnnotations(this.a?.annotations??[],this.annotationFilter);this.annotationIndex=new AnnotationIndex(this.filteredAnnotations.visible);}
  getState():ViewState {return {version:1,alignmentId:this.a?.id??'',referenceId:this.a?.rows[this.reference]?.id??null,query:this.query,sort:this.sort,start:this.firstColumn()+1,rowOffset:Math.floor(this.scroll.scrollTop/this.options.rowHeight),cellWidth:this.options.cellWidth,selection:this.selection?{...this.selection}:null,colorScheme:this.options.colorScheme,colorMode:this.options.colorMode,matchDisplay:this.options.matchDisplay,statisticsScope:this.options.statisticsScope,rulerCoordinates:this.options.rulerCoordinates,annotationFilter:structuredClone(this.annotationFilter),visibility:this.getVisibility(),hiddenRowIds:[...this.hidden],manualOrder:this.manualOrder?[...this.manualOrder]:null,collapsedGroups:[...this.collapsed],hiddenColumns:this.manualHidden.map(r=>[...r] as ColumnRange)};}
  async setState(state:ViewState) {
    if(!this.a||state.version!==1||state.alignmentId!==this.a.id)throw new Error('View state belongs to a different alignment or unsupported version.');
    if(!Number.isFinite(state.start)||!Number.isFinite(state.rowOffset))throw new Error('Invalid view state.');
    const hiddenColumns=mergeColumnRanges(state.hiddenColumns??[]);
    if(hiddenColumns.some(([s,e])=>!Number.isInteger(s)||!Number.isInteger(e)||s<1||e<s||e>this.a!.width)||(hiddenColumns.length===1&&hiddenColumns[0][0]===1&&hiddenColumns[0][1]===this.a.width))throw new Error('Invalid hidden columns in view state.');
    this.manualHidden=hiddenColumns;this.colMap=undefined;
    this.setOptions({cellWidth:state.cellWidth,colorScheme:state.colorScheme,colorMode:state.colorMode,matchDisplay:state.matchDisplay??'letter',statisticsScope:state.statisticsScope,rulerCoordinates:state.rulerCoordinates??'alignment',visibility:state.visibility});this.setFilter(state.query);if(state.referenceId)this.setReference(state.referenceId);
    const known=new Set(this.a.rows.map(r=>r.id));this.hidden=new Set((state.hiddenRowIds??[]).filter(id=>known.has(id)));this.manualOrder=state.manualOrder?state.manualOrder.filter(id=>known.has(id)):null;this.collapsed=new Set(state.collapsedGroups??[]);
    await this.setSort(state.sort==='tree'&&!this.tree?'input':state.sort);if(this.options.statisticsScope==='filtered')void this.updateStats().catch(()=>{});this.setAnnotationFilter(state.annotationFilter);this.setSelection(state.selection,false);
    this.scroll.scrollLeft=this.columns.before[Math.min(Math.max(1,state.start),this.a.width)-1]*this.options.cellWidth;this.scroll.scrollTop=state.rowOffset*this.options.rowHeight;this.schedule();
  }
  private view():RenderView {return {a:this.a!,stats:this.stats,rows:this.rows,reference:this.reference,x:this.scroll.scrollLeft,y:this.scroll.scrollTop,cw:this.options.cellWidth,rh:this.options.rowHeight,gutter:this.gutter,scheme:this.options.colorScheme,mode:this.options.colorMode,matchDots:this.matchDots,dark:this.options.theme==='dark',selection:this.selection,annotations:this.annotationIndex,logo:this.options.showLogo,visibility:this.visibility,threshold:this.options.consensusThreshold,ruler:this.options.rulerCoordinates,hits:this.searchState?.byRow,activeHit:this.searchState?.result.hits[this.searchState.cursor],columns:this.columns,tracks:this.drawnTracks(),logoMode:this.options.logoMode,window:this.options.conservationWindow,groups:this.groupList,trackError:(id,error)=>{if(!this.trackErrors.has(id)){this.trackErrors.add(id);this.error(new Error(`Track ${id}: render failed: ${error.message}`));}}};}
  private layout() {
    if(this.disposed)return;const rh=this.options.rowHeight,gutter=this.gutter;
    const extra=this.drawnTracks(),tracks=trackLayout(this.visibility,rh,extra.map(t=>({height:trackHeight(t)})),this.a?.alphabet);
    const showColumns=$(this.root,'[data-action="show-columns"]'),hiddenColumns=this.columns.width-this.columns.count;
    showColumns.dataset.empty=String(!hiddenColumns);showColumns.textContent=`Show all columns (${hiddenColumns.toLocaleString()} hidden)`;
    const showHidden=$(this.root,'[data-action="show-hidden"]');showHidden.dataset.empty=String(!this.hidden.size);showHidden.textContent=`Show hidden (${this.hidden.size})`;
    $(this.root,'.ak-tree-canvas').dataset.empty=String(!this.treeW);$<HTMLOptionElement>(this.root,'select[aria-label="Sequence order"] option[value="tree"]').hidden=!this.tree;
    this.menus.sync();applyVisibility(this.root,this.visibility);
    this.root.style.setProperty('--ak-tree',this.treeW+'px');this.root.style.setProperty('--ak-gutter',gutter+'px');this.root.style.setProperty('--ak-row-height',rh+'px');
    this.root.dataset.compactRows=String(rh<32);
    $(this.root,'.ak-tracks').style.height=tracks.height+'px';$(this.root,'.ak-tracks').hidden=tracks.height===0;
    const strip=$(this.root,'.ak-track-labels');
    $(this.root,'.ak-track-labels').children[0].textContent=this.options.rulerCoordinates==='reference'?'Reference residue':'Alignment position';
    [...strip.children].slice(0,trackNames.length).forEach((label,i)=>{const node=label as HTMLElement,offset=tracks.offsets[trackNames[i]];node.hidden=offset===null;node.style.top=((offset??0)+(trackNames[i]==='reference'?0:3))+'px';});
    const key=extra.map((t,i)=>`${t.id}|${t.label}|${tracks.custom[i]?.offset}`).join('\n');
    if(key!==this.trackKey){this.trackKey=key;for(const old of strip.querySelectorAll('.ak-custom-label'))old.remove();
      extra.forEach((t,i)=>{const slot=tracks.custom[i];if(!slot)return;const node=document.createElement('span');node.className='ak-custom-label';node.textContent=t.label;node.title=t.label;node.style.top=(slot.offset+Math.max(0,(slot.height-20)/2))+'px';strip.append(node);});}
    const message=$(this.root,'.ak-message');message.hidden=!this.visibility.messages||!message.textContent;
    const spacer=$(this.root,'.ak-spacer');spacer.style.width=(gutter+this.columns.count*this.options.cellWidth)+'px';spacer.style.height=Math.max(1,this.rows.length*rh)+'px';
    $(this.root,'.ak-empty').hidden=!this.visibility.emptyState||(!!this.a&&this.rows.length>0);
    if(this.a&&!this.rows.length)$(this.root,'.ak-empty').textContent=this.hidden.size&&!this.filteredRows.length&&!this.query?'No sequences are visible. Use Show hidden to restore them.':this.pinned?(this.filteredRows.length?'The reference is pinned above.':'No sequences match this filter. The reference remains pinned.'):'No sequences match this filter.';
    $(this.root,'[aria-label="Zoom level"]').textContent=this.options.cellWidth+' px';
    this.schedule();
  }
  private schedule() {if(this.disposed)return;this.menus.sync();if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();});}
  private render() {
    if(!this.a||this.disposed)return;const width=$(this.root,'.ak-main').clientWidth,height=this.scroll.clientHeight;if(width<1)return;
    const v=this.view();this.renderer.body($(this.root,'.ak-body-canvas'),v,width,height);this.renderer.tracks($(this.root,'.ak-tracks canvas'),v,width);
    const overview=$(this.root,'.ak-overview');if(this.overviewDirty&&this.visibility.overview){this.renderer.overview($(overview,'canvas'),v,overview.clientWidth);this.overviewDirty=false;}
    const win=$(overview,'.ak-overview-window');const visible=Math.max(1,(width-v.gutter)/v.cw),count=this.columns.count,left=v.x/v.cw/count;
    win.style.left=Math.min(1,left)*100+'%';win.style.width=Math.min(1,visible/count)*100+'%';overview.setAttribute('aria-valuemax',String(count));overview.setAttribute('aria-valuenow',String(Math.floor(v.x/v.cw)+1));
    this.treeHits=this.tree&&this.treeW?this.renderer.tree($(this.root,'.ak-tree-canvas'),v,this.tree.layout,this.tree.leafRow,this.rowPos,this.treeW,height):[];
    const ref=$(this.root,'.ak-reference-label');ref.textContent=this.a.rows[this.reference]?.name??'Reference';ref.title='Pinned reference: '+ref.textContent;
    const first=Math.max(0,Math.floor(v.y/v.rh)),last=Math.min(this.rows.length,Math.ceil((v.y+height)/v.rh));
    const key=[first,last,this.rows.slice(first,last).join(','),[...this.selectedRows].join(',')].join(':');
    if(this.labelKey!==key){this.labelKey=key;const fragment=document.createDocumentFragment();
      for(let i=first;i<last;i++){
        const item=this.rows[i],label=document.createElement('div');label.dataset.index=String(i);
        if(item<0) {
          const group=this.groupList[-item-1],toggle=document.createElement('button'),name=document.createElement('span'),count=document.createElement('small');
          label.className='ak-row-label ak-group-label';label.style.setProperty('--ak-group',group.color);
          toggle.type='button';toggle.dataset.group=group.name;toggle.title=`${group.name}: ${group.count} sequences`;toggle.setAttribute('aria-expanded',String(!group.collapsed));
          name.className='ak-group-name';name.textContent=`${group.collapsed?'▸':'▾'} ${group.name}`;count.className='ak-group-count';count.textContent=String(group.count);toggle.append(name,count);label.append(toggle);fragment.append(label);continue;
        }
        const row=this.a.rows[item];label.className='ak-row-label';label.draggable=this.visibility.rowReordering;
        if(this.rowGroup[item]>=0){label.dataset.grouped='true';label.style.setProperty('--ak-group',this.groupList[this.rowGroup[item]].color);}
        const check=document.createElement('input');check.type='checkbox';check.checked=this.selectedRows.has(row.id);check.setAttribute('aria-label',`Select ${row.name}`);check.dataset.selectRow=row.id;
        const button=document.createElement('button');button.type='button';button.dataset.row=row.id;button.title=row.name+(row.species?' · '+row.species:'');const name=document.createElement('span');name.className='ak-row-name';name.textContent=row.name;button.append(name);if(row.species){const species=document.createElement('small');species.className='ak-row-species';species.textContent=row.species;button.append(species);}
        const hide=document.createElement('button');hide.type='button';hide.dataset.hide=row.id;hide.className='ak-hide';hide.textContent='×';hide.title='Hide this row';hide.setAttribute('aria-label',`Hide ${row.name}`);
        const pin=document.createElement('button');pin.type='button';pin.dataset.pin=row.id;pin.className='ak-pin';pin.textContent='◇';pin.setAttribute('aria-label',`Pin ${row.name} as reference`);
        label.append(check,button,hide,pin);fragment.append(label);
      }this.labels.replaceChildren(fragment);
      if(this.focusRow){this.labels.querySelector<HTMLElement>(`[data-row="${CSS.escape(this.focusRow)}"]`)?.focus();this.focusRow=undefined;}
    }
    for(const label of this.labels.children as HTMLCollectionOf<HTMLElement>)label.style.transform=`translateY(${Number(label.dataset.index)*v.rh-v.y}px)`;
    if(this.inspectorDirty){this.inspectorDirty=false;if(this.tab)renderInspector(this.inspector,{a:this.a,stats:this.stats,selection:this.selection,scheme:this.options.colorScheme,reference:this.reference,selectedRows:this.selectedRows,annotations:this.filteredAnnotations.visible,annotationFilter:this.annotationFilter,unknown:this.filteredAnnotations.unknown,excluded:this.filteredAnnotations.excluded,tab:this.tab,page:this.featurePage,scope:this.options.statisticsScope,hits:this.searchState?.result.hits??[],truncated:this.searchState?.result.truncated??false,pattern:this.searchState?.pattern??'',hit:this.searchState?.cursor??-1,identity:this.selection?.rowId?this.identityDetails?.[this.a.rows.findIndex(r=>r.id===this.selection!.rowId)]:undefined});for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]'))button.setAttribute('aria-pressed',String(button.dataset.tab===this.tab));this.menus.sync();}
    if(!this.tab)this.inspector.replaceChildren();
    applyVisibility(this.root,this.visibility);
    const m=this.columns,start=(m.cols[Math.min(m.count-1,Math.floor(v.x/v.cw))]??0)+1,end=(m.cols[Math.min(m.count,Math.ceil((v.x+width-v.gutter)/v.cw))-1]??this.a.width-1)+1;
    $(this.root,'.ak-status-main').textContent=`${this.a.rows.length.toLocaleString()} sequences${this.query?` · ${this.filteredRows.length.toLocaleString()} filtered`:''}${this.hidden.size?` · ${this.hidden.size.toLocaleString()} hidden`:''} · ${this.a.width.toLocaleString()} columns${m.count<m.width?` · ${(m.width-m.count).toLocaleString()} hidden`:''}${this.searchState?` · ${hitCount(this.searchState.result)}`:''}`;
    $(this.root,'.ak-status-detail').textContent=`${start}–${end} · ${this.stats?`${this.options.statisticsScope} rows`:'statistics pending'} · ${this.a.alphabet.toUpperCase()}`;
    this.scroll.setAttribute('aria-rowcount',String(this.a.rows.length));this.scroll.setAttribute('aria-colcount',String(m.count));
    this.emit('viewport',{start,end,firstRow:first,lastRow:last,visibleRows:last-first,totalRows:this.a.rows.length});
  }
  private message(message:string,isError=false) {const target=$(this.root,'.ak-message');target.hidden=!message||!this.visibility.messages;target.textContent=message;target.dataset.error=String(isError);}
  private zoom(value:number) {const available=this.scroll.clientWidth-this.gutter,center=(this.scroll.scrollLeft+available/2)/this.options.cellWidth;this.setOptions({cellWidth:value});this.scroll.scrollLeft=Math.max(0,center*this.options.cellWidth-available/2);this.schedule();}
  /** The display item under a pointer in the grid: a row index, a negative group header, or undefined. */
  private itemAt(event:MouseEvent):number|undefined {
    if(!this.a)return undefined;const rect=this.scroll.getBoundingClientRect();
    if(event.clientX-rect.left-this.gutter<0)return undefined;return this.rows[Math.floor((event.clientY-rect.top+this.scroll.scrollTop)/this.options.rowHeight)];
  }
  private eventAt(event:MouseEvent):Selection|null {
    const item=this.itemAt(event);if(!this.a||item===undefined||item<0)return null;
    const d=Math.floor((event.clientX-this.scroll.getBoundingClientRect().left-this.gutter+this.scroll.scrollLeft)/this.options.cellWidth);
    return d<0||d>=this.columns.count?null:{start:this.columns.cols[d]+1,end:this.columns.cols[d]+1,rowId:this.a.rows[item].id};
  }
  private stepRow(index:number,step:number):number|undefined {for(let i=index+step;i>=0&&i<this.rows.length;i+=step)if(this.rows[i]>=0)return this.rows[i];return undefined;}
  private async action(action:string) {
    try {
      if(action==='close-fasta-options'){this.fastaPanel(false);return;}
      if(action==='open'){$<HTMLInputElement>(this.root,'.ak-file').click();return;}
      if(action==='zoom-in')this.zoom(this.options.cellWidth+2);
      if(action==='zoom-out')this.zoom(this.options.cellWidth-2);
      if(action==='fit'&&this.a)this.zoom(Math.max(3,Math.floor((this.scroll.clientWidth-this.gutter)/this.columns.count)));
      if(action==='theme')this.setOptions({theme:this.options.theme==='light'?'dark':'light'});
      if(action==='inspect')this.setOptions({showInspector:!this.options.showInspector});
      if(action==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else if(this.root.requestFullscreen)await this.root.requestFullscreen();else this.message('Full screen is unavailable in this browser.');}
      if(action==='reference-info'&&this.a)this.setSelection({start:this.selection?.start??1,end:this.selection?.end??1,rowId:this.a.rows[this.reference].id},false);
      if(action==='pin-selected'&&this.selection?.rowId)this.setReference(this.selection.rowId);
      if(action==='toggle-row-features'&&this.selection?.rowId){const ids=new Set(this.annotationFilter.hiddenRowIds??[]),id=this.selection.rowId;if(ids.has(id))ids.delete(id);else ids.add(id);this.setAnnotationFilter({...this.annotationFilter,hiddenRowIds:[...ids]});}
      if(action==='features-prev'){this.featurePage=Math.max(0,this.featurePage-1);this.inspectorDirty=true;this.schedule();}
      if(action==='features-next'){this.featurePage++;this.inspectorDirty=true;this.schedule();}
      if(action==='show-hidden')this.showRows();
      if(action==='hide-columns'){const sel=this.selection;if(!sel){this.message('Select columns first, then hide them.');return;}this.hideColumns(sel.start,sel.end);this.setSelection(null,false);}
      if(action==='show-columns')this.showColumns();
      if(action==='clear-rows'){this.selectedRows.clear();this.labelKey='';this.inspectorDirty=true;this.schedule();}
      if(action==='compare'&&this.a){const ids=new Map(this.a.rows.map((r,i)=>[r.id,i])),rows=[...this.selectedRows].map(id=>ids.get(id)!);const a=this.a,revision=this.revision,selectionKey=[...this.selectedRows].join(',');this.message('Calculating pairwise identity…');const matrix=await this.comparison.pairwise(a,rows);if(this.disposed||this.revision!==revision)return;this.message('');if(this.tab!=='compare'||selectionKey!==[...this.selectedRows].join(','))return;const target=$(this.inspector,'.ak-identity-result');target.innerHTML=`<div class="ak-matrix-scroll"><table><caption>Identity over canonical comparable positions</caption><thead><tr><th>Sequence</th>${rows.map(i=>`<th>${e(this.a!.rows[i].name)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr><th>${e(this.a!.rows[row].name)}</th>${matrix[i].map(cell=>`<td title="${cell.matches} matches / ${cell.compared} compared">${cell.identity===null?'NA':(cell.identity*100).toFixed(1)+'%'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
      if(action==='motif'||action==='motif-prev'){
        const started=this.findMotif($<HTMLInputElement>(this.root,'[aria-label="Find motif"]').value,action==='motif'?1:-1);
        if(started&&this.visibility.hitsTab){this.tab='hits';this.inspectorDirty=true;this.schedule();}
      }
    }catch(error){this.error(error);}
  }
  /** Readable URL parameters for the current view, including `src` when the alignment came from loadUrl. */
  getViewLink():string {this.assertAlive();return encodeViewLink(this.getState(),this.sourceUrl);}
  /** Apply a link leniently: settings that do not fit this alignment are skipped and returned by name. Missing fields reset to defaults. */
  async applyViewLink(input:ViewLink|string):Promise<string[]> {
    this.assertAlive();if(!this.a)throw new Error('Load an alignment before applying a view link.');
    const link=typeof input==='string'?decodeViewLink(input):input,a=this.a,skipped=[...(link.ignored??[])];
    const options:ViewerOptions={colorMode:link.colorMode??'all',matchDisplay:link.matchDisplay??'letter',statisticsScope:link.statisticsScope??'all',rulerCoordinates:link.rulerCoordinates??'alignment'};
    if(link.cellWidth!==undefined)options.cellWidth=link.cellWidth;
    if(link.colorScheme){if(colorSchemes(a.alphabet).some(s=>s.id===link.colorScheme))options.colorScheme=link.colorScheme;else skipped.push('scheme');}
    this.setOptions(options);this.setFilter(link.query??'');
    const hide=link.hiddenColumns??[];
    if(hide.some(([,e])=>e>a.width)||hide.length===1&&hide[0][0]===1&&hide[0][1]===a.width){skipped.push('hide');this.manualHidden=[];}else this.manualHidden=hide;
    this.colMap=undefined;this.overviewDirty=true;this.layout();
    if(link.referenceId){if(a.rows.some(r=>r.id===link.referenceId))this.setReference(link.referenceId);else skipped.push('ref');}
    let sort=link.sort??'input';if(sort==='tree'&&!this.tree){skipped.push('sort');sort='input';}
    await this.setSort(sort);
    if(this.disposed||this.a!==a)return skipped;
    const s=link.selection;
    if(s&&(s.end>a.width||(s.rowId&&!a.rows.some(r=>r.id===s.rowId)))){skipped.push('sel');this.setSelection(null,false);}
    else this.setSelection(s??null,link.start===undefined);
    if((link.start??1)<=a.width)this.scroll.scrollLeft=this.columns.before[(link.start??1)-1]*this.options.cellWidth;else skipped.push('x');
    if((link.rowOffset??0)<Math.max(1,this.rows.length))this.scroll.scrollTop=(link.rowOffset??0)*this.options.rowHeight;else skipped.push('y');
    this.schedule();
    const notes=[link.alignmentId&&link.alignmentId!==a.id?'This link was made for a different version of this alignment.':'',skipped.length?`Skipped link settings: ${skipped.join(', ')}.`:''].filter(Boolean);
    if(notes.length)this.message(notes.join(' '));
    return skipped;
  }
  private scheduleLink() {
    if(!this.urlSync||this.pendingLink||!this.a||this.disposed)return;
    clearTimeout(this.linkTimer);
    this.linkTimer=setTimeout(()=>{if(this.disposed||!this.a||this.pendingLink)return;const hash='#'+this.getViewLink();if(hash===location.hash)return;
      try{history.replaceState(history.state,'',location.pathname+location.search+hash);this.lastHash=hash;}
      catch(error){this.urlSync=false;this.error(new Error(`URL sync stopped: ${(error as Error).message}`));}
    },250);
  }
  /** Search every filtered row for an IUPAC, regex or PROSITE motif, highlight the hits and list them in the Hits tab. Throws on an invalid pattern. */
  search(pattern:string,options:Pick<SearchOptions,'mode'|'strands'>={}):SearchResult {
    this.assertAlive();if(!this.a)return {hits:[],truncated:false};
    const state=this.runSearch(pattern.trim(),{mode:options.mode,strands:options.strands});this.message('');
    return {hits:[...state.result.hits],truncated:state.result.truncated};
  }
  getSearchHits():Hit[] {return [...(this.searchState?.result.hits??[])];}
  clearSearch() {
    this.assertAlive();if(!this.searchState)return;
    this.dropSearch();this.inspectorDirty=true;this.schedule();
  }
  private dropSearch() {
    $<HTMLInputElement>(this.root,'[aria-label="Find motif"]').value='';
    if(!this.searchState)return;
    this.searchState=undefined;this.emit('search',null);
  }
  private runSearch(pattern:string,options:SearchOptions,refilter=false) {
    const old=this.searchState,same=old?.pattern===pattern;let full=same?old!.full:undefined,result:SearchResult;
    if(!same){full=findHits(this.a!,pattern,options);if(full.truncated)full=undefined;}
    if(full){
      const hits=new Map<number,Hit[]>();for(const hit of full.hits){const list=hits.get(hit.row);if(list)list.push(hit);else hits.set(hit.row,[hit]);}
      result={hits:this.filteredRows.flatMap(r=>hits.get(r)??[]),truncated:false};
    }else result=findHits(this.a!,pattern,{...options,rows:this.filteredRows});
    const byRow=new Map<number,Hit[]>(),previous=same?old!.result.hits[old!.cursor]:undefined;
    for(const hit of result.hits){const list=byRow.get(hit.row);if(list)list.push(hit);else byRow.set(hit.row,[hit]);}
    const cursor=previous?result.hits.findIndex(h=>h.rowId===previous.rowId&&h.start===previous.start&&h.end===previous.end&&h.strand===previous.strand):-1;
    this.searchState={pattern,options,result,byRow,cursor,full};this.inspectorDirty=true;this.schedule();
    const key=(h:Hit)=>`${h.row}:${h.start}:${h.end}:${h.strand}`;
    if(!refilter||!old||old.result.truncated!==result.truncated||old.result.hits.length!==result.hits.length||result.hits.some((h,i)=>key(h)!==key(old.result.hits[i])))this.emit('search',result);
    return this.searchState;
  }
  private goToHit(index:number) {
    const state=this.searchState,hit=state?.result.hits[index];if(!state||!hit||!this.a)return;
    state.cursor=index;this.setSelection({start:hit.start,end:hit.end,rowId:hit.rowId},true,this.tab==='hits');
    this.message(`Hit ${index+1} of ${state.result.hits.length.toLocaleString()} in ${this.a.rows[hit.row].name}, sequence positions ${hit.seqStart}–${hit.seqEnd}, ${hit.strand==='+'?'forward':'reverse'} strand.`);
  }
  /** Search for `motif` if it is not the active search, then select the next (1) or previous (-1) hit, wrapping around. Returns true when it started a new search. */
  findMotif(motif:string,direction:1|-1=1):boolean {
    this.assertAlive();if(!this.a)return false;
    try {
      const text=motif.trim();
      if(!text){this.clearSearch();return false;}
      const started=this.searchState?.pattern!==text;
      if(started)this.runSearch(text,{});
      const state=this.searchState!,n=state.result.hits.length;
      if(!n){this.message(`No match for ${text}${this.filteredRows.length<this.a.rows.length?' in the filtered sequences':''}.`);return started;}
      this.goToHit(state.cursor<0?(direction>0?0:n-1):(state.cursor+direction+n)%n);
      return started;
    }catch(error){this.error(error);return false;}
  }
  private exportRegion(a:Alignment):ExportRegion {
    const m=this.columns,start=this.selection?.start??this.firstColumn()+1;
    return {start,end:this.selection?.end??Math.max(start,(m.cols[Math.max(0,Math.min(m.count,Math.ceil((this.scroll.scrollLeft+this.scroll.clientWidth-this.gutter)/this.options.cellWidth))-1)]??a.width-1)+1),rowIds:this.selectedRows.size?[...this.selectedRows]:[...(this.pinned?[a.rows[this.reference].id]:[]),...this.rows.slice(Math.floor(this.scroll.scrollTop/this.options.rowHeight),Math.ceil((this.scroll.scrollTop+this.scroll.clientHeight)/this.options.rowHeight)).filter(i=>i>=0).map(i=>a.rows[i].id)]};
  }
  /** Attach the column mask when `visible` is set or the FASTA option columns is 'visible'. */
  private fastaRegion(region:ExportRegion,visible=this.options.fasta.columns==='visible'):ExportRegion {return visible?{...region,columns:this.columns.mask}:region;}
  /** Rows to copy: checked rows in display order (filtered-out ones last), else the selected row, else the export rows. */
  private copyRegion(a:Alignment):ExportRegion {
    const region=this.exportRegion(a);
    if(this.selectedRows.size) {
      const display=[...(this.pinned?[this.reference]:[]),...this.filteredRows.filter(i=>!this.pinned||i!==this.reference)].map(i=>a.rows[i].id);
      const shown=display.filter(id=>this.selectedRows.has(id)),seen=new Set(shown);
      region.rowIds=[...shown,...a.rows.map(r=>r.id).filter(id=>this.selectedRows.has(id)&&!seen.has(id))];
    } else if(this.selection?.rowId) region.rowIds=[this.selection.rowId];
    return region;
  }
  private copyPayload() {
    this.assertAlive();if(!this.a)throw new Error('No alignment is loaded.');
    const region=this.fastaRegion(this.copyRegion(this.a));if(!region.rowIds?.length)throw new Error('No sequences to copy.');
    const resolved=resolveRegion(this.a,region);
    return {text:(this.stats?this.consensusFasta(resolved.start,resolved.end,!!resolved.columns):'')+exportFasta(this.a,region,this.options.fasta),region:resolved};
  }
  /** Consensus over all columns from the current statistics scope; `threshold` defaults to the consensusThreshold option. */
  getConsensus(options:{threshold?:number}={}):string {
    this.assertAlive();if(!this.a)throw new Error('No alignment is loaded.');if(!this.stats)throw new Error('Column statistics are still being calculated.');
    return consensusSequence(this.stats,this.a.alphabet,options.threshold??this.options.consensusThreshold);
  }
  private consensusFasta(start:number,end:number,visible=false) {
    const s=this.stats!,t=this.options.consensusThreshold,mask=this.columns.mask;let sequence=consensusSequence(s,this.a!.alphabet,t,start,end);
    if(visible)sequence=[...sequence].filter((_,i)=>mask[start-1+i]).join('');
    return formatFastaRecord(`consensus columns ${start}-${end}${visible?' (visible columns)':''}; ${this.options.statisticsScope} rows (${s.total}); threshold ${t}`,sequence,this.options.fasta);
  }
  /** Gapped FASTA for the rows and columns that Ctrl/Cmd+C copies, led by the consensus once statistics are ready. */
  getSelectionText():string {return this.copyPayload().text;}
  async copySelection():Promise<void> {
    try {
      const {text,region}=this.copyPayload();
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard access needs a secure (HTTPS) page. Use Export instead.');
      await navigator.clipboard.writeText(text);
      if(this.disposed)return;
      const summary=`Copied ${region.rows.length.toLocaleString()} sequence${region.rows.length===1?'':'s'}, columns ${region.start}–${region.end}, as FASTA.`;
      this.message(summary);$(this.root,'.ak-live').textContent=summary;
    }catch(error){throw this.error(error);}
  }
  private fastaPanel(open:boolean) {
    const panel=$(this.root,'.ak-fasta-options');panel.hidden=!open;this.menus.sync();
    (open?panel.querySelector<HTMLElement>('.ak-select-trigger'):this.root.querySelector<HTMLElement>('.ak-select-trigger[aria-label="Export alignment"]'))?.focus();
  }
  private async export(kind:string) {
    if(!this.a)return;
    try{
      const region=this.exportRegion(this.a);
      if(kind==='fasta-all')download(exportFasta(this.a,this.fastaRegion({}),this.options.fasta),'alignment.fasta');
      if(kind==='fasta')download(exportFasta(this.a,this.fastaRegion(region),this.options.fasta),'selection.fasta');
      if(kind==='fasta-visible')download(exportFasta(this.a,this.fastaRegion({},true),this.options.fasta),'visible-columns.fasta');
      const text=textExports[kind.replace(/-all$/,'')];
      if(text)download(text.write(this.a,kind.endsWith('-all')?{}:region),`${kind.endsWith('-all')?'alignment':'selection'}.${text.ext}`);
      if(kind==='state')download(JSON.stringify(this.getState(),null,2),'alignment-view.json','application/json');
      if(['svg','png','tsv','consensus'].includes(kind)&&!this.stats)throw new Error('Wait for column statistics to finish before exporting.');
      if(kind==='consensus')download(this.consensusFasta(region.start!,region.end!,this.options.fasta.columns==='visible'),'consensus.fasta');
      if(kind==='tsv')download(exportStatistics(this.stats!),'column-statistics.tsv','text/tab-separated-values');
      if(kind==='svg')download(exportSvg({...this.a,annotations:this.filteredAnnotations.visible},this.stats!,region,this.options.colorScheme,{colorMode:this.options.colorMode,matchDisplay:this.options.matchDisplay,referenceId:this.a.rows[this.reference].id}),'alignment.svg','image/svg+xml');
      if(kind==='png')download(await exportPng({...this.a,annotations:this.filteredAnnotations.visible},this.stats!,region,this.options.colorScheme,{colorMode:this.options.colorMode,matchDisplay:this.options.matchDisplay,referenceId:this.a.rows[this.reference].id}),'alignment.png');
    }catch(error){this.error(error);}
  }
  private bind() {
    const signal=this.controller.signal,on=(target:EventTarget,event:string,handler:(event:any)=>void)=>target.addEventListener(event,handler,{signal});
    on(this.scroll,'scroll',()=>this.schedule());
    on(this.root,'paste',(event:ClipboardEvent)=>{
      const target=event.target as HTMLElement|null;
      if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
      const text=event.clipboardData?.getData('text/plain');if(!text?.trim())return;
      event.preventDefault();void this.load(text,{name:'Pasted alignment'}).catch(()=>{});
    });
    on(this.root,'click',(event:MouseEvent)=>{
      const target=event.target as HTMLElement,button=target.closest<HTMLElement>('[data-action],[data-tab],[data-row],[data-pin],[data-feature],[data-hit],[data-group],[data-hide]');if(!button)return;
      if(button.dataset.hit)this.goToHit(Number(button.dataset.hit));
      if(button.dataset.action)void this.action(button.dataset.action);
      if(button.dataset.tab){this.tab=button.dataset.tab;this.inspectorDirty=true;this.schedule();}
      if(button.dataset.pin)this.setReference(button.dataset.pin);
      if(button.dataset.group!==undefined)this.toggleGroup(button.dataset.group);
      if(button.dataset.hide)this.hideRows([button.dataset.hide]);
      if(button.dataset.row)this.setSelection({start:this.selection?.start??1,end:this.selection?.end??1,rowId:button.dataset.row},false);
      if(button.dataset.feature){const feature=this.filteredAnnotations.visible[Number(button.dataset.feature)];if(feature){if(feature.mapping==='mapped')this.setSelection({start:feature.start!,end:feature.end!,rowId:feature.rowId});this.emit('annotation',feature);this.message(`${feature.label}: ${feature.mapping==='mapped'?`alignment columns ${feature.start}–${feature.end}`:'no protein mapping'}. ${JSON.stringify(feature.metadata??{})}`);}}
    });
    const pick=(s:Selection|null,shift:boolean)=>{if(s){if(shift&&this.selection){s.start=Math.min(this.selection.start,s.start);s.end=Math.max(this.selection.end,s.end);}this.setSelection(s,false);}};
      on(this.scroll,'click',(event:MouseEvent)=>{const item=this.itemAt(event);if(item!==undefined&&item<0){this.toggleGroup(this.groupList[-item-1].name);return;}pick(this.eventAt(event),event.shiftKey);});
    on($(this.root,'.ak-tracks'),'click',(event:MouseEvent)=>{
      if(!this.a||(event.target as HTMLElement).closest('button,[data-action]'))return;
      const rect=$(this.root,'.ak-tracks').getBoundingClientRect(),x=event.clientX-rect.left-this.gutter,d=Math.floor((x+this.scroll.scrollLeft)/this.options.cellWidth);
      if(x<0||d<0||d>=this.columns.count)return;const column=this.columns.cols[d]+1;
      const ref=trackLayout(this.visibility,this.options.rowHeight,[],this.a.alphabet).offsets.reference,onRef=ref!==null&&event.clientY-rect.top>=ref&&event.clientY-rect.top<ref+this.options.rowHeight;
      pick({start:column,end:column,...(onRef?{rowId:this.a.rows[this.reference].id}:{})},event.shiftKey);
    });
    const treeCanvas=$<HTMLCanvasElement>(this.root,'.ak-tree-canvas');
    on(treeCanvas,'click',(event:MouseEvent)=>{const rect=treeCanvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;let best:TreeHit|undefined,near=49;for(const hit of this.treeHits){const d=(hit.x-x)**2+(hit.y-y)**2;if(d<=near){near=d;best=hit;}}if(best)this.selectClade(best.node,event.shiftKey);});
    on(treeCanvas,'wheel',(event:WheelEvent)=>{event.preventDefault();this.scroll.scrollTop+=event.deltaY;});
    const labelRow=(event:Event)=>{const label=(event.target as HTMLElement).closest<HTMLElement>('.ak-row-label'),item=label?this.rows[Number(label.dataset.index)]:undefined;return item!==undefined&&item>=0&&this.a?item:undefined;};
    on(this.labels,'dragstart',(event:DragEvent)=>{const item=labelRow(event);if(item===undefined||!this.visibility.rowReordering){event.preventDefault();return;}this.dragId=this.a!.rows[item].id;event.dataTransfer?.setData('text/plain',this.dragId);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
    on(this.labels,'dragover',(event:DragEvent)=>{if(this.dragId)event.preventDefault();});
    on(this.labels,'drop',(event:DragEvent)=>{const id=this.dragId,item=labelRow(event);this.dragId=undefined;if(!id)return;event.preventDefault();event.stopPropagation();if(item!==undefined)this.moveRow(id,this.orderAll().indexOf(item));});
    on(this.labels,'dragend',()=>{this.dragId=undefined;});
    on(this.labels,'keydown',(event:KeyboardEvent)=>{
      const id=(event.target as HTMLElement).dataset?.row;if(!id||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!this.a||!this.visibility.rowReordering)return;
      event.preventDefault();const from=this.a.rows.findIndex(r=>r.id===id),to=this.stepRow(this.rowPos[from],event.key==='ArrowDown'?1:-1);
      if(to!==undefined){this.focusRow=id;this.moveRow(id,this.orderAll().indexOf(to));}
    });
    on(this.root,'change',(event:Event)=>{
      const target=event.target as HTMLInputElement,aria=target.getAttribute('aria-label');
      if(target.dataset.selectRow){if(target.checked)this.selectedRows.add(target.dataset.selectRow);else this.selectedRows.delete(target.dataset.selectRow);this.inspectorDirty=true;this.labelKey='';this.schedule();}
      if(aria==='Alignment file'&&target.files?.[0]){const file=target.files[0];void this.openFile(file);target.value='';}
      if(aria==='Color scheme')this.setOptions({colorScheme:target.value});
      if(aria==='Residues to color')this.setOptions({colorMode:target.value as ColorMode});
      if(aria==='Statistics scope')this.setOptions({statisticsScope:target.value as 'all'|'filtered'});
      if(aria==='Dots for matches')this.setOptions({matchDisplay:target.checked?'dot':'letter'});
      if(aria==='Ruler coordinates'){this.setOptions({rulerCoordinates:target.value as RulerCoordinates});this.emit('state',this.getState());}
      if(aria==='Show frequency logo')this.setOptions({showLogo:target.checked});
      if(aria==='Sequence order')this.setSort(target.value as ViewState['sort']).catch(error=>{this.error(error);$<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value=this.sort;this.menus.sync();});
      if(aria==='Export alignment'){if(target.value==='fasta-options')this.fastaPanel(true);else void this.export(target.value);target.value='';}
      if(aria==='FASTA gaps')this.setOptions({fasta:{gaps:target.value as 'keep'|'remove'}});
      if(aria==='FASTA letter case')this.setOptions({fasta:{letterCase:target.value as 'original'|'upper'|'lower'}});
      if(aria==='FASTA line width')this.setOptions({fasta:{lineWidth:Number(target.value)}});
      if(aria==='FASTA header')this.setOptions({fasta:{header:target.value as 'name'|'name-species'|'id-name'}});
      if(aria==='FASTA columns')this.setOptions({fasta:{columns:target.value as 'all'|'visible'}});
      if(aria==='Sequence alphabet'&&this.a){const old=this.a;void this.setAlignment(createAlignment(old.rows,{name:old.name,alphabet:target.value as Alignment['alphabet'],annotations:old.annotations,metadata:old.metadata})).catch(()=>{});}
      if(aria==='Feature type')this.setAnnotationFilter({...this.annotationFilter,types:target.value?[target.value]:[]});
      if(aria==='Feature consequence')this.setAnnotationFilter({...this.annotationFilter,consequences:target.value?[target.value]:[]});
      if(aria==='Features with disease evidence')this.setAnnotationFilter({...this.annotationFilter,disease:target.checked});
      if(aria==='Features with phenotype evidence')this.setAnnotationFilter({...this.annotationFilter,phenotype:target.checked});
    });
    on($(this.root,'[aria-label="Filter sequences"]'),'input',(event:Event)=>this.setFilter((event.target as HTMLInputElement).value));
    on($(this.root,'[aria-label="Go to alignment column"]'),'keydown',(event:KeyboardEvent)=>{if(event.key==='Enter'&&this.a){const input=event.target as HTMLInputElement,typed=input.value;if(this.goTo(typed))input.value=typed.trim();}});
    const motif=$<HTMLInputElement>(this.root,'[aria-label="Find motif"]');
    on(motif,'keydown',(event:KeyboardEvent)=>{if(event.key==='Enter')void this.action(event.shiftKey?'motif-prev':'motif');});
    on(motif,'input',()=>{if(!motif.value.trim())this.clearSearch();});
    on(this.scroll,'keydown',(event:KeyboardEvent)=>{
      if(!this.a)return;const key=event.key,start=this.selection?.start??this.firstColumn()+1;
      if(['+','=','-','_'].includes(key)){event.preventDefault();this.zoom(this.options.cellWidth+(key==='+'||key==='='?2:-2));return;}
      if(key==='Escape'){this.setSelection(null);return;}
      if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&(key.toLowerCase()==='c'||event.code==='KeyC')&&!this.root.ownerDocument.getSelection()?.toString()){event.preventDefault();void this.copySelection().catch(()=>{});return;}
      if(['ArrowLeft','ArrowRight','Home','End','ArrowUp','ArrowDown'].includes(key)){
        event.preventDefault();let column=start,rowId=this.selection?.rowId;
        if(key==='ArrowLeft')column=this.stepColumn(start,-1);if(key==='ArrowRight')column=this.stepColumn(event.shiftKey?this.selection?.end??start:start,1);if(key==='Home')column=this.columns.cols[0]+1;if(key==='End')column=this.columns.cols[this.columns.count-1]+1;
        if(key==='ArrowDown'||key==='ArrowUp'){const index=rowId?this.rowPos[this.a.rows.findIndex(r=>r.id===rowId)]:Math.floor(this.scroll.scrollTop/this.options.rowHeight),row=this.stepRow(index,key==='ArrowDown'?1:-1);if(row!==undefined)rowId=this.a.rows[row].id;}
        this.setSelection({start:event.shiftKey?Math.min(start,column):column,end:event.shiftKey?Math.max(this.selection?.end??start,column):column,rowId});
      }
    });
    const overview=$(this.root,'.ak-overview');let dragging=false;
    const navigate=(event:PointerEvent)=>{if(!this.a)return;const rect=overview.getBoundingClientRect(),ratio=bounded((event.clientX-rect.left)/rect.width,0,1);this.scroll.scrollLeft=ratio*this.columns.count*this.options.cellWidth-(this.scroll.clientWidth-this.gutter)/2;this.schedule();};
    on(overview,'pointerdown',(event:PointerEvent)=>{dragging=true;overview.setPointerCapture(event.pointerId);navigate(event);});on(overview,'pointermove',(event:PointerEvent)=>{if(dragging)navigate(event);});on(overview,'pointerup',()=>{dragging=false;});
    on(overview,'keydown',(event:KeyboardEvent)=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();this.scroll.scrollLeft+=(event.key==='ArrowRight'?1:-1)*this.options.cellWidth*10;this.schedule();}});
    const separator=$(this.root,'.ak-gutter-resize');let resizing=false,origin=0,gutter=0;
    on(separator,'pointerdown',(event:PointerEvent)=>{resizing=true;origin=event.clientX;gutter=this.options.labelWidth;separator.setPointerCapture(event.pointerId);});on(separator,'pointermove',(event:PointerEvent)=>{if(resizing)this.setOptions({labelWidth:gutter+event.clientX-origin});});on(separator,'pointerup',()=>{resizing=false;});
    on(separator,'keydown',(event:KeyboardEvent)=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.setOptions({labelWidth:this.options.labelWidth+(event.key==='ArrowRight'?10:-10)});}});
    on($(this.root,'.ak-fasta-options'),'keydown',(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();this.fastaPanel(false);}});
    on(this.root,'dragover',(event:DragEvent)=>event.preventDefault());on(this.root,'drop',(event:DragEvent)=>{event.preventDefault();const file=event.dataTransfer?.files[0];if(file)void this.openFile(file);});
  }
  clear() {
    this.assertAlive();++this.loadRevision;++this.statsRevision;++this.revision;this.request?.abort();this.parser.cancel();this.analysis.cancel();this.comparison.cancel();this.ranking.cancel();
    this.loading=false;this.pendingLink=undefined;
    this.a=undefined;this.stats=undefined;this.fullStats=undefined;this.rows=[];this.filteredRows=[];this.selection=null;this.dropSearch();this.selectedRows.clear();this.annotationFilter={};this.hidden.clear();this.manualHidden=[];this.colMap=undefined;this.manualOrder=null;this.collapsed.clear();this.groupMap=null;this.groupList=[];this.tree=undefined;this.treeHits=[];this.rowPos=new Int32Array(0);if(this.sort==='tree'||this.sort==='manual'){this.sort='input';$<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value='input';}
    this.rebuildAnnotations();this.labels.replaceChildren();this.inspector.replaceChildren();
    for(const canvas of this.root.querySelectorAll('canvas')){canvas.width=0;canvas.height=0;}
    $(this.root,'.ak-reference-label').textContent='Reference';$(this.root,'.ak-overview-window').style.width='0';$(this.root,'.ak-status-main').textContent='No alignment loaded';$(this.root,'.ak-status-detail').textContent='';$(this.root,'.ak-empty').textContent='Open an alignment file or paste alignment text (FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF or PIR).';this.message('');this.layout();this.emit('selection',null);
  }
  destroy() {if(this.disposed)return;this.disposed=true;this.loadRevision++;this.statsRevision++;this.request?.abort();this.parser.cancel();this.analysis.cancel();this.comparison.cancel();this.ranking.cancel();this.controller.abort();this.menus.destroy();this.resize.disconnect();cancelAnimationFrame(this.frame);clearTimeout(this.linkTimer);this.listeners.clear();this.root.remove();}
}
export const createViewer=(element:HTMLElement,options:ViewerOptions={})=>new AlignmentViewer(element,options);
