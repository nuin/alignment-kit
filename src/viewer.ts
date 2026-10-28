import { defaultVisibility } from './visibility';
import { type Alphabet, type ViewerVisibility, type Alignment, type AlignmentStats, type ViewerOptions, type ViewerEvents, type ViewerEvent, type EventHandler, type ViewState, type Selection, type AnnotationFilter, type ParseOptions, type ExportRegion, type Annotation, type AnnotationImportOptions, type AnnotationImportResult, type Hit, type SearchOptions, type SearchResult, type CustomTrack } from './types';
import { AnnotationIndex, filterAnnotations } from './annotations';
import { ThemedSelects } from './selects';
import { Renderer, type RenderView, type GroupInfo, type TreeHit } from './renderer';
import { buildShell, $ } from './controls';
import { resolveRegion } from './export';
import { WorkerTask } from './worker-client';
import { encodeViewLink, decodeViewLink, isViewLink, type ViewLink } from './link';
import { computeColumnMask, buildColumnMap, reverseColumnMap, identityColumns, type ColumnMap, type ColumnRange, type MaskOptions } from './mask';
import { type TreeLayout } from './tree';
import * as modColumns from './viewer/columns';
import * as modTracks from './viewer/tracks';
import * as modLoad from './viewer/load';
import * as modOptions from './viewer/options';
import * as modStats from './viewer/stats';
import * as modRows from './viewer/rows';
import * as modGrouping from './viewer/grouping';
import * as modSelection from './viewer/selection';
import * as modNotes from './viewer/notes';
import * as modDraw from './viewer/draw';
import * as modLink from './viewer/link';
import * as modFind from './viewer/find';
import * as modOutput from './viewer/output';
import * as modStrand from './viewer/strand';
import * as modActions from './viewer/actions';
import * as modBind from './viewer/bind';
import type { Core, Carry, BoundTree, SearchState, ViewerSettings } from './viewer/core';

