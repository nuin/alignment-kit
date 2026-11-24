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
const plain=(x:unknown):x is Record<string,unknown>=>{if(typeof x!=='object'||x===null)return false;const p=Object.getPrototypeOf(x);return p===Object.prototype||p===null;};
/** Equal values in plain objects and arrays at any depth. Functions, typed arrays and class instances compare by identity. */
function sameOptions(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true;
  if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>sameOptions(x,b[i]));
  if(!plain(a)||!plain(b))return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>k in b&&sameOptions(a[k],b[k]));
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
      // Equal options are skipped, so an inline object does not re-lay out on every parent render. A rejected object is kept as the baseline too, so it is not applied again until it changes; setOptions has already emitted its error.
      if(!sameOptions(next.options,options)){options=next.options;try{viewer.setOptions(options??{});}catch{}}
      if(next.alignment!==alignment){alignment=next.alignment;if(alignment)void viewer.setAlignment(alignment).catch(()=>{});else viewer.clear();}
    },
    destroy(){viewer.destroy();}
  };
}
