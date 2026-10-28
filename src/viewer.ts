import { defaultVisibility, applyVisibility, trackLayout, inspectorTabs } from './visibility';
import type { ViewerVisibility, RulerCoordinates, Alignment, AlignmentStats, ViewerOptions, ViewerEvents, ViewerEvent, EventHandler, ViewState, Selection, AnnotationFilter, ParseOptions, ExportRegion, ColorMode, Annotation, AnnotationImportOptions, AnnotationImportResult } from './types';
import { importAnnotations } from './annotation-import';
import { createAlignment, sequenceToAlignment, columnToResidue, residueToColumn } from './model';
import { readAlignmentInput } from './parsers';
import { AnnotationIndex, filterAnnotations } from './annotations';
import { getColorScheme, colorSchemes } from './colors';
import { ThemedSelects } from './selects';
import { Renderer, type RenderView } from './renderer';
import { buildShell, $, download } from './controls';
import { renderInspector } from './inspector';
import { exportFasta, formatFastaRecord, validateFastaOptions, exportStatistics, exportSvg, exportPng, resolveRegion, escapeXml as e } from './export';
import { WorkerTask } from './worker-client';
import { consensusSequence } from './analysis';
import { encodeViewLink, decodeViewLink, isViewLink, type ViewLink } from './link';

