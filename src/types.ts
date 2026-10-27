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
export interface AlignmentStats { width:number; total:number; counts:Uint32Array; gaps:Uint32Array; consensus:Uint8Array; frequency:Float32Array; support:Float32Array }
export interface ColumnDetail { column:number; total:number; gapCount:number; gapFraction:number|null; consensus:string|null; tied:boolean; frequency:number|null; support:number|null; counts:{residue:string;count:number}[] }
export interface Identity { matches:number; compared:number; identity:number|null }
export interface Selection { start:number; end:number; rowId?:string }
export interface AnnotationFilter { types?:string[]; consequences?:string[]; disease?:boolean; phenotype?:boolean; hiddenRowIds?:string[] }
export type ColorMode = 'all'|'reference-differences'|'reference-matches'|'consensus-differences'|'consensus-matches';
export interface ViewerOptions {
  alignment?: Alignment; height?:number; name?:string; theme?:'light'|'dark';
  colorScheme?:string; colorMode?:ColorMode; cellWidth?:number; rowHeight?:number;
  labelWidth?:number; showLogo?:boolean; showInspector?:boolean; showToolbar?:boolean;
  statisticsScope?:'all'|'filtered'; workerUrl?:string|URL; worker?:boolean;
}
export interface ViewState {
  version:1; alignmentId:string; referenceId:string|null; query:string; sort:'input'|'name'|'identity';
  start:number; rowOffset:number; cellWidth:number; selection:Selection|null;
  colorScheme:string; colorMode:ColorMode; statisticsScope:'all'|'filtered'; annotationFilter:AnnotationFilter;
}
export interface Viewport { start:number; end:number; firstRow:number; lastRow:number; visibleRows:number; totalRows:number }
export interface ViewerEvents { selection:Selection|null; viewport:Viewport; annotation:Annotation; error:Error; ready:Alignment; state:ViewState }
export type ViewerEvent = keyof ViewerEvents;
export type EventHandler<K extends ViewerEvent> = (event:ViewerEvents[K])=>void;
export interface ExportRegion { rowIds?:string[]; start?:number; end?:number }