export class AlignmentViewer {
  readonly element:HTMLElement;
  private root:HTMLElement;private scroll:HTMLElement;private labels:HTMLElement;private inspector:HTMLElement;
  private options:ViewerSettings;
  private a?:Alignment; private stats?:AlignmentStats;private fullStats?:AlignmentStats;
  private reference=0;private filteredRows:number[]=[];private rows:number[]=[];private query='';private sort:ViewState['sort']='input';private identities?:number[];private identityDetails?:import('./types').Identity[];
  private selection:Selection|null=null;private selectedRows=new Set<string>();private annotationFilter:AnnotationFilter={};
  private filteredAnnotations:ReturnType<typeof filterAnnotations>={visible:[],unknown:0,excluded:0};private annotationIndex=new AnnotationIndex([]);
  private renderer=new Renderer();private controller=new AbortController();private resize:ResizeObserver;private menus:ThemedSelects;
  private parser:WorkerTask;private analysis:WorkerTask;private comparison:WorkerTask;private ranking:WorkerTask;private searcher:WorkerTask;private searchRun=0;private searchBusy=false;private request?:AbortController;
  private listeners=new Map<ViewerEvent,Set<(event:any)=>void>>();
  private frame=0;private disposed=false;private revision=0;private statsRevision=0;private loadRevision=0;
  private tab='position';private featurePage=0;private labelKey='';private overviewDirty=true;private inspectorDirty=true;
  private visibility:Required<ViewerVisibility>={...defaultVisibility};
  private get grouped(){return !!(this.groupMap||this.groupBy);}
  private get treeW(){return this.tree&&this.visibility.tree&&!this.grouped?this.options.treeWidth:0;}
  private get gutter(){return this.treeW+(this.visibility.labels?this.options.labelWidth:0);}
  private get matchDots(){return this.options.matchDisplay==='dot'&&(this.options.colorMode.startsWith('consensus')||this.pinned||this.filteredRows.includes(this.reference));}
  private get pinned(){return this.visibility.tracks&&this.visibility.reference;}
  private get core():Core{return this as unknown as Core;}
  getVisibility():Required<ViewerVisibility>{return {...this.visibility};}
  private manualHidden:ColumnRange[]=[];private colMap?:ColumnMap;private rowStrands=new Set<string>();
  private get reversed():boolean {return this.options.reverseComplement&&this.a?.alphabet!=='protein';}
  /** Display to original column map; rebuilt when the alignment, the mask options or the hidden ranges change. */
  private get columns():ColumnMap {
    const a=this.a;if(!a)return identityColumns(0);
    if(this.colMap)return this.colMap;
    const map=buildColumnMap(computeColumnMask(a,{gapFraction:this.options.hideGapColumns,allGap:this.options.hideAllGapColumns,hidden:this.manualHidden}));
    return this.colMap=this.reversed?reverseColumnMap(map):map;
  }
  private firstColumn():number {return modColumns.firstColumn(this.core);}
  private stepColumn(column:number,step:1|-1):number {return modColumns.stepColumn(this.core, column, step);}
  private maskChanged(anchor:number):void {modColumns.maskChanged(this.core, anchor);}
  private maskOptions(hidden:readonly ColumnRange[]):MaskOptions {return modColumns.maskOptions(this.core, hidden);}
  private setManualHidden(ranges:ColumnRange[]):void {modColumns.setManualHidden(this.core, ranges);}
  /** Hide columns `start` to `end` (one-based, inclusive) without changing the alignment. Selection, search hits, annotations, tracks and statistics keep original coordinates. Throws when the range is invalid or would leave no column visible. */
  hideColumns(start:number,end:number):void {modColumns.hideColumns(this.core, start, end);}
  /** Show hidden columns. With no arguments, clears the manual ranges and turns off hideGapColumns and hideAllGapColumns; with a range, removes only that range from the manual ranges (gap-based hiding stays). */
  showColumns(start?:number,end?:number):void {modColumns.showColumns(this.core, start, end);}
  /** 1 for a visible column, 0 for a hidden one; one entry per alignment column. Empty before an alignment is loaded. */
  getColumnMask():Uint8Array {this.assertAlive();return this.columns.mask.slice();}
  private columnHidden(column:number):boolean {return modColumns.columnHidden(this.core, column);}
  private ensureTab():void {modTracks.ensureTab(this.core);}
  private searchState?:{pattern:string;options:SearchOptions;result:SearchResult;byRow:Map<number,Hit[]>;cursor:number;full?:SearchResult};
  private customTracks:CustomTrack[]=[];private drawn?:{a:Alignment;row:number;flag:boolean;user:CustomTrack[];list:CustomTrack[]};private trackKey='';private trackErrors=new Set<string>();
  private selectionRow():number {return modTracks.selectionRow(this.core);}
  private drawnTracks():CustomTrack[] {return modTracks.drawnTracks(this.core);}
  private checkTracks():void {modTracks.checkTracks(this.core);}
  private tracksChanged():void {modTracks.tracksChanged(this.core);}
  /** Register a track drawn below the built-in tracks. Throws (and emits `error`) for an invalid definition, a duplicate id or, once an alignment is loaded, a `values` length other than the alignment width. */
  addTrack(track:CustomTrack):void {modTracks.addTrack(this.core, track);}
  removeTrack(id:string):void {modTracks.removeTrack(this.core, id);}
  /** Registered tracks in drawing order (copies). Tracks derived from Stockholm lines are not listed. */
  getTracks():CustomTrack[]{return this.customTracks.map(t=>({...t}));}
  private hidden=new Set<string>();private manualOrder:string[]|null=null;private collapsed=new Set<string>();private groupBy='';private groupMap:Map<string,string>|null=null;
  private groupList:GroupInfo[]=[];private rowPos=new Int32Array(0);private rowGroup=new Int32Array(0);private tree?:BoundTree;private treeHits:TreeHit[]=[];private dragId?:string;private focusRow?:string;
  private sourceUrl?:string;private nextSource?:string;private urlSync=false;private pendingLink?:ViewLink;private linkTimer?:ReturnType<typeof setTimeout>;private lastHash='';private loading=false;
  constructor(element:HTMLElement,options:ViewerOptions={}) {
    this.element=element;this.root=document.createElement('section');element.append(this.root);
    this.options={height:740,theme:'light',colorScheme:'soft',colorMode:'all',matchDisplay:'letter',cellWidth:16,rowHeight:36,labelWidth:230,showLogo:false,showInspector:true,showToolbar:true,statisticsScope:'all',consensusThreshold:0,rulerCoordinates:'alignment',logoMode:'frequency',conservationWindow:1,treeWidth:120,hideGapColumns:null,hideAllGapColumns:false,dragToPan:true,reverseComplement:false,...options,fasta:{}};
    this.parser=new WorkerTask(options.workerUrl,options.worker!==false);this.analysis=new WorkerTask(options.workerUrl,options.worker!==false);this.comparison=new WorkerTask(options.workerUrl,options.worker!==false);this.ranking=new WorkerTask(options.workerUrl,options.worker!==false);this.searcher=new WorkerTask(options.workerUrl,options.worker!==false);
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
  private detected?:{alphabet:Alphabet;other:number};private pendingAlphabet?:Alphabet;
  /** Alphabet suggested by the residues of the loaded alignment, whatever alphabet it is displayed as. Throws before an alignment is loaded. */
  getDetectedAlphabet():Alphabet {this.assertAlive();if(!this.detected)throw new Error('No alignment is loaded.');return this.detected.alphabet;}
  private requestAlphabet(next:Alphabet):void {modLoad.requestAlphabet(this.core, next);}
  private applyAlphabet(next:Alphabet):void {modLoad.applyAlphabet(this.core, next);}
  getStatistics():AlignmentStats|undefined{return this.stats;}
  getSelectedRowIds():string[]{return [...this.selectedRows];}
  load(input:string|Blob|ArrayBuffer,options:ParseOptions={}):Promise<void> {return this.loadInput(input,options);}
  private loadInput(input:string|Blob|ArrayBuffer,options:ParseOptions,source?:string):Promise<void> {return modLoad.loadInput(this.core, input, options, source);}
  loadUrl(url:string,options:ParseOptions={}):Promise<void> {return modLoad.loadUrl(this.core, url, options);}
  async setAlignment(alignment:Alignment):Promise<void> {return this.replace(alignment);}
  private replace(alignment:Alignment,carry?:Carry):Promise<void> {return modLoad.replace(this.core, alignment, carry);}
  setOptions(options:ViewerOptions):void {modOptions.setOptions(this.core, options);}
  private updateStats():Promise<void> {return modStats.updateStats(this.core);}
  private orderAll():number[] {return modRows.orderAll(this.core);}
  private groupName(row:number):string|null {return modRows.groupName(this.core, row);}
  private rebuildRows():void {modRows.rebuildRows(this.core);}
  private rowsChanged():void {modRows.rowsChanged(this.core);}
  setFilter(query:string):void {modRows.setFilter(this.core, query);}
  setSort(sort:ViewState['sort']):Promise<void> {return modRows.setSort(this.core, sort);}
  private rowIndexes(ids:string[]):number[] {return modRows.rowIndexes(this.core, ids);}
  /** Hide rows from the grid, the filtered statistics scope and exports of visible rows; the alignment is unchanged. */
  hideRows(ids:string[]):void {modRows.hideRows(this.core, ids);}
  /** Show the given hidden rows, or every hidden row when `ids` is omitted. */
  showRows(ids?:string[]):void {modRows.showRows(this.core, ids);}
  /** All row IDs in the current sort order, including hidden and filtered rows; moveRow indexes into this list. */
  getRowOrder():string[] {return modRows.getRowOrder(this.core);}
  /** Move a row to a zero-based position of getRowOrder() (clamped) and switch to manual order. */
  moveRow(id:string,index:number):void {modRows.moveRow(this.core, id, index);}
  /** Delete rows from a copy of the alignment, keep the view and recompute statistics. The alignment ID changes. */
  removeRows(ids:string[]):Promise<void> {return modRows.removeRows(this.core, ids);}
  /** Group rows by an explicit map of row ID to group name, or pass null to fall back to the groupBy option. Unlisted rows go to Ungrouped. */
  setGroups(groups:Record<string,string>|null):void {modRows.setGroups(this.core, groups);}
  /** Collapse or expand a group by name; omit `collapsed` to toggle. */
  toggleGroup(name:string,collapsed?:boolean):void {modRows.toggleGroup(this.core, name, collapsed);}
  /** Show a Newick tree left of the labels and order rows by it. Pass null to remove it. Leaves match rows by ID, then by name; mismatches are reported in a message. */
  setTree(newick:string|null):void {modGrouping.setTree(this.core, newick);}
  private clearTreeNote():void {modGrouping.clearTreeNote(this.core);}
  private readonly treeGroupNote='The tree column is hidden while rows are grouped. Clear the groups to show it.';private treeGroupShown=false;
  private noteTreeGroups():void {modGrouping.noteTreeGroups(this.core);}
  private bindTree(layout:TreeLayout):BoundTree {return modGrouping.bindTree(this.core, layout);}
  private selectClade(node:number,add=false):void {modGrouping.selectClade(this.core, node, add);}
  setReference(id:string):void {modSelection.setReference(this.core, id);}
  /** Show the whole alignment reverse-complemented: columns run right to left and every residue is complemented. The ruler counts original columns downwards. Selection, search hits, annotations, statistics, links and exports keep source coordinates and orientation. On a protein alignment it shows a message and changes nothing. */
  setReverseComplement(on:boolean):void {modStrand.setReverseComplement(this.core, on);}
  /** True while the reverse-complement view is active. Always false for protein. */
  getReverseComplement():boolean {this.assertAlive();return this.reversed;}
  /** Flag a row as reverse strand ('-') or forward ('+'). A reverse-strand row is drawn complemented in place, so columns stay aligned; in the reverse-complement view it is complemented twice and reads as the source. The alignment is not changed. Throws for an unknown row ID; on a protein alignment it shows a message and changes nothing. */
  setRowStrand(rowId:string,strand:'+'|'-'):void {modStrand.setRowStrand(this.core, rowId, strand);}
  /** Strand flag of a row: '-' when flagged as reverse strand, else '+'. */
  getRowStrand(rowId:string):'+'|'-' {this.assertAlive();return this.rowStrands.has(rowId)?'-':'+';}
  setSelection(selection:Selection|null,scrollIntoView=true,keepTab=false):void {modSelection.setSelection(this.core, selection, scrollIntoView, keepTab);}
  private goToText(column:number):string {return modSelection.goToText(this.core, column);}
  /** Select residue `position` (1-based, numbered as in the ruler, so offset by `metadata.start`) of the row with this ID. Returns false and shows a message when the row or residue does not exist. */
  goToResidue(rowId:string,position:number):boolean {return modSelection.goToResidue(this.core, rowId, position);}
  private goTo(input:string):boolean {return modSelection.goTo(this.core, input);}
  private reveal(s:Selection):void {modSelection.reveal(this.core, s);}
  setAnnotationFilter(filter:AnnotationFilter):void {modNotes.setAnnotationFilter(this.core, filter);}
  addAnnotations(list:Annotation[]):void {modNotes.addAnnotations(this.core, list);}
  removeAnnotations(ids?:string[]):void {modNotes.removeAnnotations(this.core, ids);}
  importAnnotations(text:string,options:AnnotationImportOptions={}):AnnotationImportResult {return modNotes.importAnnotations(this.core, text, options);}
  private openFile(file:File):Promise<void> {return modLoad.openFile(this.core, file);}
  private refreshAnnotations():void {modNotes.refreshAnnotations(this.core);}
  private rebuildAnnotations():void {modNotes.rebuildAnnotations(this.core);}
  getState():ViewState {return modStats.getState(this.core);}
  setState(state:ViewState):Promise<void> {return modStats.setState(this.core, state);}
  private view():RenderView {return modDraw.view(this.core);}
  private layout():void {modDraw.layout(this.core);}
  private schedule() {if(this.disposed)return;this.menus.sync();if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();});}
  private render():void {modDraw.render(this.core);}
  private message(message:string,isError=false) {
    if(this.pendingAlphabet){this.pendingAlphabet=undefined;if(this.a)$<HTMLSelectElement>(this.root,'[aria-label="Sequence alphabet"]').value=this.a.alphabet;this.menus.sync();}
    const target=$(this.root,'.ak-message');target.hidden=!message||!this.visibility.messages;target.textContent=message;target.dataset.error=String(isError);}
  private zoom(value:number):void {modOptions.zoom(this.core, value);}
  private itemAt(event:MouseEvent):number|undefined {return modSelection.itemAt(this.core, event);}
  private eventAt(event:MouseEvent):Selection|null {return modSelection.eventAt(this.core, event);}
  private stepRow(index:number,step:number):number|undefined {return modRows.stepRow(this.core, index, step);}
  private action(action:string):Promise<void> {return modActions.action(this.core, action);}
  /** Readable URL parameters for the current view, including `src` when the alignment came from loadUrl. */
  getViewLink():string {this.assertAlive();return encodeViewLink(this.getState(),this.sourceUrl);}
  /** Apply a link leniently: settings that do not fit this alignment are skipped and returned by name. Missing fields reset to defaults. */
  applyViewLink(input:ViewLink|string):Promise<string[]> {return modLink.applyViewLink(this.core, input);}
  private scheduleLink():void {modLink.scheduleLink(this.core);}
  /** Search every filtered row for an IUPAC, regex or PROSITE motif, highlight the hits and list them in the Hits tab. Rejects on an invalid pattern, with an AbortError when a later search, clear or load replaces it, and with a TimeoutError (also emitted as `error`) when the worker is stopped after 2 s. */
  search(pattern:string,options:Pick<SearchOptions,'mode'|'strands'>={}):Promise<SearchResult> {return modFind.search(this.core, pattern, options);}
  getSearchHits():Hit[] {return [...(this.searchState?.result.hits??[])];}
  clearSearch():void {modFind.clearSearch(this.core);}
  private dropSearch():void {modFind.dropSearch(this.core);}
  private runSearch(pattern:string,options:SearchOptions,refilter=false):Promise<SearchState> {return modFind.runSearch(this.core, pattern, options, refilter);}
  private goToHit(index:number):void {modFind.goToHit(this.core, index);}
  /** Search for `motif` if it is not the active search, then select the next (1) or previous (-1) hit, wrapping around. Resolves true when it started a new search. Errors go to the status line and the `error` event. */
  findMotif(motif:string,direction:1|-1=1):Promise<boolean> {return modFind.findMotif(this.core, motif, direction);}
  private exportRegion(a:Alignment):ExportRegion {return modOutput.exportRegion(this.core, a);}
  private fastaRegion(region:ExportRegion,visible=this.options.fasta.columns==='visible'):ExportRegion {return modOutput.fastaRegion(this.core, region, visible);}
  private copyRegion(a:Alignment):ExportRegion {return modOutput.copyRegion(this.core, a);}
  private copyPayload():{text:string;region:ReturnType<typeof resolveRegion>} {return modOutput.copyPayload(this.core);}
  /** Consensus over all columns from the current statistics scope; `threshold` defaults to the consensusThreshold option. */
  getConsensus(options:{threshold?:number}={}):string {return modOutput.getConsensus(this.core, options);}
  private consensusFasta(start:number,end:number,visible=false):string {return modOutput.consensusFasta(this.core, start, end, visible);}
  /** Gapped FASTA for the rows and columns that Ctrl/Cmd+C copies, led by the consensus once statistics are ready. */
  getSelectionText():string {return modOutput.getSelectionText(this.core);}
  copySelection():Promise<void> {return modOutput.copySelection(this.core);}
  private fastaPanel(open:boolean):void {modOutput.fastaPanel(this.core, open);}
  private export(kind:string):Promise<void> {return modOutput.exportKind(this.core, kind);}
  private bind():void {modBind.bind(this.core);}
  clear():void {modLoad.clear(this.core);}
  destroy() {if(this.disposed)return;this.disposed=true;this.loadRevision++;this.statsRevision++;this.request?.abort();this.parser.cancel();this.analysis.cancel();this.comparison.cancel();this.ranking.cancel();this.searcher.cancel();this.controller.abort();this.menus.destroy();this.resize.disconnect();cancelAnimationFrame(this.frame);clearTimeout(this.linkTimer);this.listeners.clear();this.root.remove();}
}
export const createViewer=(element:HTMLElement,options:ViewerOptions={})=>new AlignmentViewer(element,options);
