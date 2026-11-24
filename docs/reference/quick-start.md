# Quick start

Five setups work with the published package: Vite, plain HTML with a module script, a Next.js client component, SvelteKit and Deno. Each recipe below shows the smallest working page for one of them.

Every browser recipe needs three things:

1. The stylesheet `@nuin/msa-canvas/style.css`. The viewer has no layout without it.
2. A host element. The viewer sets its own height from the `height` option (default 740 pixels) and fills the host width.
3. An alignment that is already aligned. `parseAlignment` reads aligned FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF and PIR.

The package ships ES modules only. `dist/` holds `index.js`, `react.js`, `svelte.js`, `pavi.js`, `worker.js`, shared chunks, `style.css` and fonts. No script-tag build with a global variable exists, so a classic `<script src>` tag cannot load the package.

| Setup | Entry | Automated check |
|---|---|---|
| [Vite](#vite) | `@nuin/msa-canvas` | The demo and `npm run check:package` build with Vite |
| [Plain HTML](#plain-html-with-a-module-script) | `dist/index.js` from an ESM CDN or your own server | None; see the notes in that section |
| [Next.js](#next-client-component) | `@nuin/msa-canvas/react` | `npm run check:package` renders the component with `react-dom/server` |
| [SvelteKit](#sveltekit) | `@nuin/msa-canvas/svelte/AlignmentViewer.svelte` | `npm run check:package` renders the component with `svelte/server` |
| [Deno](#deno) | `jsr:@nuin/msa-canvas` | CI runs `deno publish --dry-run` |

## Vite

Vite needs no configuration. It bundles the module worker from the static `new Worker(new URL('./worker.js', import.meta.url))` call in the package.

```sh
npm create vite@latest my-alignment -- --template vanilla-ts
cd my-alignment
npm install @nuin/msa-canvas
```

```html
<!-- index.html -->
<div id="alignment"></div>
<script type="module" src="/src/main.ts"></script>
```

```ts
// src/main.ts
import { createViewer } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

const viewer = createViewer(document.querySelector<HTMLElement>('#alignment')!, { height: 600 });
viewer.on('error', error => console.error(error.message));
await viewer.load('>reference\nAC-GTTAC\n>sample\nACTGTTAC', { alphabet: 'dna' });
```

`load` accepts a string, a `File`, a `Blob` or an `ArrayBuffer`, and detects gzip from the first two bytes. `loadUrl(url)` fetches a file; the server must allow CORS.

## Plain HTML with a module script

A page with no build step imports `dist/index.js` from an ESM CDN. Pin the version in both URLs.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@nuin/msa-canvas@0.5.2/dist/style.css">
</head>
<body>
  <div id="alignment"></div>
  <script type="module">
    import { createViewer } from 'https://cdn.jsdelivr.net/npm/@nuin/msa-canvas@0.5.2/dist/index.js';

    const viewer = createViewer(document.querySelector('#alignment'), { worker: false });
    viewer.on('error', error => console.error(error.message));
    await viewer.load('>reference\nAC-GTTAC\n>sample\nACTGTTAC', { alphabet: 'dna' });
  </script>
</body>
</html>
```

Three facts apply to this setup:

- `worker: false` is required when the script comes from another origin. A browser refuses to start a worker from a cross-origin URL, so every load fails with a security error.
- With `worker: false`, parsing, statistics and motif search run on the main thread. A worker search is terminated after 2.5 seconds. A slow regular expression on the main thread cannot be stopped. Use this mode for small alignments.
- For large alignments, copy the whole `dist/` directory to your own server and import `./dist/index.js` from there. The worker then loads from the same origin, and `worker: false` is not needed. Keep `worker.js` beside its sibling chunk files.

The page must be served over HTTP. A browser blocks module imports on a `file:` URL. A site with a Content Security Policy must allow the CDN in `script-src` and `style-src`, and fonts in `font-src`. This recipe is the only one on this page without an automated check in the repository.

## Next client component

Put the viewer in a file that starts with `'use client'`. The React entry keeps its own `'use client'` directive, and importing it on the server does not touch the DOM.

```tsx
// app/alignment-view.tsx
'use client';
import { useMemo } from 'react';
import { AlignmentViewer } from '@nuin/msa-canvas/react';
import { parseAlignment } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

export function AlignmentView({ text }: { text: string }) {
  const alignment = useMemo(() => parseAlignment(text), [text]);
  const options = useMemo(() => ({ height: 600 }), []);
  return <AlignmentViewer alignment={alignment} options={options} onError={console.error} />;
}
```

```tsx
// app/page.tsx (a server component)
import { AlignmentView } from './alignment-view';

export default function Page() {
  return <AlignmentView text={'>reference\nAC-GTTAC\n>sample\nACTGTTAC'} />;
}
```

Keep `alignment` and `options` stable with `useMemo`. The component compares both by identity, and a new `options` object on every render calls `setOptions` on every render.

The server renders an empty `<div>`. The viewer mounts in an effect in the browser. Vite is the only bundler whose worker handling CI verifies. When the worker fails to start under another bundler, the load rejects and the viewer emits an `error` event. Two fixes exist: copy the `dist/` directory of the package into `public/` and pass `options={{ workerUrl: '/dist/worker.js' }}`, or pass `options={{ worker: false }}` for small alignments. `worker` and `workerUrl` are read once at mount.

## SvelteKit

Import the Svelte 5 component in a page. It renders an empty `<div>` on the server and creates the viewer when its action mounts in the browser.

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import AlignmentViewer from '@nuin/msa-canvas/svelte/AlignmentViewer.svelte';
  import { parseAlignment, type Selection } from '@nuin/msa-canvas';
  import '@nuin/msa-canvas/style.css';

  const alignment = parseAlignment('>reference\nAC-GTTAC\n>sample\nACTGTTAC', { alphabet: 'dna' });
  const options = { height: 600 };
  let selection = $state<Selection | null>(null);
</script>

<AlignmentViewer {alignment} {options} onSelectionChange={(value) => selection = value} onError={console.error} />
<p>{selection ? `${selection.start} to ${selection.end}` : 'No selection'}</p>
```

SvelteKit builds with Vite, so the worker needs no configuration. The package ships the component as Svelte source, and `@sveltejs/vite-plugin-svelte` compiles it. The action form is `use:alignmentViewer={{ alignment, options }}` from `@nuin/msa-canvas/svelte`. See [React, Svelte, workers and Deno](frameworks.md#svelte-action).

## Deno

JSR publishes the core TypeScript source. Parsing, statistics, consensus and text exports run in Deno without a DOM.

```sh
deno add jsr:@nuin/msa-canvas
```

```ts
import { parseAlignment, calculateStats, consensusSequence, exportFasta } from '@nuin/msa-canvas';

const alignment = parseAlignment(await Deno.readTextFile('family.sto'));
const stats = calculateStats(alignment);
console.log(consensusSequence(stats, alignment.alphabet));
console.log(exportFasta(alignment, {}, { gaps: 'remove' }));
```

The JSR package has no CSS and no React, Svelte or PAVI entry. The viewer itself needs a browser. For those parts, use the npm package through an `npm:` specifier, for example `npm:@nuin/msa-canvas/react`.

## Next steps

- [API, events and controls](api.md) lists every viewer method, event and option.
- [Standalone functions and types](functions.md) lists every export that works without a viewer.
- [Configuration, colors and themes](configuration.md) covers the `visibility` switches and JSON configuration.
- [React, Svelte, workers and Deno](frameworks.md) covers callbacks, worker bundling, CSP and SSR.
