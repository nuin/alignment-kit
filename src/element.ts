import { mountViewer, type IntegrationProps } from './integration';
import type { AlignmentViewer } from './viewer';
import type { Alignment, Annotation, CellClick, CellInfo, ParseWarning, SearchResult, Selection, ViewerOptions, Viewport } from './types';
/** Event name to `detail` type. Every IntegrationProps callback has one bubbling CustomEvent. */
export interface MsaCanvasEventMap {
  'msa-ready':AlignmentViewer; 'msa-selection':Selection|null; 'msa-viewport':Viewport; 'msa-annotation':Annotation; 'msa-hover':CellInfo|null;
  'msa-cellclick':CellClick; 'msa-error':Error; 'msa-search':SearchResult|null; 'msa-warnings':ParseWarning[];
}
export type MsaCanvasEvents={[K in keyof MsaCanvasEventMap]:CustomEvent<MsaCanvasEventMap[K]>};
export type MsaCanvasSource=string|Blob|ArrayBuffer;
const keys=['alignment','options','source'] as const;
// Node has no HTMLElement; the empty base keeps the import SSR-safe and is never constructed.
const Base=(typeof HTMLElement==='undefined'?class{}:HTMLElement) as typeof HTMLElement;
/** `<msa-canvas>`: a light-DOM host over mountViewer. Set `alignment`, `options` and `source` as properties; the page stylesheet styles the viewer. */
export class MsaCanvasElement extends Base {
  private controller?:ReturnType<typeof mountViewer>;
  private live?:AlignmentViewer;
  private held:{alignment?:Alignment;options?:Omit<ViewerOptions,'alignment'>;source?:MsaCanvasSource|null}={};
  private send<K extends keyof MsaCanvasEventMap>(type:K,detail:MsaCanvasEventMap[K]):void {this.dispatchEvent(new CustomEvent(type,{detail,bubbles:true,composed:true}));}
  private callbacks:IntegrationProps={
    onReady:v=>{this.live=v;this.send('msa-ready',v);},onSelectionChange:v=>this.send('msa-selection',v),onViewportChange:v=>this.send('msa-viewport',v),
    onAnnotationClick:v=>this.send('msa-annotation',v),onHover:v=>this.send('msa-hover',v),onCellClick:v=>this.send('msa-cellclick',v),
    onError:v=>this.send('msa-error',v),onSearch:v=>this.send('msa-search',v),onWarnings:v=>this.send('msa-warnings',v)
  };
  private props():IntegrationProps {return {alignment:this.held.alignment,options:this.held.options,...this.callbacks};}
  private read():void {const source=this.held.source;if(source!=null)void this.live?.load(source).catch(()=>{});}
  /** The imperative viewer while the element is connected. */
  get viewer():AlignmentViewer|undefined {return this.live;}
  get alignment():Alignment|undefined {return this.held.alignment;}
  set alignment(value:Alignment|undefined) {this.held.alignment=value??undefined;this.controller?.update(this.props());}
  get options():Omit<ViewerOptions,'alignment'>|undefined {return this.held.options;}
  set options(value:Omit<ViewerOptions,'alignment'>|undefined) {this.held.options=value??undefined;this.controller?.update(this.props());}
  /** Alignment text or bytes, parsed by the viewer. It replaces `alignment`; null leaves the current alignment in place. */
  get source():MsaCanvasSource|null|undefined {return this.held.source;}
  set source(value:MsaCanvasSource|null|undefined) {this.held.source=value;this.read();}
  /** A property assigned before the element was defined is an own property that hides the accessor; move it through the setter. */
  private upgrade<K extends typeof keys[number]>(key:K):void {if(!Object.hasOwn(this,key))return;const value=this[key];Reflect.deleteProperty(this,key);this[key]=value;}
  connectedCallback():void {
    if(this.controller)return;
    for(const key of keys)this.upgrade(key);
    if(!this.style.display)this.style.display='block';
    this.controller=mountViewer(this,this.props());this.read();
  }
  disconnectedCallback():void {this.controller?.destroy();this.controller=undefined;this.live=undefined;}
}
if(typeof customElements!=='undefined'&&!customElements.get('msa-canvas'))customElements.define('msa-canvas',MsaCanvasElement);
declare global {
  interface HTMLElementTagNameMap { 'msa-canvas':MsaCanvasElement }
  interface HTMLElementEventMap extends MsaCanvasEvents {}
}
export type { IntegrationProps } from './integration';
