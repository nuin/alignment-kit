import { createViewer, type AlignmentViewer } from './viewer';
import type { Alignment, ViewerOptions, Selection, Viewport, Annotation, SearchResult, ParseWarning, CellInfo, CellClick } from './types';
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
