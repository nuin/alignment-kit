# Alignment Kit

An embeddable multiple sequence alignment viewer for JavaScript, React and Svelte. It combines a virtualized residue matrix with a pinned reference, annotation tracks and exact column statistics. PAVI's Nightingale residue palettes are included with attribution.

This is a local development package, not an npm release. Browser validation is not yet complete in this restricted environment; see [validation and performance](docs/performance.md).

## Try it

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:4173**. The default dataset is the real Pfam CBS seed (838 sequences × 160 columns). The dataset buttons also provide clearly labeled synthetic stress fixtures and a synthetic annotated example. React and Svelte examples are linked in the header.

The **Real alignments** buttons load complete downloaded alignments locally, with no external API request during exploration:

| Alignment | Source | Sequences | Columns |
|---|---|---:|---:|
| CBS domain seed | [Pfam PF00571.34](https://www.ebi.ac.uk/interpro/entry/pfam/PF00571/) | 838 | 160 |
| Protein kinase seed | [Pfam PF00069.32](https://www.ebi.ac.uk/interpro/entry/pfam/PF00069/) | 37 | 419 |
| Globin full family | [Pfam PF00042.29](https://www.ebi.ac.uk/interpro/entry/pfam/PF00042/) | 20,705 | 672 |
| Transfer RNA seed | [Rfam RF00005](https://rfam.org/family/RF00005) | 954 | 118 |

These snapshots preserve all downloaded rows and columns, including gaps and Stockholm metadata. They are domain/family alignments, not necessarily full-length proteins. The tRNA secondary-structure metadata is retained but not rendered as a structure. Source URLs, retrieval dates, dimensions and SHA-256 hashes of decompressed Stockholm bytes are in `demo/public/alignments.json`. The demo provides source and alignment-download links. The full globin file is bundled as approximately 2.9 MB gzip. Run `npm run check:datasets` to verify all snapshots against their hashes, dimensions and the library parser.

If local servers are unavailable, `npm run preview:files` generates self-contained HTML files in `.preview/`. Open `.preview/index.html`, `.preview/react.html` or `.preview/svelte.html` in a browser. These include the alignment, styles, fonts and a blob worker, and require no network. The normal package uses an external module worker.

## Package locally

```sh
npm run build
npm pack
# In a consuming application:
npm install /path/to/alignment-kit-viewer-0.1.0.tgz
```

The core has no framework runtime dependency. React and Svelte are optional peers, imported only through their respective entry points. Build output includes module code, type declarations, a worker, CSS, fonts and the Svelte component source. No package has been published.

## JavaScript

```ts
import { createViewer, parseAlignment } from '@alignment-kit/viewer';
import '@alignment-kit/viewer/style.css';

const viewer = createViewer(document.querySelector('#alignment'), {
  height: 740,
  colorScheme: 'soft',
  showInspector: true,
});

await viewer.load('>reference\nAC-G\n>sample\nACTG', { alphabet: 'dna' });
const off = viewer.on('selection', selection => console.log(selection));

// Other input forms:
await viewer.load(file);            // File, Blob or ArrayBuffer; gzip detected by bytes
await viewer.loadUrl(alignmentUrl); // Server must allow CORS
await viewer.setAlignment(parseAlignment(alignedText, { alphabet: 'protein' }));

// On disposal:
off();
viewer.destroy();
```

`parseAlignment` accepts aligned FASTA, Stockholm and CLUSTAL. `createAlignment` accepts `{ id?, name, sequence, species?, metadata? }[]`. All sequences must have equal aligned lengths. FASTA records with duplicate display names are retained; supplied IDs must be unique. Interleaved blocks must be separated by blank lines, contain the same row names and have equal chunk widths within each block. Stockholm GF/GS/GC/GR annotations are retained and coordinate lengths validated.

A3M insertion notation is unsupported. Known `.a3m` files/URLs are rejected. Anonymous strings cannot reliably distinguish lowercase A3M insertions from lowercase aligned FASTA: callers must provide rectangular aligned input. Case is preserved in source rows and normalized for comparisons. `.` and `-` are gaps.

## React

```tsx
import { useMemo, useState } from 'react';
import { AlignmentViewer } from '@alignment-kit/viewer/react';
import type { Alignment, Selection } from '@alignment-kit/viewer';
import '@alignment-kit/viewer/style.css';

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
  import AlignmentViewer from '@alignment-kit/viewer/svelte/AlignmentViewer.svelte';
  import type { Alignment, Selection } from '@alignment-kit/viewer';
  import '@alignment-kit/viewer/style.css';

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
  import { alignmentViewer } from '@alignment-kit/viewer/svelte';
  import '@alignment-kit/viewer/style.css';
  let { alignment } = $props();
</script>

<div use:alignmentViewer={{
  alignment,
  options: { height: 650 },
  onSelectionChange: (selection) => console.log(selection)
}}></div>
```

Both framework integrations accept `alignment`, `options`, `onReady`, `onSelectionChange`, `onViewportChange`, `onAnnotationClick` and `onError`. `onReady` receives the imperative viewer immediately after mounting; subscribe to its `ready` event when you need completed data/statistics. Replace alignment/options objects rather than mutating them in place. Clearing `alignment` to `undefined` clears the viewer. Callbacks are updated without recreating the engine. Worker configuration is fixed at mount; visual options are reactive.

## PAVI adapter and annotations

```ts
import { fromPavi } from '@alignment-kit/viewer/pavi';

const alignment = fromPavi(clustalText, seqInfoDict, variantEvidence);
await viewer.setAlignment(alignment);
viewer.on('annotation', feature => {
  // Original variant metadata is available as feature.metadata.
});
```

`variantEvidence` is an optional map from variant ID to `{ hasDisease?, hasPhenotype? }`. The adapter uses PAVI's supplied alignment coordinates, preserves original sequence/genomic positions and HGVS in metadata, and keeps non-coding/unmapped variants inspectable without inventing protein positions. It does not call Alliance APIs or import PAVI/Next.js server code.

For independent annotations:

```ts
import { createAlignment } from '@alignment-kit/viewer';
const alignment = createAlignment([
  { id: 'human', name: 'Protein isoform', sequence: 'AC-G', species: 'Homo sapiens' },
  { id: 'mouse', name: 'Mouse ortholog', sequence: 'ACTG', species: 'Mus musculus' },
], {
  alphabet: 'protein',
  annotations: [{
    id: 'feature-1', rowId: 'human', label: 'Example feature',
    start: 2, end: 2, mapping: 'mapped', kind: 'substitution',
    consequence: ['missense_variant'], metadata: { source: 'Your annotation source' },
  }],
});
```

Omit `rowId` for a global interval. Supply domains/exon boundaries as annotation kinds. Original data are treated as immutable after loading; replace the alignment when updating annotations. Features remain attached to stable row IDs when sorting, pinning and filtering. Missing disease/phenotype evidence is **unknown**, not false.

## Coordinates and statistics

Public positions are **1-based, inclusive alignment columns**. Sequence coordinates require a row identity and count only non-gap symbols. Use `alignmentToSequence(alignment, rowIndex, column)` and `sequenceToAlignment(alignment, rowIndex, position)`; a gap maps to `null`.

Statistics default to all loaded rows. Scrolling, pinning a reference and visually filtering rows do not change that scope. Select **Filtered sequences** explicitly to recompute for a subset. Each row receives one vote; no deduplication, phylogenetic weighting or sampling is implicit.

| Quantity | Definition |
|---|---|
| Gap fraction | Gap count / rows in statistics scope |
| Modal frequency | Largest non-gap symbol count / non-gap rows |
| Consensus support | Largest non-gap symbol count / all scoped rows |
| Consensus | Unique most frequent non-gap symbol; ties are explicit |
| Frequency logo | Literal symbol frequencies among non-gap rows; not information content |
| Pairwise identity | Exact matches / columns with canonical residues in both rows |

Ambiguity symbols are counted separately and never fractionally distributed. All-gap modal frequency/consensus and identity with zero comparable positions are unavailable. Pairwise identity excludes gaps, ambiguity and stops; it includes matched and compared-position counts. Its matrix is calculated only for selected rows, capped at 200, in a cancellable worker. Selecting **Identity to reference** computes and sorts reference identities; selecting a row then shows its identity and compared-position count.

## API and controls

| Method | Purpose |
|---|---|
| `load(input, parseOptions?)` | Parse text, a file or bytes; await exact statistics |
| `loadUrl(url, parseOptions?)` | Fetch and load with cancellation/CORS diagnostics |
| `setAlignment(alignment)` | Replace data; await exact statistics |
| `clear()` / `destroy()` | Clear data / permanently dispose resources |
| `setOptions(options)` | Update visual/analysis options |
| `setReference(rowId)` | Pin a stable row as reference |
| `setFilter(query)` | Filter names and species |
| `setSort('input' \| 'name' \| 'identity')` | Stable ordering; identity calculation is asynchronous |
| `setSelection({ start, end, rowId? } \| null)` | Select and reveal an inclusive range |
| `findMotif(text)` | Find the next literal ungapped motif within filtered rows |
| `setAnnotationFilter(filter)` | Replace type/consequence/evidence/row-visibility filters |
| `getState()` / `setState(state)` | Serialize/restore view state for the same dataset |
| `getAlignment()` / `getStatistics()` | Read model / current exact statistics (may be pending) |
| `getSelectedRowIds()` | Read checked sequence IDs |
| `on(event, callback)` | Subscribe; returns an unsubscribe function |

Events: `ready`, `selection`, `viewport`, `annotation`, `state`, `error`. The `viewport` event reports alignment columns and visible row offsets. `state` represents user selection/filter/reference/order changes; call `getState()` when persisting the latest scroll/zoom state.

Options: `height`, `theme`, `colorScheme`, `colorMode`, `cellWidth` (3–32), `rowHeight` (18–48, default 36), `labelWidth` (100–420), `showLogo`, `showInspector`, `showToolbar`, `statisticsScope`, `workerUrl`, `worker`. Compare coloring supports matches/differences against reference or consensus. Both light and dark surfaces are provided; biological palettes keep their meaning. Rows below 32px hide the secondary species line to avoid overlap.

Keyboard: arrows inspect adjacent residues/rows, Shift+arrows extends a range, Home/End jumps, +/− zooms, Escape clears selection. Shift-click selects a range. The overview and label-width separator have keyboard controls. Canvas is accompanied by labeled controls, visible focus, live selection announcements and textual position inspection; a full screen-reader grid audit is still outstanding.

## Colors and themes

Protein alignments default to **Residue classes** (`soft`); DNA/RNA default to **Nucleotide · muted** (`soft-nucleotide`), with A green, C gold, G rose and T/U blue. Ambiguity symbols have a neutral background. The original vivid mapping remains **Nucleotide · classic** (`nucleotide`). The Color menu lists schemes compatible with the loaded alphabet; changing Type or loading a different alphabet replaces an incompatible scheme with its default. Type changes interpretation, not the underlying sequence letters—it does not translate proteins or convert T to U.

All dropdowns use viewer-themed menus with keyboard navigation (arrows, Home/End, typeahead, Enter, Escape), following the viewer theme rather than the OS theme. Nightingale fixed palettes include Clustal/Clustal2, Taylor, Zappo, Lesk, Cinema, MAE, nucleotide, hydrophobicity, buried index, helix/strand/turn propensity and property highlights. Clustal2 here is a fixed residue mapping, not column-dependent ClustalX. The consensus-support scheme is calculated from the explicitly selected statistics scope.

`registerColorScheme({ id, label, description, colors, alphabets? })` adds a palette before constructing a viewer. Colors must be hex values. An optional `alphabets` array restricts a custom scheme to `protein`, `dna` and/or `rna`; omitting it allows every alphabet. `colorSchemes(alphabet?)` lists available schemes. Existing schemes and the Colors tab provide legends. See [third-party notices](THIRD_PARTY_NOTICES.md).

Override scoped CSS properties (`--ak-bg`, `--ak-panel`, `--ak-ink`, `--ak-muted`, `--ak-line`, `--ak-accent`, `--ak-hover`, `--ak-font`) on `.ak-viewer`. IBM Plex Sans is bundled under the OFL; residue text currently uses the platform monospace fallback. Fonts and page styling do not alter input data.

## Export

The toolbar exports all rows as FASTA, or a selected region as FASTA/SVG/PNG. Checked rows define exported rows; otherwise the pinned reference and currently visible rows are used. Selected columns define the range; otherwise the visible range is used. Figure exports preserve active annotation filters, palette and reference/consensus emphasis. Figures include coordinate scope, legend and source metadata when supplied.

The standalone `exportFasta`, `exportStatistics`, `exportSvg` and `exportPng` functions are also exported. SVG/PNG figures are capped at **200,000 cells**; PNG additionally caps raster dimensions/area. Use a smaller region or SVG when raster dimensions are excessive. TSV exports define denominators in column headers. JSON view state contains navigation/filter/selection settings, not alignment data or hosted sharing URLs.

## Workers and bundlers

Parsing, column statistics, reference identity and bounded pairwise comparison use module workers. Cancellation terminates obsolete work on replacement or disposal. The normal Vite source and packed-package builds recognize the static worker constructor and bundle it. A bundler that does not process worker URLs must copy the complete `dist` directory and pass `workerUrl` pointing to `dist/worker.js`, retaining its sibling chunks.

Importing core/React/Svelte modules is SSR-safe. Creating the actual viewer requires a browser, Canvas 2D, ResizeObserver and module Worker support. Gzip uses DecompressionStream. An explicit `worker: false` fallback is available for small inputs and DOM lifecycle tests; it runs analysis on the main thread. External workers must be permitted by your application's CSP (`worker-src`); self-contained preview files use `blob:` workers. No alignment is uploaded by the library.

## Development and validation

```sh
npm test                # scientific, parser, lifecycle, SSR and worker protocol tests
npm run check           # TypeScript + Svelte diagnostics
npm run build           # distributable library
npm run build:demo      # standalone + React + Svelte demo builds
npm run check:package   # extract package archive, build consumers using local peers; SSR checks
npm run test:browser    # Chromium and WebKit interaction tests
npm run benchmark      # Node model/statistics/index baseline (not browser FPS)
npm run preview:files  # self-contained local HTML demos
```

Browser interaction tests and visual verification remain blocked by this session's sandbox restrictions. See [performance report](docs/performance.md) for measured results and the exact outstanding acceptance checks. Aligning sequences, gene retrieval, clinical interpretation, editing alignments, structure viewers and tree inference are outside this library's scope.