const bounded=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
export class AlignmentViewer {
  readonly element:HTMLElement;
  private root:HTMLElement;private scroll:HTMLElement;private labels:HTMLElement;private inspector:HTMLElement;
  private options:Required<Pick<ViewerOptions,'height'|'theme'|'colorScheme'|'colorMode'|'matchDisplay'|'cellWidth'|'rowHeight'|'labelWidth'|'showLogo'|'showInspector'|'showToolbar'|'statisticsScope'|'consensusThreshold'|'fasta'|'rulerCoordinates'>>;
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
  private get gutter(){return this.visibility.labels?this.options.labelWidth:0;}
  private get matchDots(){return this.options.matchDisplay==='dot'&&(this.options.colorMode.startsWith('consensus')||this.pinned||this.filteredRows.includes(this.reference));}
  private get pinned(){return this.visibility.tracks&&this.visibility.reference;}
  getVisibility():Required<ViewerVisibility>{return {...this.visibility};}
  private ensureTab(){if(!this.visibility[inspectorTabs[this.tab as keyof typeof inspectorTabs]])this.tab=Object.keys(inspectorTabs).find(key=>this.visibility[inspectorTabs[key as keyof typeof inspectorTabs]])??'';}
  private motifCursor={query:'',row:0,start:0};
  private sourceUrl?:string;private nextSource?:string;private urlSync=false;private pendingLink?:ViewLink;private linkTimer?:ReturnType<typeof setTimeout>;private lastHash='';private loading=false;
  constructor(element:HTMLElement,options:ViewerOptions={}) {
    this.element=element;this.root=document.createElement('section');element.append(this.root);
    this.options={height:740,theme:'light',colorScheme:'soft',colorMode:'all',matchDisplay:'letter',cellWidth:16,rowHeight:36,labelWidth:230,showLogo:false,showInspector:true,showToolbar:true,statisticsScope:'all',consensusThreshold:0,rulerCoordinates:'alignment',...options,fasta:{}};
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
  async setAlignment(alignment:Alignment):Promise<void> {
    this.assertAlive();++this.loadRevision;this.request?.abort();this.parser.cancel();this.analysis.cancel();this.comparison.cancel();this.ranking.cancel();const revision=++this.revision;
    if(!alignment.rows.length||alignment.width<1||alignment.codes.length!==alignment.width*alignment.rows.length)throw this.error(new Error('Invalid alignment model. Use createAlignment or parseAlignment.'));
    this.sourceUrl=this.nextSource;this.nextSource=undefined;this.loading=true;
    this.a=alignment;this.stats=undefined;this.fullStats=undefined;this.reference=0;this.selection=null;this.selectedRows.clear();this.query='';this.sort='input';this.identities=undefined;this.identityDetails=undefined;this.annotationFilter={};this.featurePage=0;
    this.menus.close();const schemes=colorSchemes(alignment.alphabet);
    if(!schemes.some(s=>s.id===this.options.colorScheme))this.options.colorScheme=alignment.alphabet==='protein'?'soft':'soft-nucleotide';
    const palette=$<HTMLSelectElement>(this.root,'select[aria-label="Color scheme"]');palette.replaceChildren(...schemes.map(s=>new Option(s.label,s.id)));palette.value=this.options.colorScheme;
    this.motifCursor={query:'',row:0,start:0};this.scroll.scrollLeft=0;this.scroll.scrollTop=0;
    $<HTMLInputElement>(this.root,'[aria-label="Filter sequences"]').value='';
    $<HTMLSelectElement>(this.root,'[aria-label="Sequence alphabet"]').value=alignment.alphabet;
    $<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value='input';
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
    const oldScope=this.options.statisticsScope;
    const wasPinned=this.pinned;
    const {alignment:_,worker:__,workerUrl:___,visibility,fasta,...visual}=options;
    const mergedFasta=fasta?validateFastaOptions({...this.options.fasta,...fasta}):this.options.fasta;
    if(options.showToolbar!==undefined){this.visibility.toolbar=options.showToolbar;this.visibility.tools=options.showToolbar;}
    if(options.showInspector!==undefined)this.visibility.inspector=options.showInspector;
    if(options.showLogo!==undefined)this.visibility.logo=options.showLogo;
    for(const key of Object.keys(visibility??{}) as (keyof ViewerVisibility)[])if(typeof visibility![key]==='boolean')this.visibility[key]=visibility![key]!;
    this.menus.close();this.ensureTab();
    Object.assign(this.options,visual);this.options.fasta=mergedFasta;
    this.options.showInspector=this.visibility.inspector;this.options.showLogo=this.visibility.logo;
    if(this.a&&!colorSchemes(this.a.alphabet).some(s=>s.id===this.options.colorScheme))this.options.colorScheme=this.a.alphabet==='protein'?'soft':'soft-nucleotide';
    this.options.cellWidth=bounded(this.options.cellWidth,3,32);this.options.rowHeight=bounded(this.options.rowHeight,18,48);this.options.labelWidth=bounded(this.options.labelWidth,100,420);this.options.height=bounded(this.options.height,360,2000);this.options.consensusThreshold=bounded(this.options.consensusThreshold,0,1);
    this.root.style.height=this.options.height+'px';this.root.dataset.theme=this.options.theme;this.root.dataset.inspector=String(this.options.showInspector);
    if(wasPinned!==this.pinned)this.rebuildRows();
    $<HTMLSelectElement>(this.root,'[aria-label="Color scheme"]').value=this.options.colorScheme;
    $<HTMLSelectElement>(this.root,'[aria-label="Residues to color"]').value=this.options.colorMode;
    $<HTMLSelectElement>(this.root,'[aria-label="Statistics scope"]').value=this.options.statisticsScope;
    $<HTMLSelectElement>(this.root,'[aria-label="Ruler coordinates"]').value=this.options.rulerCoordinates;
    $<HTMLInputElement>(this.root,'[aria-label="Show frequency logo"]').checked=this.options.showLogo;
    $<HTMLInputElement>(this.root,'[aria-label="Dots for matches"]').checked=this.options.matchDisplay==='dot';
    const f=this.options.fasta,width=$<HTMLSelectElement>(this.root,'[aria-label="FASTA line width"]'),lineWidth=String(f.lineWidth??80);
    if(![...width.options].some(o=>o.value===lineWidth))width.add(new Option(lineWidth,lineWidth));
    width.value=lineWidth;$<HTMLSelectElement>(this.root,'[aria-label="FASTA gaps"]').value=f.gaps??'keep';
    $<HTMLSelectElement>(this.root,'[aria-label="FASTA letter case"]').value=f.letterCase??'original';$<HTMLSelectElement>(this.root,'[aria-label="FASTA header"]').value=f.header??'name';
    this.labelKey='';this.overviewDirty=true;this.inspectorDirty=true;this.layout();
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
  private rebuildRows() {
    if(!this.a)return;const q=this.query.trim().toLocaleLowerCase();
    this.filteredRows=this.a.rows.map((_,i)=>i).filter(i=>!q||`${this.a!.rows[i].name} ${this.a!.rows[i].species??''}`.toLocaleLowerCase().includes(q));
    if(this.sort==='name')this.filteredRows.sort((x,y)=>this.a!.rows[x].name.localeCompare(this.a!.rows[y].name)||x-y);
    if(this.sort==='identity'&&this.identities)this.filteredRows.sort((x,y)=>this.identities![y]-this.identities![x]||x-y);
    this.rows=this.filteredRows.filter(i=>!this.pinned||i!==this.reference);this.labelKey='';this.layout();
  }
  setFilter(query:string) {this.assertAlive();this.query=query;this.scroll.scrollTop=0;this.rebuildRows();$<HTMLInputElement>(this.root,'[aria-label="Filter sequences"]').value=query;if(this.options.statisticsScope==='filtered')void this.updateStats().catch(()=>{});this.emit('state',this.getState());}
  async setSort(sort:ViewState['sort']) {
    this.assertAlive();if(!['input','name','identity'].includes(sort))throw new Error('Unknown sequence order.');
    this.sort=sort;$<HTMLSelectElement>(this.root,'[aria-label="Sequence order"]').value=sort;
    if(sort==='identity'&&this.a) {
      const a=this.a,ref=this.reference;this.message('Comparing sequences with the reference…');
      try{const results=await this.ranking.identities(a,ref,a.rows.map((_,i)=>i));if(this.disposed)return;if(this.a!==a||this.reference!==ref||this.sort!==sort){this.message('');return;}this.identityDetails=results;this.inspectorDirty=true;this.identities=results.map(r=>r.identity??-1);this.message('');}catch(error){this.error(error);return;}
    }
    this.rebuildRows();this.emit('state',this.getState());
  }
  setReference(id:string) {
    this.assertAlive();if(!this.a)return;const row=this.a.rows.findIndex(r=>r.id===id);if(row<0)throw new Error('Unknown reference sequence.');
    this.reference=row;this.identities=undefined;this.identityDetails=undefined;this.rebuildRows();this.inspectorDirty=true;this.schedule();if(this.sort==='identity')void this.setSort('identity');this.emit('state',this.getState());
  }
  setSelection(selection:Selection|null,scrollIntoView=true) {
    this.assertAlive();if(!this.a)return;
    if(selection&&(!Number.isInteger(selection.start)||!Number.isInteger(selection.end)||selection.start<1||selection.end<selection.start||selection.end>this.a.width||(selection.rowId&&!this.a.rows.some(r=>r.id===selection.rowId))))throw new Error('Invalid selection coordinates or row ID.');
    this.selection=selection?{...selection}:null;this.tab='position';this.ensureTab();this.inspectorDirty=true;
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
    this.setSelection({start:column,end:column,rowId});return true;
  }
  private goTo(input:string):boolean {
    const a=this.a;if(!a)return false;const text=input.trim(),plain=/^\d+$/.test(text),split=text.lastIndexOf(':');
    if(plain){
      const n=Number(text);
      if(this.options.rulerCoordinates==='reference'){
        const column=residueToColumn(a,this.reference,n);
        if(column===null){this.message(`${a.rows[this.reference].name} has no residue ${n}.`);return false;}
        this.setSelection({start:column,end:column});return true;
      }
      if(n>=1&&n<=a.width){this.setSelection({start:n,end:n});return true;}
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
    const available=this.scroll.clientWidth-this.gutter,x=(s.start-1)*this.options.cellWidth;
    if(x<this.scroll.scrollLeft||x+this.options.cellWidth>this.scroll.scrollLeft+available)this.scroll.scrollLeft=Math.max(0,x-available/2);
    if(s.rowId&&this.a){const index=this.rows.findIndex(i=>this.a!.rows[i].id===s.rowId),y=index*this.options.rowHeight;if(index>=0&&(y<this.scroll.scrollTop||y+this.options.rowHeight>this.scroll.scrollTop+this.scroll.clientHeight))this.scroll.scrollTop=y;}
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
  getState():ViewState {return {version:1,alignmentId:this.a?.id??'',referenceId:this.a?.rows[this.reference]?.id??null,query:this.query,sort:this.sort,start:Math.floor(this.scroll.scrollLeft/this.options.cellWidth)+1,rowOffset:Math.floor(this.scroll.scrollTop/this.options.rowHeight),cellWidth:this.options.cellWidth,selection:this.selection?{...this.selection}:null,colorScheme:this.options.colorScheme,colorMode:this.options.colorMode,matchDisplay:this.options.matchDisplay,statisticsScope:this.options.statisticsScope,rulerCoordinates:this.options.rulerCoordinates,annotationFilter:structuredClone(this.annotationFilter),visibility:this.getVisibility()};}
  async setState(state:ViewState) {
    if(!this.a||state.version!==1||state.alignmentId!==this.a.id)throw new Error('View state belongs to a different alignment or unsupported version.');
    if(!Number.isFinite(state.start)||!Number.isFinite(state.rowOffset))throw new Error('Invalid view state.');
    this.setOptions({cellWidth:state.cellWidth,colorScheme:state.colorScheme,colorMode:state.colorMode,matchDisplay:state.matchDisplay??'letter',statisticsScope:state.statisticsScope,rulerCoordinates:state.rulerCoordinates??'alignment',visibility:state.visibility});this.setFilter(state.query);if(state.referenceId)this.setReference(state.referenceId);await this.setSort(state.sort);this.setAnnotationFilter(state.annotationFilter);this.setSelection(state.selection,false);
    this.scroll.scrollLeft=(state.start-1)*this.options.cellWidth;this.scroll.scrollTop=state.rowOffset*this.options.rowHeight;this.schedule();
  }
  private view():RenderView {return {a:this.a!,stats:this.stats,rows:this.rows,reference:this.reference,x:this.scroll.scrollLeft,y:this.scroll.scrollTop,cw:this.options.cellWidth,rh:this.options.rowHeight,gutter:this.gutter,scheme:this.options.colorScheme,mode:this.options.colorMode,matchDots:this.matchDots,dark:this.options.theme==='dark',selection:this.selection,annotations:this.annotationIndex,logo:this.options.showLogo,visibility:this.visibility,threshold:this.options.consensusThreshold,ruler:this.options.rulerCoordinates};}
  private layout() {
    if(this.disposed)return;const rh=this.options.rowHeight,gutter=this.gutter;
    const tracks=trackLayout(this.visibility,rh);
    this.menus.sync();applyVisibility(this.root,this.visibility);
    this.root.style.setProperty('--ak-gutter',gutter+'px');this.root.style.setProperty('--ak-row-height',rh+'px');
    this.root.dataset.compactRows=String(rh<32);
    $(this.root,'.ak-tracks').style.height=tracks.height+'px';$(this.root,'.ak-tracks').hidden=tracks.height===0;
    const names=['ruler','modalFrequency','gapFraction','consensus','logo','reference'] as const;
    $(this.root,'.ak-track-labels').children[0].textContent=this.options.rulerCoordinates==='reference'?'Reference residue':'Alignment position';
    [...$(this.root,'.ak-track-labels').children].forEach((label,i)=>{const node=label as HTMLElement,offset=tracks.offsets[names[i]];node.hidden=offset===null;node.style.top=((offset??0)+(names[i]==='reference'?0:3))+'px';});
    const message=$(this.root,'.ak-message');message.hidden=!this.visibility.messages||!message.textContent;
    const spacer=$(this.root,'.ak-spacer');spacer.style.width=(gutter+(this.a?.width??0)*this.options.cellWidth)+'px';spacer.style.height=Math.max(1,this.rows.length*rh)+'px';
    $(this.root,'.ak-empty').hidden=!this.visibility.emptyState||(!!this.a&&this.rows.length>0);
    if(this.a&&!this.rows.length)$(this.root,'.ak-empty').textContent=this.pinned?(this.filteredRows.length?'The reference is pinned above.':'No sequences match this filter. The reference remains pinned.'):'No sequences match this filter.';
    $(this.root,'[aria-label="Zoom level"]').textContent=this.options.cellWidth+' px';
    this.schedule();
  }
  private schedule() {if(this.disposed)return;this.menus.sync();if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();});}
  private render() {
    if(!this.a||this.disposed)return;const width=$(this.root,'.ak-main').clientWidth,height=this.scroll.clientHeight;if(width<1)return;
    const v=this.view();this.renderer.body($(this.root,'.ak-body-canvas'),v,width,height);this.renderer.tracks($(this.root,'.ak-tracks canvas'),v,width);
    const overview=$(this.root,'.ak-overview');if(this.overviewDirty&&this.visibility.overview){this.renderer.overview($(overview,'canvas'),v,overview.clientWidth);this.overviewDirty=false;}
    const win=$(overview,'.ak-overview-window');const visible=Math.max(1,(width-v.gutter)/v.cw),left=v.x/v.cw/this.a.width;
    win.style.left=Math.min(1,left)*100+'%';win.style.width=Math.min(1,visible/this.a.width)*100+'%';overview.setAttribute('aria-valuemax',String(this.a.width));overview.setAttribute('aria-valuenow',String(Math.floor(v.x/v.cw)+1));
    const ref=$(this.root,'.ak-reference-label');ref.textContent=this.a.rows[this.reference]?.name??'Reference';ref.title='Pinned reference: '+ref.textContent;
    const first=Math.max(0,Math.floor(v.y/v.rh)),last=Math.min(this.rows.length,Math.ceil((v.y+height)/v.rh));
    const key=[first,last,this.rows.slice(first,last).join(','),[...this.selectedRows].join(',')].join(':');
    if(this.labelKey!==key){this.labelKey=key;const fragment=document.createDocumentFragment();
      for(let i=first;i<last;i++){const row=this.a.rows[this.rows[i]],label=document.createElement('div');label.className='ak-row-label';label.dataset.index=String(i);
        const check=document.createElement('input');check.type='checkbox';check.checked=this.selectedRows.has(row.id);check.setAttribute('aria-label',`Select ${row.name}`);check.dataset.selectRow=row.id;
        const button=document.createElement('button');button.type='button';button.dataset.row=row.id;button.title=row.name+(row.species?' · '+row.species:'');const name=document.createElement('span');name.className='ak-row-name';name.textContent=row.name;button.append(name);if(row.species){const species=document.createElement('small');species.className='ak-row-species';species.textContent=row.species;button.append(species);}
        const pin=document.createElement('button');pin.type='button';pin.dataset.pin=row.id;pin.className='ak-pin';pin.textContent='◇';pin.setAttribute('aria-label',`Pin ${row.name} as reference`);
        label.append(check,button,pin);fragment.append(label);
      }this.labels.replaceChildren(fragment);
    }
    for(const label of this.labels.children as HTMLCollectionOf<HTMLElement>)label.style.transform=`translateY(${Number(label.dataset.index)*v.rh-v.y}px)`;
    if(this.inspectorDirty){this.inspectorDirty=false;if(this.tab)renderInspector(this.inspector,{a:this.a,stats:this.stats,selection:this.selection,scheme:this.options.colorScheme,reference:this.reference,selectedRows:this.selectedRows,annotations:this.filteredAnnotations.visible,annotationFilter:this.annotationFilter,unknown:this.filteredAnnotations.unknown,excluded:this.filteredAnnotations.excluded,tab:this.tab,page:this.featurePage,scope:this.options.statisticsScope,identity:this.selection?.rowId?this.identityDetails?.[this.a.rows.findIndex(r=>r.id===this.selection!.rowId)]:undefined});for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]'))button.setAttribute('aria-pressed',String(button.dataset.tab===this.tab));this.menus.sync();}
    if(!this.tab)this.inspector.replaceChildren();
    applyVisibility(this.root,this.visibility);
    const start=Math.floor(v.x/v.cw)+1,end=Math.min(this.a.width,Math.ceil((v.x+width-v.gutter)/v.cw));
    $(this.root,'.ak-status-main').textContent=`${this.a.rows.length.toLocaleString()} sequences${this.query?` · ${this.filteredRows.length.toLocaleString()} filtered`:''} · ${this.a.width.toLocaleString()} columns`;
    $(this.root,'.ak-status-detail').textContent=`${start}–${end} · ${this.stats?`${this.options.statisticsScope} rows`:'statistics pending'} · ${this.a.alphabet.toUpperCase()}`;
    this.scroll.setAttribute('aria-rowcount',String(this.a.rows.length));this.scroll.setAttribute('aria-colcount',String(this.a.width));
    this.emit('viewport',{start,end,firstRow:first,lastRow:last,visibleRows:last-first,totalRows:this.a.rows.length});
  }
  private message(message:string,isError=false) {const target=$(this.root,'.ak-message');target.hidden=!message||!this.visibility.messages;target.textContent=message;target.dataset.error=String(isError);}
  private zoom(value:number) {const available=this.scroll.clientWidth-this.gutter,center=(this.scroll.scrollLeft+available/2)/this.options.cellWidth;this.setOptions({cellWidth:value});this.scroll.scrollLeft=Math.max(0,center*this.options.cellWidth-available/2);this.schedule();}
  private eventAt(event:MouseEvent):Selection|null {
    if(!this.a)return null;const rect=this.scroll.getBoundingClientRect(),x=event.clientX-rect.left-this.gutter,y=event.clientY-rect.top;
    if(x<0)return null;const column=Math.floor((x+this.scroll.scrollLeft)/this.options.cellWidth)+1,row=this.rows[Math.floor((y+this.scroll.scrollTop)/this.options.rowHeight)];
    if(column<1||column>this.a.width||row===undefined)return null;return {start:column,end:column,rowId:this.a.rows[row].id};
  }
  private async action(action:string) {
    try {
      if(action==='close-fasta-options'){this.fastaPanel(false);return;}
      if(action==='open'){$<HTMLInputElement>(this.root,'.ak-file').click();return;}
      if(action==='zoom-in')this.zoom(this.options.cellWidth+2);
      if(action==='zoom-out')this.zoom(this.options.cellWidth-2);
      if(action==='fit'&&this.a)this.zoom(Math.max(3,Math.floor((this.scroll.clientWidth-this.gutter)/this.a.width)));
      if(action==='theme')this.setOptions({theme:this.options.theme==='light'?'dark':'light'});
      if(action==='inspect')this.setOptions({showInspector:!this.options.showInspector});
      if(action==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else if(this.root.requestFullscreen)await this.root.requestFullscreen();else this.message('Full screen is unavailable in this browser.');}
      if(action==='reference-info'&&this.a)this.setSelection({start:this.selection?.start??1,end:this.selection?.end??1,rowId:this.a.rows[this.reference].id},false);
      if(action==='pin-selected'&&this.selection?.rowId)this.setReference(this.selection.rowId);
      if(action==='toggle-row-features'&&this.selection?.rowId){const ids=new Set(this.annotationFilter.hiddenRowIds??[]),id=this.selection.rowId;if(ids.has(id))ids.delete(id);else ids.add(id);this.setAnnotationFilter({...this.annotationFilter,hiddenRowIds:[...ids]});}
      if(action==='features-prev'){this.featurePage=Math.max(0,this.featurePage-1);this.inspectorDirty=true;this.schedule();}
      if(action==='features-next'){this.featurePage++;this.inspectorDirty=true;this.schedule();}
      if(action==='clear-rows'){this.selectedRows.clear();this.labelKey='';this.inspectorDirty=true;this.schedule();}
      if(action==='compare'&&this.a){const ids=new Map(this.a.rows.map((r,i)=>[r.id,i])),rows=[...this.selectedRows].map(id=>ids.get(id)!);const a=this.a,revision=this.revision,selectionKey=[...this.selectedRows].join(',');this.message('Calculating pairwise identity…');const matrix=await this.comparison.pairwise(a,rows);if(this.disposed||this.revision!==revision)return;this.message('');if(this.tab!=='compare'||selectionKey!==[...this.selectedRows].join(','))return;const target=$(this.inspector,'.ak-identity-result');target.innerHTML=`<div class="ak-matrix-scroll"><table><caption>Identity over canonical comparable positions</caption><thead><tr><th>Sequence</th>${rows.map(i=>`<th>${e(this.a!.rows[i].name)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr><th>${e(this.a!.rows[row].name)}</th>${matrix[i].map(cell=>`<td title="${cell.matches} matches / ${cell.compared} compared">${cell.identity===null?'NA':(cell.identity*100).toFixed(1)+'%'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
      if(action==='motif')this.findMotif($<HTMLInputElement>(this.root,'[aria-label="Find literal motif"]').value);
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
    if(link.referenceId){if(a.rows.some(r=>r.id===link.referenceId))this.setReference(link.referenceId);else skipped.push('ref');}
    await this.setSort(link.sort??'input');
    if(this.disposed||this.a!==a)return skipped;
    const s=link.selection;
    if(s&&(s.end>a.width||(s.rowId&&!a.rows.some(r=>r.id===s.rowId)))){skipped.push('sel');this.setSelection(null,false);}
    else this.setSelection(s??null,link.start===undefined);
    if((link.start??1)<=a.width)this.scroll.scrollLeft=((link.start??1)-1)*this.options.cellWidth;else skipped.push('x');
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
  findMotif(motif:string) {
    if(!this.a)return;const query=motif.trim().toUpperCase();if(!/^[A-Z*]+$/.test(query)) {this.message('Enter a literal, ungapped residue motif (letters or *).');return;}
    if(this.motifCursor.query!==query)this.motifCursor={query,row:0,start:0};
    const rows=this.filteredRows;
    for(let pass=0;pass<=rows.length;pass++) {
      const index=(this.motifCursor.row+pass)%Math.max(1,rows.length),row=rows[index];if(row===undefined)break;
      const seq=this.a.rows[row].sequence.toUpperCase().replace(/[-.]/g,''),from=pass===0?this.motifCursor.start:0,found=seq.indexOf(query,from);
      if(found>=0){const start=sequenceToAlignment(this.a,row,found+1)!,end=sequenceToAlignment(this.a,row,found+query.length)!;this.motifCursor={query,row:index,start:found+1};this.setSelection({start,end,rowId:this.a.rows[row].id});this.message(`Found ${query} in ${this.a.rows[row].name}, sequence positions ${found+1}–${found+query.length}.`);return;}
    }
    this.motifCursor={query,row:0,start:0};this.message(`No match for ${query} in the filtered sequences.`);
  }
  private exportRegion(a:Alignment):ExportRegion {
    const start=this.selection?.start??Math.min(a.width,Math.floor(this.scroll.scrollLeft/this.options.cellWidth)+1);
    return {start,end:this.selection?.end??Math.max(start,Math.min(a.width,Math.ceil((this.scroll.scrollLeft+this.scroll.clientWidth-this.gutter)/this.options.cellWidth))),rowIds:this.selectedRows.size?[...this.selectedRows]:[...(this.pinned?[a.rows[this.reference].id]:[]),...this.rows.slice(Math.floor(this.scroll.scrollTop/this.options.rowHeight),Math.ceil((this.scroll.scrollTop+this.scroll.clientHeight)/this.options.rowHeight)).map(i=>a.rows[i].id)]};
  }
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
    const region=this.copyRegion(this.a);if(!region.rowIds?.length)throw new Error('No sequences to copy.');
    const resolved=resolveRegion(this.a,region);
    return {text:(this.stats?this.consensusFasta(resolved.start,resolved.end):'')+exportFasta(this.a,region,this.options.fasta),region:resolved};
  }
  /** Consensus over all columns from the current statistics scope; `threshold` defaults to the consensusThreshold option. */
  getConsensus(options:{threshold?:number}={}):string {
    this.assertAlive();if(!this.a)throw new Error('No alignment is loaded.');if(!this.stats)throw new Error('Column statistics are still being calculated.');
    return consensusSequence(this.stats,this.a.alphabet,options.threshold??this.options.consensusThreshold);
  }
  private consensusFasta(start:number,end:number) {
    const s=this.stats!,t=this.options.consensusThreshold,sequence=consensusSequence(s,this.a!.alphabet,t,start,end);
    return formatFastaRecord(`consensus columns ${start}-${end}; ${this.options.statisticsScope} rows (${s.total}); threshold ${t}`,sequence,this.options.fasta);
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
      if(kind==='fasta-all')download(exportFasta(this.a,{},this.options.fasta),'alignment.fasta');
      if(kind==='fasta')download(exportFasta(this.a,region,this.options.fasta),'selection.fasta');
      if(kind==='state')download(JSON.stringify(this.getState(),null,2),'alignment-view.json','application/json');
      if(['svg','png','tsv','consensus'].includes(kind)&&!this.stats)throw new Error('Wait for column statistics to finish before exporting.');
      if(kind==='consensus')download(this.consensusFasta(region.start!,region.end!),'consensus.fasta');
      if(kind==='tsv')download(exportStatistics(this.stats!),'column-statistics.tsv','text/tab-separated-values');
      if(kind==='svg')download(exportSvg({...this.a,annotations:this.filteredAnnotations.visible},this.stats!,region,this.options.colorScheme,{colorMode:this.options.colorMode,matchDisplay:this.options.matchDisplay,referenceId:this.a.rows[this.reference].id}),'alignment.svg','image/svg+xml');
      if(kind==='png')download(await exportPng({...this.a,annotations:this.filteredAnnotations.visible},this.stats!,region,this.options.colorScheme,{colorMode:this.options.colorMode,matchDisplay:this.options.matchDisplay,referenceId:this.a.rows[this.reference].id}),'alignment.png');
    }catch(error){this.error(error);}
  }
  private bind() {
    const signal=this.controller.signal,on=(target:EventTarget,event:string,handler:(event:any)=>void)=>target.addEventListener(event,handler,{signal});
    on(this.scroll,'scroll',()=>this.schedule());
    on(this.root,'click',(event:MouseEvent)=>{
      const target=event.target as HTMLElement,button=target.closest<HTMLElement>('[data-action],[data-tab],[data-row],[data-pin],[data-feature]');if(!button)return;
      if(button.dataset.action)void this.action(button.dataset.action);
      if(button.dataset.tab){this.tab=button.dataset.tab;this.inspectorDirty=true;this.schedule();}
      if(button.dataset.pin)this.setReference(button.dataset.pin);
      if(button.dataset.row)this.setSelection({start:this.selection?.start??1,end:this.selection?.end??1,rowId:button.dataset.row},false);
      if(button.dataset.feature){const feature=this.filteredAnnotations.visible[Number(button.dataset.feature)];if(feature){if(feature.mapping==='mapped')this.setSelection({start:feature.start!,end:feature.end!,rowId:feature.rowId});this.emit('annotation',feature);this.message(`${feature.label}: ${feature.mapping==='mapped'?`alignment columns ${feature.start}–${feature.end}`:'no protein mapping'}. ${JSON.stringify(feature.metadata??{})}`);}}
    });
    on(this.scroll,'click',(event:MouseEvent)=>{const s=this.eventAt(event);if(s){if(event.shiftKey&&this.selection){s.start=Math.min(this.selection.start,s.start);s.end=Math.max(this.selection.end,s.end);}this.setSelection(s,false);}});
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
      if(aria==='Sequence order')void this.setSort(target.value as ViewState['sort']);
      if(aria==='Export alignment'){if(target.value==='fasta-options')this.fastaPanel(true);else void this.export(target.value);target.value='';}
      if(aria==='FASTA gaps')this.setOptions({fasta:{gaps:target.value as 'keep'|'remove'}});
      if(aria==='FASTA letter case')this.setOptions({fasta:{letterCase:target.value as 'original'|'upper'|'lower'}});
      if(aria==='FASTA line width')this.setOptions({fasta:{lineWidth:Number(target.value)}});
      if(aria==='FASTA header')this.setOptions({fasta:{header:target.value as 'name'|'name-species'|'id-name'}});
      if(aria==='Sequence alphabet'&&this.a){const old=this.a;void this.setAlignment(createAlignment(old.rows,{name:old.name,alphabet:target.value as Alignment['alphabet'],annotations:old.annotations,metadata:old.metadata})).catch(()=>{});}
      if(aria==='Feature type')this.setAnnotationFilter({...this.annotationFilter,types:target.value?[target.value]:[]});
      if(aria==='Feature consequence')this.setAnnotationFilter({...this.annotationFilter,consequences:target.value?[target.value]:[]});
      if(aria==='Features with disease evidence')this.setAnnotationFilter({...this.annotationFilter,disease:target.checked});
      if(aria==='Features with phenotype evidence')this.setAnnotationFilter({...this.annotationFilter,phenotype:target.checked});
    });
    on($(this.root,'[aria-label="Filter sequences"]'),'input',(event:Event)=>this.setFilter((event.target as HTMLInputElement).value));
    on($(this.root,'[aria-label="Go to alignment column"]'),'keydown',(event:KeyboardEvent)=>{if(event.key==='Enter'&&this.a){const input=event.target as HTMLInputElement,typed=input.value;if(this.goTo(typed))input.value=typed.trim();}});
    on($(this.root,'[aria-label="Find literal motif"]'),'keydown',(event:KeyboardEvent)=>{if(event.key==='Enter')void this.action('motif');});
    on(this.scroll,'keydown',(event:KeyboardEvent)=>{
      if(!this.a)return;const key=event.key,start=this.selection?.start??Math.floor(this.scroll.scrollLeft/this.options.cellWidth)+1;
      if(['+','=','-','_'].includes(key)){event.preventDefault();this.zoom(this.options.cellWidth+(key==='+'||key==='='?2:-2));return;}
      if(key==='Escape'){this.setSelection(null);return;}
      if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&(key.toLowerCase()==='c'||event.code==='KeyC')&&!this.root.ownerDocument.getSelection()?.toString()){event.preventDefault();void this.copySelection().catch(()=>{});return;}
      if(['ArrowLeft','ArrowRight','Home','End','ArrowUp','ArrowDown'].includes(key)){
        event.preventDefault();let column=start,rowId=this.selection?.rowId;
        if(key==='ArrowLeft')column=Math.max(1,start-1);if(key==='ArrowRight')column=Math.min(this.a.width,(event.shiftKey?this.selection?.end??start:start)+1);if(key==='Home')column=1;if(key==='End')column=this.a.width;
        if(key==='ArrowDown'||key==='ArrowUp'){const index=rowId?this.rows.findIndex(i=>this.a!.rows[i].id===rowId):Math.floor(this.scroll.scrollTop/this.options.rowHeight);const row=this.rows[bounded(index+(key==='ArrowDown'?1:-1),0,this.rows.length-1)];if(row!==undefined)rowId=this.a.rows[row].id;}
        this.setSelection({start:event.shiftKey?Math.min(start,column):column,end:event.shiftKey?Math.max(this.selection?.end??start,column):column,rowId});
      }
    });
    const overview=$(this.root,'.ak-overview');let dragging=false;
    const navigate=(event:PointerEvent)=>{if(!this.a)return;const rect=overview.getBoundingClientRect(),ratio=bounded((event.clientX-rect.left)/rect.width,0,1);this.scroll.scrollLeft=ratio*this.a.width*this.options.cellWidth-(this.scroll.clientWidth-this.gutter)/2;this.schedule();};
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
    this.a=undefined;this.stats=undefined;this.fullStats=undefined;this.rows=[];this.filteredRows=[];this.selection=null;this.selectedRows.clear();this.annotationFilter={};this.rebuildAnnotations();this.labels.replaceChildren();this.inspector.replaceChildren();
    for(const canvas of this.root.querySelectorAll('canvas')){canvas.width=0;canvas.height=0;}
    $(this.root,'.ak-reference-label').textContent='Reference';$(this.root,'.ak-overview-window').style.width='0';$(this.root,'.ak-status-main').textContent='No alignment loaded';$(this.root,'.ak-status-detail').textContent='';$(this.root,'.ak-empty').textContent='Open an aligned FASTA, Stockholm or CLUSTAL file.';this.message('');this.layout();this.emit('selection',null);
  }
  destroy() {if(this.disposed)return;this.disposed=true;this.loadRevision++;this.statsRevision++;this.request?.abort();this.parser.cancel();this.analysis.cancel();this.comparison.cancel();this.ranking.cancel();this.controller.abort();this.menus.destroy();this.resize.disconnect();cancelAnimationFrame(this.frame);clearTimeout(this.linkTimer);this.listeners.clear();this.root.remove();}
}
export const createViewer=(element:HTMLElement,options:ViewerOptions={})=>new AlignmentViewer(element,options);
