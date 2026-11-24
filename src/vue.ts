import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, toRaw, watch, type PropType } from 'vue';
import { mountViewer, type IntegrationProps } from './integration';
import type { AlignmentViewer as Viewer } from './viewer';
import type { Alignment, Annotation, CellClick, CellInfo, ParseWarning, SearchResult, Selection, ViewerOptions, Viewport } from './types';
/** Vue 3 host. `alignment` and `options` are read raw (toRaw), so replace them to update; `class`, `style` and `id` fall through to the div. The template ref exposes `viewer`. */
export const AlignmentViewer=defineComponent({
  name:'AlignmentViewer',
  props:{alignment:Object as PropType<Alignment>,options:Object as PropType<Omit<ViewerOptions,'alignment'>>},
  emits:{
    ready:(_viewer:Viewer)=>true,selectionChange:(_selection:Selection|null)=>true,viewportChange:(_viewport:Viewport)=>true,annotationClick:(_annotation:Annotation)=>true,
    hover:(_cell:CellInfo|null)=>true,cellClick:(_click:CellClick)=>true,error:(_error:Error)=>true,search:(_result:SearchResult|null)=>true,warnings:(_warnings:ParseWarning[])=>true
  },
  setup(props,{emit,expose}) {
    const host=shallowRef<HTMLElement|null>(null),viewer=shallowRef<Viewer|null>(null);
    let controller:ReturnType<typeof mountViewer>|undefined;
    const callbacks:IntegrationProps={
      onReady:v=>{viewer.value=v;emit('ready',v);},onSelectionChange:v=>emit('selectionChange',v),onViewportChange:v=>emit('viewportChange',v),onAnnotationClick:v=>emit('annotationClick',v),
      onHover:v=>emit('hover',v),onCellClick:v=>emit('cellClick',v),onError:v=>emit('error',v),onSearch:v=>emit('search',v),onWarnings:v=>emit('warnings',v)
    };
    const current=():IntegrationProps=>({alignment:toRaw(props.alignment),options:toRaw(props.options),...callbacks});
    onMounted(()=>{controller=mountViewer(host.value!,current());});
    watch(()=>[props.alignment,props.options],()=>controller?.update(current()),{flush:'post'});
    onBeforeUnmount(()=>{controller?.destroy();controller=undefined;viewer.value=null;});
    expose({viewer});
    return ()=>h('div',{ref:host});
  }
});
export type { IntegrationProps } from './integration';
