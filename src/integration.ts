import { createViewer, type AlignmentViewer } from './viewer';
import type { Alignment, ViewerOptions, Selection, Viewport, Annotation } from './types';
export interface IntegrationProps {
  alignment?:Alignment;
  options?:Omit<ViewerOptions,'alignment'>;
  onReady?:(viewer:AlignmentViewer)=>void;
  onSelectionChange?:(selection:Selection|null)=>void;
  onViewportChange?:(viewport:Viewport)=>void;
  onAnnotationClick?:(annotation:Annotation)=>void;
  onError?:(error:Error)=>void;
}
/** A single lifecycle controller shared by framework integrations. */
export function mountViewer(element:HTMLElement,initial:IntegrationProps={}) {
  let props=initial,alignment=initial.alignment,options=initial.options;
  const viewer=createViewer(element,initial.options);
  viewer.on('selection',value=>props.onSelectionChange?.(value));
  viewer.on('viewport',value=>props.onViewportChange?.(value));
  viewer.on('annotation',value=>props.onAnnotationClick?.(value));
  viewer.on('error',value=>props.onError?.(value));
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
