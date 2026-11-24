# Frameworks, script tag, workers and Deno

## Entry points

| Import | Use | Peer |
| --- | --- | --- |
| `@nuin/msa-canvas` | Core API: `createViewer`, parsers, statistics, export | none |
| `@nuin/msa-canvas/react` | React component | `react >=18` |
| `@nuin/msa-canvas/svelte/AlignmentViewer.svelte` | Svelte 5 component | `svelte ^5` |
| `@nuin/msa-canvas/svelte` | Svelte action | `svelte ^5` |
| `@nuin/msa-canvas/vue` | Vue 3 component | `vue ^3.3` |
| `@nuin/msa-canvas/element` | `<msa-canvas>` custom element | none |
| `@nuin/msa-canvas/pavi` | `fromPavi` | none |
| `@nuin/msa-canvas/style.css` | Styles, fonts as sibling files | none |
| `@nuin/msa-canvas/style.inline.css` | Styles, fonts as data URLs | none |
| `@nuin/msa-canvas/worker.js` | Module worker (imports sibling chunks) | none |
| `@nuin/msa-canvas/msa-canvas.worker.js` | Worker in one file, no imports | none |
| `@nuin/msa-canvas/msa-canvas.global.js` | Script-tag bundle, global `MsaCanvas` | none |

All peers are optional. Solid and Angular have recipes below and no package entry. Every wrapper is a thin shell over one lifecycle controller, so behavior is the same in each.

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

### Preact

The React entry uses `useEffect`, `useRef` and one `div`. Alias `react` and `react-dom` to `preact/compat` in the bundler and import `@nuin/msa-canvas/react` as usual. `npm run check:package` builds no Preact consumer.

### Next.js app router

The React entry starts with `"use client"`, and `npm run check:package` asserts it. Import it from a client component and parse in the browser:

```tsx
'use client';
import { useMemo } from 'react';
import { AlignmentViewer } from '@nuin/msa-canvas/react';
import { parseAlignment } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

const options = { height: 650 };
export default function Alignment({ text }: { text: string }) {
  const alignment = useMemo(() => parseAlignment(text), [text]);
  return <AlignmentViewer alignment={alignment} options={options} />;
}
```

