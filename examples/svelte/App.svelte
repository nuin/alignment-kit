<script lang="ts">
  import AlignmentViewer from '../../src/svelte/AlignmentViewer.svelte';
  import { sample } from '../shared';
  import type { Selection } from '../../src/types';
  let count=$state(4),dark=$state(false),mounted=$state(true),selection=$state<Selection|null>(null);
  const alignment=$derived(sample(count));
  const options=$derived({height:650,workerUrl:typeof window!=='undefined'?(window as any).__ALIGNMENT_PREVIEW__?.workerUrl:undefined,theme:dark?'dark' as const:'light' as const});
</script>
<main><a href="/">Alignment Kit</a><h1>Svelte integration</h1><p>The same viewer, managed by Svelte 5. The component and action support reactive props, callbacks and lifecycle cleanup.</p>
<div class="example-actions"><button onclick={()=>count=count===4?6:4}>Change dataset</button><button onclick={()=>dark=!dark}>Change theme</button><button onclick={()=>mounted=!mounted}>{mounted?'Unmount viewer':'Mount viewer'}</button><output data-testid="selection">Selection: {selection?`${selection.start}–${selection.end}`:'none'}</output></div>
{#if mounted}<AlignmentViewer {alignment} {options} onSelectionChange={value=>selection=value} onError={console.error}/>{/if}
<pre>{`<AlignmentViewer\n  {alignment}\n  options={{ height: 650, theme: 'light' }}\n  onSelectionChange={(value) => selection = value}\n/>`}</pre><a href="/examples/react/">See the React integration</a></main>
