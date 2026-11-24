import { createViewer, type AlignmentViewer } from './viewer';
import type { Alignment, ViewerOptions, Selection, Viewport, Annotation, SearchResult, ParseWarning, CellInfo, CellClick, ViewState } from './types';
import { fromJson } from './wire';
import type { ViewerConfig } from './config';
export interface IntegrationProps {
  alignment?:Alignment;
  options?:Omit<ViewerOptions,'alignment'>;
  onReady?:(viewer:AlignmentViewer)=>void;
  onSelectionChange?:(selection:Selection|null)=>void;
  onViewportChange?:(viewport:Viewport)=>void;
  onAnnotationClick?:(annotation:Annotation)=>void;
  /** The cell under the mouse or pen, or null when it leaves the grid. Not sent for touch. */
  onHover?:(cell:CellInfo|null)=>void;
  onCellClick?:(click:CellClick)=>void;
  onError?:(error:Error)=>void;
  /** A copy of the hits after each search, or null when the search is cleared. */
  onSearch?:(result:SearchResult|null)=>void;
  /** The parser warnings of each loaded alignment; empty when it had none. */
  onWarnings?:(warnings:ParseWarning[])=>void;
}
/** A single lifecycle controller shared by framework integrations. */
export function mountViewer(element:HTMLElement,initial:IntegrationProps={}) {
  let props=initial,alignment=initial.alignment,options=initial.options;
  const viewer=createViewer(element,initial.options);
  viewer.on('selection',value=>props.onSelectionChange?.(value));
  viewer.on('viewport',value=>props.onViewportChange?.(value));
  viewer.on('annotation',value=>props.onAnnotationClick?.(value));
  viewer.on('hover',value=>props.onHover?.(value));
  viewer.on('cellclick',value=>props.onCellClick?.(value));
  viewer.on('error',value=>props.onError?.(value));
  viewer.on('search',value=>props.onSearch?.(value));
  viewer.on('warnings',value=>props.onWarnings?.(value));
  if(alignment)void viewer.setAlignment(alignment).catch(()=>{});
  props.onReady?.(viewer);
  return {
    viewer,
    update(next:IntegrationProps) {
      props=next;
      if(next.options!==options){options=next.options;viewer.setOptions(options??{});}
      if(next.alignment!==alignment){alignment=next.alignment;if(alignment)void viewer.setAlignment(alignment).catch(()=>{});else viewer.clear();}
    },
    destroy(){viewer.destroy();}
  };
}
/** Callbacks of mountWire. `onError` receives load and state failures; a document that fails validation throws from mountWire and from `update` instead. */
export interface WireHandlers { onSelection?:(selection:Selection|null)=>void; onState?:(state:ViewState)=>void; onReady?:(alignment:Alignment)=>void; onError?:(error:Error)=>void }
/** Shows a version 1 wire document (JSON text or a parsed value): creates the viewer with the document's `config` over `defaults`, loads the alignment, then applies `tree` and `state`. Used by the HTML template and the Python and R widgets. */
export function mountWire(element:HTMLElement,input:string|unknown,handlers:WireHandlers={},defaults:ViewerConfig={}) {
  let doc=fromJson(input);
  const viewer=createViewer(element,{...defaults,...doc.config});
  const fail=(error:unknown)=>{handlers.onError?.(error instanceof Error?error:new Error(String(error)));};
  const setState=(state:ViewState):Promise<void>=>viewer.setState({...state,alignmentId:viewer.getAlignment()?.id??''});
  const apply=async()=>{const current=doc;await viewer.setAlignment(current.alignment);if(current!==doc)return;if(current.tree)viewer.setTree(current.tree);if(current.state)await setState(current.state);if(current===doc)handlers.onReady?.(current.alignment);};
  viewer.on('selection',value=>handlers.onSelection?.(value));viewer.on('state',value=>handlers.onState?.(value));
  let ready=apply().catch(fail);
  return {
    viewer,
    /** Settles when the latest document is shown; failures go to `onError`. */
    get ready(){return ready;},
    update(next:string|unknown):Promise<void> {doc=fromJson(next);if(doc.config)viewer.setOptions(doc.config);return ready=apply().catch(fail);},
    /** Applies a view state to the loaded alignment, whatever its `alignmentId`. */
    setState,
    destroy(){viewer.destroy();}
  };
}