The server render is an empty `div`. `next/dynamic` with `ssr: false` is optional. Webpack builds bundle the worker (see [Workers and bundlers](#workers-and-bundlers)). Turbopack is not tested here: when the worker fails to start, copy `dist/msa-canvas.worker.js` to `public/` and pass `workerUrl: '/msa-canvas.worker.js'`.

### Astro

`<Alignment client:load text={text} />` hydrates the React component above; `client:only="react"` skips the empty server render. Without a UI framework, use the custom element in a page script, which Astro bundles with Vite:

```astro
<msa-canvas id="msa"></msa-canvas>
<script>
  import '@nuin/msa-canvas/element';
  import '@nuin/msa-canvas/style.css';
  const el = document.querySelector('msa-canvas')!;
  el.source = await (await fetch('/family.sto')).text();
</script>
```

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

### SvelteKit

The component and the action render on the server as an empty `div`, so no `browser` guard or `ssr = false` is needed. Hold a parsed alignment in `$state.raw` (see [Reactive state](#reactive-state)). Vite bundles the worker.

## Vue 3

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import { AlignmentViewer } from '@nuin/msa-canvas/vue';
import { parseAlignment, type Alignment, type Selection } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

const alignment = shallowRef<Alignment>(parseAlignment('>a\nACGT\n>b\nAC-T'));
const selection = shallowRef<Selection | null>(null);
const options = { height: 650, showLogo: true };
</script>

<template>
  <AlignmentViewer :alignment="alignment" :options="options" class="msa"
    @selection-change="selection = $event" @error="console.error" />
</template>
```

The component is a `defineComponent` with a render function, so it needs no SFC compiler. Props: `alignment`, `options`. Events: `ready`, `selection-change`, `viewport-change`, `annotation-click`, `hover`, `cell-click`, `error`, `search`, `warnings`. `class`, `style` and `id` fall through to the host `div`. A template ref exposes `viewer`, the imperative API. The server render is an empty `div`; Nuxt needs no `<ClientOnly>`. The component reads both props through `toRaw`, so it reacts to a replaced object and not to a mutated one.

## Web Component

```ts
import '@nuin/msa-canvas/element';
import '@nuin/msa-canvas/style.css';

const el = document.createElement('msa-canvas');
el.options = { height: 650 };
el.source = alignmentText;               // or: el.alignment = parseAlignment(alignmentText)
el.addEventListener('msa-selection', event => console.log(event.detail));
document.body.append(el);
```

Importing the entry registers `<msa-canvas>` once. On the server, where `customElements` is missing, the import registers nothing and exports the class `MsaCanvasElement`.

- Properties: `alignment` (a parsed `Alignment`), `options` (`ViewerOptions` without `alignment`), `source` (alignment text, `Blob` or `ArrayBuffer`, parsed by the viewer and replacing `alignment`). `viewer` is the imperative API while the element is connected. There are no attributes.
- The element renders in the light DOM, so the page stylesheet and the `--ak-*` properties apply. It sets `display: block` on itself unless a display value is already inline. This release has no Shadow DOM mode.
- Connecting creates one viewer. Disconnecting destroys it. Moving the element creates a new viewer with the held properties.
- Events are `CustomEvent`s with the payload in `detail`. They bubble and are composed. The names carry an `msa-` prefix because the viewer's own inputs fire native `selectionchange` and `search` events through the host.
- `msa-ready` fires during connection. An element that is already in the document has fired it before a later script can listen; read `el.viewer` there.
- Properties set before the element is defined are applied at upgrade.

`HTMLElementTagNameMap` and `HTMLElementEventMap` are augmented, so `document.createElement('msa-canvas')` and `addEventListener('msa-selection', ...)` are typed.

### Solid

No package entry. Use the element with `prop:` and `on:`:

```tsx
import '@nuin/msa-canvas/element';
import '@nuin/msa-canvas/style.css';

<msa-canvas prop:alignment={alignment()} prop:options={options} on:msa-selection={e => setSelection(e.detail)} />
```

Or wrap `createViewer`:

```tsx
import { createEffect, on, onCleanup, onMount } from 'solid-js';
import { createViewer, type Alignment, type Selection, type ViewerOptions } from '@nuin/msa-canvas';

export function AlignmentViewer(props: { alignment?: Alignment; options?: ViewerOptions; onSelectionChange?: (s: Selection | null) => void }) {
  let host!: HTMLDivElement;
  onMount(() => {
    const viewer = createViewer(host, props.options);
    viewer.on('selection', s => props.onSelectionChange?.(s));
    createEffect(() => { const a = props.alignment; if (a) void viewer.setAlignment(a).catch(() => {}); else viewer.clear(); });
    createEffect(on(() => props.options, o => viewer.setOptions(o ?? {}), { defer: true }));
    onCleanup(() => viewer.destroy());
  });
  return <div ref={host} />;
}
```

`onMount` does not run under SSR. Declare `msa-canvas` in `JSX.IntrinsicElements` for TypeScript. This recipe is not built in this repository.

### Angular

No package entry. Use the element with `CUSTOM_ELEMENTS_SCHEMA`:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output } from '@angular/core';
import type { Alignment, Selection, ViewerOptions } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/element';

@Component({
  selector: 'app-alignment',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<msa-canvas [alignment]="alignment" [options]="options" (msa-selection)="selected.emit($event.detail)"></msa-canvas>`
})
export class AlignmentComponent {
  @Input() alignment?: Alignment;
  @Input() options: Omit<ViewerOptions, 'alignment'> = { height: 650 };
  @Output() selected = new EventEmitter<Selection | null>();
}
```

Add `node_modules/@nuin/msa-canvas/dist/style.css` to `styles` in `angular.json`. Square-bracket bindings set properties, which is what the element reads. With zone.js every bound event runs change detection: `msa-hover` and `msa-viewport` fire on pointer moves and scrolls, so listen to those inside `NgZone.runOutsideAngular`. The import is SSR-safe. This recipe is not built in this repository.

## Script tag and CDN

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@nuin/msa-canvas@VERSION/dist/style.inline.css">
<script src="https://cdn.jsdelivr.net/npm/@nuin/msa-canvas@VERSION/dist/msa-canvas.global.js"></script>

<msa-canvas id="msa"></msa-canvas>
<script>
  const el = document.getElementById('msa');
  el.options = { height: 600 };
  el.source = '>a\nACGT\n>b\nAC-T';
  el.addEventListener('msa-selection', event => console.log(event.detail));
  // The core API is on the global: MsaCanvas.createViewer(host), MsaCanvas.parseAlignment(text).
</script>
```

Replace `VERSION` with a release later than 0.5.2, the last one without these files. `https://unpkg.com/@nuin/msa-canvas@VERSION` resolves to the same bundle through the `unpkg` and `jsdelivr` fields.

- `dist/msa-canvas.global.js` is one minified IIFE. `MsaCanvas` holds every export of the core entry plus `fromPavi`, `mountViewer` and `MsaCanvasElement`, and the script registers `<msa-canvas>`.
- The bundle holds the worker code as a string. With `workerUrl` unset it starts workers from one `blob:` URL, so no second file is fetched. That works from a CDN, a `file:` page and an iframe (Jupyter, Shiny, Streamlit). Under a CSP without `worker-src blob:` see the [CSP matrix](#content-security-policy).
- `npm run check:package` loads the packed bundle from a plain HTML file with workers on and runs each blob worker in a Node thread (jsdom has no `Worker`). `tests/package.spec.ts` opens the same file from a `file:` URL in Chromium and WebKit and requires every worker URL to start with `blob:`.
- `dist/style.inline.css` is `style.css` with both font files as `data:` URLs (about 190 kB). A single-file host can paste it into a `<style>` tag. On a CDN `dist/style.css` also works, since its fonts sit beside it.
- A bundler can inline the worker the same way: define the global constant `__MSA_CANVAS_WORKER__` as the text of `dist/msa-canvas.worker.js`. `scripts/preview.mjs` builds the offline demo files this way.
- The ESM files load from a CDN too (`import { createViewer } from 'https://cdn.jsdelivr.net/npm/@nuin/msa-canvas@VERSION/dist/index.js'`), but browsers refuse a worker script from another origin. Pass a same-origin `workerUrl`, a blob factory or `worker: false`.

## Props, callbacks and events

Every integration takes `alignment` and `options`. The callbacks of `IntegrationProps` map to viewer events as follows.

| Viewer event | React and Svelte prop | Vue event | Element event | Payload |
| --- | --- | --- | --- | --- |
| (mount) | `onReady` | `ready` | `msa-ready` | the `AlignmentViewer` |
| `selection` | `onSelectionChange` | `selection-change` | `msa-selection` | `Selection` or `null` |
| `viewport` | `onViewportChange` | `viewport-change` | `msa-viewport` | `Viewport` |
| `annotation` | `onAnnotationClick` | `annotation-click` | `msa-annotation` | `Annotation` |
| `hover` | `onHover` | `hover` | `msa-hover` | `CellInfo` or `null`; not sent for touch |
| `cellclick` | `onCellClick` | `cell-click` | `msa-cellclick` | `CellClick` |
| `error` | `onError` | `error` | `msa-error` | `Error` |
| `search` | `onSearch` | `search` | `msa-search` | a copy of `{ hits, truncated }`, or `null` when cleared |
| `warnings` | `onWarnings` | `warnings` | `msa-warnings` | `ParseWarning[]`, empty when the alignment had none |

`onReady` receives the imperative viewer right after mounting. It is not the viewer's `ready` event: subscribe to that on the viewer when you need loaded data and statistics. Replace alignment and options objects; do not mutate them in place. Clearing `alignment` to `undefined` clears the viewer. Callbacks are updated without recreating the engine. Worker configuration (`worker`, `workerUrl`) is fixed at mount; visual options are reactive.

## Reactive state

An `Alignment` holds its residues in one typed array, `codes`. A deep reactive wrapper returns a Proxy, and that costs twice: the proxy is a different object from the one the viewer holds, and every element read goes through a trap. Keep the alignment and the viewer out of deep reactivity.

| Framework | Hold the alignment with | Avoid |
| --- | --- | --- |
| Vue 3 | `shallowRef(alignment)` or `markRaw(alignment)` | `ref(alignment)`, `reactive({ alignment })` |
| Svelte 5 | `$state.raw(alignment)`, or a plain prop | `$state(alignment)` |
| Solid | a signal, or `unwrap(store.alignment)` when it lives in a store | passing the store proxy |
| React, Preact | `useState` or `useMemo` | rebuilding it on every render |
| Angular | a plain field or a `signal` | none; neither wraps the object |

The Vue component calls `toRaw` on `alignment` and `options`, so a deep `ref` still reaches the viewer as the raw object. Store the viewer from `onReady` the same way (`shallowRef`, `$state.raw`). An inline `options` object is a new object on every render and calls `setOptions` each time: hoist it or memoize it.

## Update semantics

`options` is a patch. Each update merges the keys it carries into the current settings through `setOptions`. A key dropped from the next object keeps its last value; pass the default explicitly to reset it. `fasta` and `export` merge key by key, `visibility` merges its boolean keys, and `tracks` and `annotationLinks` replace the whole list or map.

The wrappers compare the next `options` with the last one they applied, by value: plain objects and arrays at any depth, with functions, typed arrays and class instances compared by identity. An equal object is skipped, so an inline `options={{ height: 650 }}` does not re-lay out the viewer or close an open menu on each parent render. Mutating the same object in place is still not detected.

`setOptions` validates every key before it changes anything. A rejected call throws, emits `error` (the wrappers pass it to `onError`) and leaves every setting as it was. The wrappers do not rethrow it, and they do not apply the same rejected value again until `options` changes.

`viewport` (`onViewportChange`) fires when `start`, `end`, `firstRow`, `lastRow` or `totalRows` changes, and once after each loaded alignment. A redraw of an unchanged viewport emits nothing, so calling `setState` in the handler does not loop.

`selection` (`onSelectionChange`) also fires with `null` when a new alignment or a row removal drops the current selection.

## Workers and bundlers

Parsing, column statistics, reference identity, bounded pairwise comparison and motif search run in workers. Cancellation terminates obsolete work on replacement or disposal. Each job starts a new worker and terminates it when the job ends.

`workerUrl` accepts three forms:

- a string or `URL` of a module worker (`new Worker(url, { type: 'module' })`);
- a factory `() => Worker`, called once per job, which must return a new worker each time;
- unset: the global bundle uses its inlined worker, every other build uses `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`.

The JSON configuration (`parseViewerConfig`) accepts only the string form.

| Bundler | Default (`workerUrl` unset) | Explicit setup |
| --- | --- | --- |
| Vite (checked with Vite 7) | Emits the worker as an asset. `npm run check:package` asserts this for React, Svelte, Vue and the element. | `import MsaWorker from '@nuin/msa-canvas/worker.js?worker'` then `workerUrl: () => new MsaWorker()`. If the dev server cannot find the worker, add the package to `optimizeDeps.exclude`. |
| Webpack 5, Next.js (webpack) | Recognizes the `new Worker(new URL(...), { type: 'module' })` form in dependencies. | `workerUrl: () => new Worker(new URL('@nuin/msa-canvas/worker.js', import.meta.url), { type: 'module' })` |
| Rspack, Rsbuild | Same syntax as Webpack 5. | Same factory as Webpack 5. |
| Parcel 2 | Recognizes the same form. | `workerUrl: () => new Worker(new URL('npm:@nuin/msa-canvas/worker.js', import.meta.url), { type: 'module' })` |
| esbuild, Rollup without a worker plugin, no bundler | The worker is not bundled. | Copy `dist/msa-canvas.worker.js` to a served directory and pass its URL, or copy all of `dist` and point at `dist/worker.js` with its sibling chunks. |

Only the Vite row is built in this repository. The Webpack 5, Rspack and Parcel rows follow each bundler's documented worker syntax. `dist/msa-canvas.worker.js` has no imports and works with every row as a plain URL.

Importing any entry is SSR-safe. Creating a viewer requires a browser, Canvas 2D, ResizeObserver and Worker support. Gzip uses DecompressionStream. `worker: false` runs the same analysis on the main thread; use it for small inputs and DOM tests. The motif-search hard timeout exists only on the worker path. No alignment is uploaded by the library.

## Content Security Policy

| Feature | Directive needed |
| --- | --- |
| Library script from your origin | `script-src 'self'` |
| Library script from a CDN | `script-src https://cdn.jsdelivr.net` (or the CDN in use) |
| Module worker `dist/worker.js` or `dist/msa-canvas.worker.js` from your origin | `worker-src 'self'` (browsers fall back to `script-src`) |
| Inlined worker of the global bundle, or any blob factory | `worker-src blob:` |
| Worker under a policy with no `blob:` and a CDN-hosted script | Same-origin copy of `dist/msa-canvas.worker.js` in `workerUrl`, or `worker: false` |
| `style.css` | `style-src 'self'`, `font-src 'self'` |
| `style.inline.css` | `style-src` for where it is served, `font-src data:` |
| Viewer layout | Nothing extra. The viewer sets styles through the CSSOM and writes no `style` attributes or inline `<style>`. |
| `loadUrl(url)` | `connect-src` for the alignment's origin |
| PNG export | `img-src blob:` (the SVG is drawn through a blob URL) |
| File downloads | Blob URLs on a temporary `<a download>` link |

A worker script must be same-origin with the page whatever the CSP says, which is why the CDN bundle uses a blob. When a worker cannot start, the job fails with "The analysis worker could not start. Check the worker URL and your Content Security Policy, or explicitly use worker: false for small alignments." The viewer does not fall back to the main thread by itself.

## Module formats and types

- The package is ESM only. Each entry has a `types` and a `default` condition, and `main` and `types` cover resolvers that ignore `exports`.
- `require('@nuin/msa-canvas')` works where Node can require ES modules: Node 22.12 and later without a flag. There is no CommonJS build.
- Declaration files use explicit `.js` specifiers. `npm run check:package` type-checks one consumer under `moduleResolution` `node16` and `bundler` with `skipLibCheck` off. TypeScript's legacy `node10` resolution finds the root entry only.
- `npm run build` prints raw and gzip sizes per entry, each with the chunks it imports statically. `npm run check:size` fails when an entry exceeds its gzip limit in `scripts/size-budget.json`. The core entry is about 100 kB gzip, the global bundle about 85 kB.

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

Parsing, statistics, consensus and FASTA export run in Deno without a DOM. The viewer runs in a browser bundle. JSR has no CSS, React, Svelte, Vue, custom element or PAVI entries. Use the npm package for those, through `npm:` specifiers in Deno (`import { AlignmentViewer } from 'npm:@nuin/msa-canvas/react'`). Node projects can install the JSR build with `npx jsr add @nuin/msa-canvas`.
