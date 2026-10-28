/** Public coordinates are one-based and inclusive. */
export type Alphabet = 'protein' | 'dna' | 'rna';
export interface SequenceInput { id?: string; name: string; sequence: string; species?: string; metadata?: Record<string, unknown> }
export interface Sequence extends SequenceInput { id: string }
export interface Annotation {
  id: string; rowId?: string; label: string; start?: number; end?: number;
  kind?: string; consequence?: string[]; disease?: boolean; phenotype?: boolean;
  color?: string; mapping: 'mapped' | 'unmapped'; metadata?: Record<string, unknown>;
}
export interface Provenance { url?: string; retrieved?: string; sha256?: string; description?: string }
export interface AlignmentMetadata {
  format?: string; source?: Provenance; headers?: string[];
  stockholm?: { GF: Record<string,string[]>; GS: Record<string,Record<string,string[]>>; GC: Record<string,string>; GR: Record<string,Record<string,string>> };
  [key:string]: unknown;
}
export interface Alignment {
  id: string; name: string; alphabet: Alphabet; width: number; rows: Sequence[];
  codes: Uint8Array; annotations: Annotation[]; metadata: AlignmentMetadata;
}
export interface ParseOptions { name?: string; alphabet?: Alphabet; format?: 'fasta'|'stockholm'|'clustal'; source?: Provenance }
/** `entropy` and `information` are in bits (NaN for all-gap columns); `quality` is 0 to 1, protein only (NaN otherwise and for columns with fewer than two scored residues). */
export interface AlignmentStats { width:number; total:number; counts:Uint32Array; gaps:Uint32Array; consensus:Uint8Array; frequency:Float32Array; support:Float32Array; entropy:Float32Array; information:Float32Array; quality:Float32Array }
export interface ColumnDetail { column:number; total:number; gapCount:number; gapFraction:number|null; consensus:string|null; tied:boolean; frequency:number|null; support:number|null; entropy:number|null; information:number|null; quality:number|null; counts:{residue:string;count:number}[] }
export interface Identity { matches:number; compared:number; identity:number|null }
export interface Selection { start:number; end:number; rowId?:string }
export interface AnnotationFilter { types?:string[]; consequences?:string[]; disease?:boolean; phenotype?:boolean; hiddenRowIds?:string[] }
export type ColorMode = 'all'|'reference-differences'|'reference-matches'|'consensus-differences'|'consensus-matches';
/** Presentation switches. Omitted keys retain their current value on updates. */
export interface ViewerVisibility {
  toolbar?:boolean;
  tools?:boolean;
  overview?:boolean;
  overviewTitle?:boolean;
  tracks?:boolean;
  alignment?:boolean;
  inspector?:boolean;
  inspectorTabs?:boolean;
  status?:boolean;
  statusSummary?:boolean;
  statusDetails?:boolean;
  open?:boolean;
  search?:boolean;
  colorScheme?:boolean;
  zoom?:boolean;
  fit?:boolean;
  theme?:boolean;
  inspectorToggle?:boolean;
  fullscreen?:boolean;
  export?:boolean;
  goTo?:boolean;
  motif?:boolean;
  order?:boolean;
  colorMode?:boolean;
  logoToggle?:boolean;
  statisticsScope?:boolean;
  alphabet?:boolean;
  ruler?:boolean;
  modalFrequency?:boolean;
  gapFraction?:boolean;
  consensus?:boolean;
  logo?:boolean;
  entropy?:boolean;
  quality?:boolean;
  stockholmTracks?:boolean;
  reference?:boolean;
  labels?:boolean;
  rowNames?:boolean;
  rowSpecies?:boolean;
  rowSelection?:boolean;
  rowPinning?:boolean;
  labelResize?:boolean;
  residueLetters?:boolean;
  annotationMarks?:boolean;
  selectionOverlay?:boolean;
  positionTab?:boolean;
  featuresTab?:boolean;
  compareTab?:boolean;
  colorsTab?:boolean;
  pinReference?:boolean;
  rowFeaturesToggle?:boolean;
  featureType?:boolean;
  featureConsequence?:boolean;
  diseaseFilter?:boolean;
  phenotypeFilter?:boolean;
  featurePagination?:boolean;
  calculateIdentity?:boolean;
  clearRows?:boolean;
  messages?:boolean;
  emptyState?:boolean;
}
export type TrackType = 'bar'|'heatmap'|'text'|'custom';
export interface TrackRenderInfo { start:number; end:number; cellWidth:number; offsetX:number; top:number; height:number; alignment:Alignment }
/** A track drawn below the built-in tracks. `values` holds one entry per alignment column; a string gives one character per column (digits read as 0 to 9 for bar and heatmap). `render` is required for `custom` and is called with the context clipped to the track; `start` and `end` are the visible 1-based inclusive columns and `offsetX` is the x of column `start`. */
export interface CustomTrack {
  id:string; label:string; /** 12 to 120, default 26. */ height?:number; type:TrackType;
  values?:ArrayLike<number|null>|string; /** Default [0, 1]. */ domain?:[number,number]; color?:string;
  render?(ctx:CanvasRenderingContext2D,info:TrackRenderInfo):void;
}
export interface ViewerOptions {
  visibility?:ViewerVisibility;
  alignment?: Alignment; height?:number; theme?:'light'|'dark';
  colorScheme?:string; colorMode?:ColorMode; cellWidth?:number; rowHeight?:number;
  labelWidth?:number; showLogo?:boolean; showInspector?:boolean; showToolbar?:boolean;
  statisticsScope?:'all'|'filtered'; workerUrl?:string|URL; worker?:boolean;
  /** 0 to 1. Consensus columns whose modal frequency (non-gap rows) is below this become X (protein) or N (DNA/RNA). Default 0. */
  consensusThreshold?:number;
  /** FASTA settings for exports and Ctrl/Cmd+C; updates merge with the current settings. */
  fasta?:FastaOptions;
  /** Keep location.hash in sync with the view and apply a link found there on the next load. */
  urlSync?:boolean;
  /** Registered tracks; replaces the current set. */
  tracks?:CustomTrack[];
  /** 'bits' scales each logo stack by information content. Default 'frequency'. */
  logoMode?:'frequency'|'bits';
  /** Odd integer 1 to 51 (default 1): centered moving average for the entropy and quality bars. */
  conservationWindow?:number;
}
export interface ViewState {
  visibility?:ViewerVisibility;
  version:1; alignmentId:string; referenceId:string|null; query:string; sort:'input'|'name'|'identity';
  start:number; rowOffset:number; cellWidth:number; selection:Selection|null;
  colorScheme:string; colorMode:ColorMode; statisticsScope:'all'|'filtered'; annotationFilter:AnnotationFilter;
}
export interface Viewport { start:number; end:number; firstRow:number; lastRow:number; visibleRows:number; totalRows:number }
export interface ViewerEvents { selection:Selection|null; viewport:Viewport; annotation:Annotation; error:Error; ready:Alignment; state:ViewState }
export type ViewerEvent = keyof ViewerEvents;
export type EventHandler<K extends ViewerEvent> = (event:ViewerEvents[K])=>void;
/** FASTA output settings shared by export and copy. Defaults: keep gaps, original case, 80 columns, name header. */
export interface FastaOptions { gaps?:'keep'|'remove'; letterCase?:'original'|'upper'|'lower'; /** 0 writes each sequence on one line; otherwise 10 to 1000. */ lineWidth?:number; header?:'name'|'name-species'|'id-name' }
export interface ExportRegion { rowIds?:string[]; start?:number; end?:number }
