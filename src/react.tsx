'use client';
import { useEffect, useRef, createElement, type CSSProperties } from 'react';
import { mountViewer, type IntegrationProps } from './integration';
export interface AlignmentViewerProps extends IntegrationProps { className?:string; style?:CSSProperties; id?:string }
/** SSR-safe host. React StrictMode setup/cleanup is supported. */
export function AlignmentViewer({alignment,options,onReady,onSelectionChange,onViewportChange,onAnnotationClick,onError,className,style,id}:AlignmentViewerProps) {
  const host=useRef<HTMLDivElement>(null),controller=useRef<ReturnType<typeof mountViewer>|null>(null);
  const current=useRef<IntegrationProps>({});
  current.current={alignment,options,onReady,onSelectionChange,onViewportChange,onAnnotationClick,onError};
  useEffect(()=>{controller.current=mountViewer(host.current!,current.current);return()=>{controller.current?.destroy();controller.current=null;};},[]);
  useEffect(()=>controller.current?.update(current.current),[alignment,options,onReady,onSelectionChange,onViewportChange,onAnnotationClick,onError]);
  return createElement('div',{ref:host,className,style,id});
}
export type { IntegrationProps } from './integration';
