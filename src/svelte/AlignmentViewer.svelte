<script lang="ts">
  import { alignmentViewer, type IntegrationProps } from '../svelte.js';
  interface Props extends IntegrationProps { class?: string; style?: string; id?: string }
  let { alignment, options, onReady, onSelectionChange, onViewportChange, onAnnotationClick, onError, onSearch, class: className, style, id }: Props = $props();
</script>

<div {id} class={className} {style} use:alignmentViewer={{ alignment, options, onReady, onSelectionChange, onViewportChange, onAnnotationClick, onError, onSearch }}></div>
