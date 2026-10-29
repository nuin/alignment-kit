# React, Svelte, workers and Deno

## React

```tsx
import { useMemo, useState } from 'react';
import { AlignmentViewer } from '@nuin/msa-canvas/react';
import type { Alignment, Selection } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

export function ProteinAlignment({ alignment }: { alignment?: Alignment }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const options = useMemo(() => ({ height: 650, showLogo: true }), []);
  return <>
    <AlignmentViewer
      alignment={alignment}
      options={options}
      onSelectionChange={setSelection}
      onReady={viewer => { /* imperative API available */ }}
      onError={console.error}
    />
    <output>{selection ? `${selection.start}–${selection.end}` : 'No selection'}</output>
  </>;
}
```

The component accepts `className`, `style` and `id`. It creates one viewer per mount, supports React StrictMode and disposes on unmount. Module import/server render does not access the browser DOM. In Next.js, use it within a client boundary; the built React entry retains `"use client"`.

## Svelte 5 component

```svelte
<script lang="ts">
  import AlignmentViewer from '@nuin/msa-canvas/svelte/AlignmentViewer.svelte';
  import type { Alignment, Selection } from '@nuin/msa-canvas';
  import '@nuin/msa-canvas/style.css';

  let { alignment }: { alignment?: Alignment } = $props();
  let selection = $state<Selection | null>(null);
</script>

<AlignmentViewer
  {alignment}
  options={{ height: 650, showLogo: true }}
  onSelectionChange={(value) => selection = value}
  onError={console.error}
/>
```

The Svelte component accepts `class`, `style` and `id`. It supports SSR and only instantiates the viewer when its action mounts in the browser.

## Svelte action

```svelte
<script lang="ts">
  import { alignmentViewer } from '@nuin/msa-canvas/svelte';
  import '@nuin/msa-canvas/style.css';
  let { alignment } = $props();
</script>

<div use:alignmentViewer={{
  alignment,
  options: { height: 650 },
  onSelectionChange: (selection) => console.log(selection)
}}></div>
```

Both framework integrations accept `alignment`, `options`, `onReady`, `onWarnings`, `onSelectionChange`, `onViewportChange`, `onAnnotationClick`, `onSearch` and `onError`. `onSearch` receives a copy of `{ hits, truncated }` when each search finishes, or `null` when the search is cleared. `onReady` receives the imperative viewer immediately after mounting; subscribe to its `ready` event when you need completed data/statistics. Replace alignment/options objects rather than mutating them in place. Clearing `alignment` to `undefined` clears the viewer. Callbacks are updated without recreating the engine. Worker configuration is fixed at mount; visual options are reactive.

## Workers and bundlers

Parsing, column statistics, reference identity, bounded pairwise comparison and motif search use module workers. Cancellation terminates obsolete work on replacement or disposal. The normal Vite source and packed-package builds recognize the static worker constructor and bundle it. A bundler that does not process worker URLs must copy the complete `dist` directory and pass `workerUrl` pointing to `dist/worker.js`, retaining its sibling chunks.

Importing core/React/Svelte modules is SSR-safe. Creating the actual viewer requires a browser, Canvas 2D, ResizeObserver and module Worker support. Gzip uses DecompressionStream. An explicit `worker: false` fallback is available for small inputs and DOM lifecycle tests; it runs analysis on the main thread. External workers must be permitted by your application's CSP (`worker-src`); self-contained preview files use `blob:` workers. No alignment is uploaded by the library.

## Deno and JSR

The core API is published on JSR from its TypeScript source:

```sh
deno add jsr:@nuin/msa-canvas
```

```ts
import { parseAlignment, calculateStats, consensusSequence } from '@nuin/msa-canvas';
const alignment = parseAlignment(await Deno.readTextFile('family.sto'));
console.log(consensusSequence(calculateStats(alignment), alignment.alphabet));
```

Parsing, statistics, consensus and FASTA export run in Deno without a DOM. The viewer runs in a browser bundle. JSR has no CSS, React, Svelte or PAVI entries. Use the npm package for those, through `npm:` specifiers in Deno (`import { AlignmentViewer } from 'npm:@nuin/msa-canvas/react'`). Node projects can install the JSR build with `npx jsr add @nuin/msa-canvas`.
