# MSA Canvas

An embeddable multiple sequence alignment viewer for JavaScript, React and Svelte. It combines a virtualized residue matrix with a pinned reference, annotation tracks and exact column statistics. Nightingale residue palettes are included with attribution.

```sh
npm install @nuin/msa-canvas
```

Browser validation is not yet complete; see [validation and performance](docs/performance.md). Project page: <https://bioinformat.org/msa-canvas>.

Start with the [full user guide](docs/USER_GUIDE.md) for walkthroughs, palette meanings, statistical definitions, annotation workflows, exports, keyboard shortcuts and troubleshooting. The Explorer's **User guide** link opens a browsable version with palette previews at `/guide/index.html`. This README covers installation and developer integration.

## Screenshots

Actual browser captures from the bundled real alignments. Click an image to inspect it at full size.

**Protein exploration:** CBS domain seed, 838 sequences, with reference, tracks and position inspector.

![Protein alignment with column statistics and position inspector](https://bioinformat.org/images/msa-canvas/protein-explorer.png)

**DNA/RNA coloring:** shown with the 954-sequence tRNA seed, a nucleotide palette, frequency logo and color legend.

![RNA alignment with the blue-orange nucleotide palette and legend](https://bioinformat.org/images/msa-canvas/rna-colors.png)

**Minimal embedding:** the same alignment with toolbars, overview, inspector and selected tracks hidden.

![Minimal alignment viewer with only sequence labels and selected tracks](https://bioinformat.org/images/msa-canvas/minimal-embed.png)

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
npm install /path/to/nuin-msa-canvas-0.2.0.tgz
```

The core has no framework runtime dependency. React and Svelte are optional peers, imported only through their respective entry points. Build output includes module code, type declarations, a worker, CSS, fonts and the Svelte component source.

## JavaScript

```ts
import { createViewer, parseAlignment } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

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

Both framework integrations accept `alignment`, `options`, `onReady`, `onSelectionChange`, `onViewportChange`, `onAnnotationClick` and `onError`. `onReady` receives the imperative viewer immediately after mounting; subscribe to its `ready` event when you need completed data/statistics. Replace alignment/options objects rather than mutating them in place. Clearing `alignment` to `undefined` clears the viewer. Callbacks are updated without recreating the engine. Worker configuration is fixed at mount; visual options are reactive.

## Configure the interface

Every viewer region and functional control has a typed visibility switch. In the Explorer, open **Customize viewer** above the alignment to try them and use **Restore default view** to undo your presentation changes. That demo panel belongs to the host application, not the embedded library.

```ts
import { createViewer, defaultVisibility, type ViewerVisibility } from '@nuin/msa-canvas';

const visibility: ViewerVisibility = {
  open: false,
  overview: false,
  inspector: false,
  modalFrequency: false,
  gapFraction: false,
  rowSelection: false,
  rowPinning: false,
};
const viewer = createViewer(element, { alignment, visibility });

// Updates merge individual keys; omitted keys keep their current values.
viewer.setOptions({ visibility: { inspector: true, featuresTab: false } });
const current = viewer.getVisibility(); // a copy of all resolved flags
viewer.setOptions({ visibility: { ...defaultVisibility } }); // restore defaults
```

All flags default to `true`, except `logo`, which defaults to `false`. Parent regions gate their children; showing a child does not override a hidden parent. Empty toolbars and the inspector with no enabled tabs collapse automatically. Hiding the active inspector tab selects the next enabled tab. Hidden controls leave the tab order, and hiding an open menu closes it.

| Region | `visibility` keys |
|---|---|
| Main layout | `toolbar`, `tools`, `overview`, `overviewTitle`, `tracks`, `alignment`, `inspector`, `inspectorTabs`, `status` |
| Main toolbar | `open`, `search`, `colorScheme`, `zoom`, `fit`, `theme`, `inspectorToggle`, `fullscreen`, `export` |
| Secondary toolbar | `goTo`, `motif`, `order`, `colorMode`, `logoToggle`, `statisticsScope`, `alphabet` |
| Individual tracks | `ruler`, `modalFrequency`, `gapFraction`, `consensus`, `logo`, `reference` |
| Labels and row actions | `labels`, `rowNames`, `rowSpecies`, `rowSelection`, `rowPinning`, `labelResize` |
| Canvas layers | `residueLetters`, `annotationMarks`, `selectionOverlay` |
| Inspector tabs | `positionTab`, `featuresTab`, `compareTab`, `colorsTab` |
| Inspector controls | `pinReference`, `rowFeaturesToggle`, `featureType`, `featureConsequence`, `diseaseFilter`, `phenotypeFilter`, `featurePagination`, `calculateIdentity`, `clearRows` |
| Feedback | `statusSummary`, `statusDetails`, `messages`, `emptyState` |

`toolbar` controls the main toolbar; `tools` controls the secondary row. `alignment` controls the scrolling matrix. `logoToggle` hides only its checkbox, while `logo` controls the actual frequency track. `reference: false` (or `tracks: false`) returns the reference sequence to the scrolling rows under the current filter/order; it remains the comparison reference. No sequence is dropped from the alignment or statistics. `labels: false` reclaims the gutter width and keeps canvas hit testing aligned.

Visibility changes do not clear checked rows, selections, filters or analysis settings. Hidden annotation marks remain in the data. These switches control presentation, not permissions: file dropping, keyboard shortcuts and API operations still work. Data/figure exports retain their existing semantics; SVG/PNG use their own figure layout rather than reproducing hidden UI chrome. Exported view-state JSON includes visibility flags, and `setState()` accepts older states without them.

The existing `showToolbar`, `showInspector` and `showLogo` options remain supported. `showToolbar` sets both `toolbar` and `tools`; the other aliases set `inspector` and `logo`. If aliases and `visibility` are supplied in the same call, explicit visibility keys win. Desktop/narrow responsive rules and compact-row species hiding still apply.

The same options work in both integrations; replace the options object when changing visibility:

```tsx
// React
<AlignmentViewer alignment={alignment}
  options={{ visibility: { open: false, inspector: showInspector } }} />
```

```svelte
<!-- Svelte component; the action accepts the same options object. -->
<AlignmentViewer {alignment}
  options={{ visibility: { open: false, inspector: showInspector } }} />
```

## Configure from a JSON file

A developer can keep viewer settings in JSON, validate them with `parseViewerConfig`, and use the same configuration in JavaScript, React or Svelte. The package includes an [example configuration](config/viewer-config.example.json) and a [JSON Schema](config/viewer-config.schema.json) for editor validation and autocomplete. Copy both files together or adjust the example's `$schema` path to your copy of the schema.

```json
{
  "$schema": "./viewer-config.schema.json",
  "height": 700,
  "theme": "light",
  "colorScheme": "soft-nucleotide",
  "visibility": {
    "overview": false,
    "inspector": false,
    "rowSelection": false,
    "modalFrequency": false
  }
}
```

```ts
import { createViewer, parseViewerConfig } from '@nuin/msa-canvas';

const response = await fetch('/viewer-config.json');
if (!response.ok) throw new Error(`Configuration request failed: ${response.status}`);
const options = parseViewerConfig(await response.text());
const viewer = createViewer(element, options);
await viewer.setAlignment(alignment);

// To apply another configuration to the existing viewer:
viewer.setOptions(parseViewerConfig(await otherResponse.text()));
```

For React or Svelte, parse the JSON once and pass the returned `options` object to the component or action as shown above. When a configuration changes, replace the options object so the framework integration updates. JSON imports vary by bundler; alternatively fetch it as shown, with the hosting server's CORS policy permitting the request.

The parser checks known keys, types, ranges and visibility names, and reports invalid input instead of silently ignoring typos. It strips the optional `$schema` editor hint. It does not load alignment data or arbitrary code. Palette IDs are resolved by the viewer when options are applied; register custom palettes before applying a configuration that references them. `worker` and `workerUrl` take effect at creation/mount, not on later `setOptions()` calls. Relative worker URLs follow the browser's document URL; choose an appropriate URL and CSP for your host.

A JSON configuration controls presentation, not access rights. Hidden controls do not disable keyboard shortcuts, file dropping or the API. An exported view-state JSON is a separate format containing navigation and analysis state; restore it with `setState`, not `parseViewerConfig`.

## Annotations

Supply annotations when creating an alignment:

```ts
import { createAlignment } from '@nuin/msa-canvas';
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

### Import annotations from files

Parsers read GFF3, BED (BED3 to BED12), GenBank, EMBL and UniProt REST JSON. `importAnnotations` maps them onto an alignment.

```ts
import { importAnnotations, parseGff3 } from '@nuin/msa-canvas';
const { annotations, warnings } = importAnnotations(alignment, text, { format: 'auto', rowId: 'human', coordinates: 'sequence' });
viewer.addAnnotations(annotations);
// or in one step: viewer.importAnnotations(text, options)
const records = parseGff3(text); // { seqid, start, end, kind, label, metadata }[] in 1-based ungapped coordinates
```

- `seqid` is matched to a row by ID, then by display name, then by the first word of the name or any `|`-separated part of it (GenBank, EMBL and UniProt also try accession, version and entry name), then falls back to `rowId`.
- `coordinates: 'sequence'` (default) counts ungapped residues and converts them to alignment columns. `'alignment'` uses 1-based columns as given.
- Records with no matching row, or beyond the sequence, become `mapping: 'unmapped'` and add a warning.
- BED12 blocks become one `exon` annotation each. GenBank and EMBL `join()` locations become one annotation spanning the lowest to highest position, with `<`, `>` and `complement()` kept in `metadata`. Labels come from `/gene`, `/product`, `/note`, `/label`, then the feature key.
- `viewer.addAnnotations(list)`, `viewer.removeAnnotations(ids?)` (all when omitted) and `viewer.importAnnotations(text, options?)` rebuild the index and the Features tab. Warnings appear in the message area.
- With an alignment loaded, opening or dropping `.gff`, `.gff3`, `.bed`, `.gb`, `.gbk`, `.genbank` or `.embl` files (optionally `.gz`) imports annotations instead of replacing the alignment.

## Coordinates and statistics

Public positions are **1-based, inclusive alignment columns**. Sequence coordinates require a row identity and count only non-gap symbols. Use `alignmentToSequence(alignment, rowIndex, column)` and `sequenceToAlignment(alignment, rowIndex, position)`; a gap maps to `null`.

Statistics default to all loaded rows. Scrolling, pinning a reference and visually filtering rows do not change that scope. Select **Filtered sequences** explicitly to recompute for a subset. Each row receives one vote; no deduplication, phylogenetic weighting or sampling is implicit.

| Quantity | Definition |
|---|---|
| Gap fraction | Gap count / rows in statistics scope |
| Modal frequency | Largest non-gap symbol count / non-gap rows |
| Consensus support | Largest non-gap symbol count / all scoped rows |
| Consensus | Unique most frequent non-gap symbol; ties are explicit |
| Consensus sequence | Track, export, copy and `getConsensus()`: modal non-gap residue; ties as IUPAC codes (DNA/RNA) or `X`; `X`/`N` below `consensusThreshold` |
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
| `addAnnotations(list)` / `removeAnnotations(ids?)` | Add annotations / remove some by ID (all when omitted) |
| `importAnnotations(text, options?)` | Parse GFF3, BED, GenBank, EMBL or UniProt JSON, add the result, return `{ annotations, warnings }` |
| `setAnnotationFilter(filter)` | Replace type/consequence/evidence/row-visibility filters |
| `getState()` / `setState(state)` | Serialize/restore view state for the same dataset |
| `getAlignment()` / `getStatistics()` | Read model / current exact statistics (may be pending) |
| `getSelectedRowIds()` | Read checked sequence IDs |
| `copySelection()` / `getSelectionText()` | Copy the selection to the clipboard as gapped FASTA / return that text |
| `getViewLink()` / `applyViewLink(link)` | Encode the view as URL parameters / apply a link, skipping settings that do not fit |
| `getConsensus({ threshold? })` | Consensus sequence over all columns from the current statistics |
| `on(event, callback)` | Subscribe; returns an unsubscribe function |

Events: `ready`, `selection`, `viewport`, `annotation`, `state`, `error`. The `viewport` event reports alignment columns and visible row offsets. `state` represents user selection/filter/reference/order changes; call `getState()` when persisting the latest scroll/zoom state.

Options: `height`, `theme`, `colorScheme`, `colorMode`, `cellWidth` (3–32), `rowHeight` (18–48, default 36), `labelWidth` (100–420), `showLogo`, `showInspector`, `showToolbar`, `statisticsScope`, `consensusThreshold` (0–1, default 0), `fasta`, `workerUrl`, `worker`, `urlSync`. Compare coloring supports matches/differences against reference or consensus. Both light and dark surfaces are provided; biological palettes keep their meaning. Rows below 32px hide the secondary species line to avoid overlap.

Keyboard: arrows inspect adjacent residues/rows, Shift+arrows extends a range, Home/End jumps, +/− zooms, Escape clears selection, Ctrl/Cmd+C copies the selection as FASTA. Shift-click selects a range. The overview and label-width separator have keyboard controls. Canvas is accompanied by labeled controls, visible focus, live selection announcements and textual position inspection; a full screen-reader grid audit is still outstanding.

## Colors and themes

Protein alignments default to **Residue classes** (`soft`); DNA/RNA default to **Nucleotide · muted** (`soft-nucleotide`), with A green, C gold, G rose and T/U blue. Ambiguity symbols have a neutral background. The original vivid mapping remains **Nucleotide · classic** (`nucleotide`). The Color menu lists schemes compatible with the loaded alphabet; changing Type or loading a different alphabet replaces an incompatible scheme with its default. Type changes interpretation, not the underlying sequence letters—it does not translate proteins or convert T to U.

Additional DNA/RNA options are `nucleotide-blue-orange`, `nucleotide-contrast` (strong), `nucleotide-grayscale`, `nucleotide-gc` (GC vs AT/U), and `nucleotide-purine` (muted purines vs pyrimidines). Group schemes handle unambiguous group membership explicitly: GC colors S with G/C and W with A/T/U; purine coloring groups R with A/G and Y with C/T/U. Other mixed ambiguity codes stay neutral. These are qualitative encodings, not GC percentages or evidence of biological function. The user guide includes descriptions and base-by-base previews.

All dropdowns use viewer-themed menus with keyboard navigation (arrows, Home/End, typeahead, Enter, Escape), following the viewer theme rather than the OS theme. Nightingale fixed palettes include Clustal/Clustal2, Taylor, Zappo, Lesk, Cinema, MAE, nucleotide, hydrophobicity, buried index, helix/strand/turn propensity and property highlights. Clustal2 here is a fixed residue mapping, not column-dependent ClustalX. The consensus-support scheme is calculated from the explicitly selected statistics scope.

`registerColorScheme({ id, label, description, colors, alphabets? })` adds a palette before constructing a viewer. Colors must be hex values. An optional `alphabets` array restricts a custom scheme to `protein`, `dna` and/or `rna`; omitting it allows every alphabet. `colorSchemes(alphabet?)` lists available schemes. Existing schemes and the Colors tab provide legends. See [third-party notices](THIRD_PARTY_NOTICES.md).

Override scoped CSS properties (`--ak-bg`, `--ak-panel`, `--ak-ink`, `--ak-muted`, `--ak-line`, `--ak-accent`, `--ak-hover`, `--ak-font`) on `.ak-viewer`. IBM Plex Sans is bundled under the OFL; residue text currently uses the platform monospace fallback. Fonts and page styling do not alter input data.

## Export

The toolbar exports all rows as FASTA, a selected region as FASTA/SVG/PNG, or the consensus of the selected (or visible) columns as FASTA. Checked rows define exported rows; otherwise the pinned reference and currently visible rows are used. Selected columns define the range; otherwise the visible range is used. Figure exports preserve active annotation filters, palette and reference/consensus emphasis. Figures include coordinate scope, legend and source metadata when supplied.

**FASTA options…** in the Export menu opens a panel with gap removal, letter case (original, upper, lower), line width (80, 60, unwrapped) and header (name; name and species; ID and name). The same settings apply to FASTA exports, the consensus export and Ctrl/Cmd+C. Set them in code with `setOptions({ fasta: { gaps: 'remove', letterCase: 'upper', lineWidth: 0, header: 'id-name' } })`; updates merge with the current settings. `lineWidth` is 0 (unwrapped) or 10 to 1000.

The standalone `exportFasta(alignment, region?, fastaOptions?)`, `formatFastaRecord`, `exportStatistics`, `exportSvg` and `exportPng` functions are also exported. SVG/PNG figures are capped at **200,000 cells**; PNG additionally caps raster dimensions/area. Use a smaller region or SVG when raster dimensions are excessive. TSV exports define denominators in column headers. JSON view state contains navigation/filter/selection settings, not alignment data or hosted sharing URLs.

Ctrl/Cmd+C on the focused matrix copies gapped FASTA for the selected columns (or the visible columns). Rows are the checked rows in display order, with checked rows hidden by the filter appended; else the clicked row; else the export rows. Once statistics are ready, the copy starts with a `consensus` record for the same columns. Copy requires a secure context (HTTPS or localhost); otherwise the viewer reports an error.

Consensus sequence: the modal non-gap residue per column. With a `consensusThreshold` above 0, a column whose modal frequency (among non-gap rows) is below the threshold becomes `X` (protein) or `N` (DNA/RNA). Ties become the IUPAC code covering every tied base for DNA/RNA (A+G is `R`, A+R is `R`, U counts as T; a tie involving `*` becomes `N`) and `X` for protein. All-gap columns stay `-`, so the sequence keeps the alignment width. The consensus track draws these symbols as colored cells; `getConsensus({ threshold? })` returns the full-width sequence and `consensusSequence(stats, alphabet, threshold?, start?, end?)` is exported as a pure function.

## Shareable links

`getViewLink()` returns readable parameters such as `src=…&aln=…&sel=50-60&row=seq-3&ref=seq-1&scheme=soft&zoom=16&q=human&x=41`. `src` appears only when the alignment came from `loadUrl`; links to local files carry the view without the data. `src` is the full URL passed to `loadUrl`, query string included; with `urlSync` it lands in the address bar, so do not use it with signed or token-bearing URLs. Hash changes without link parameters, such as in-page anchors, are ignored. If `history.replaceState` is blocked (for example in a sandboxed iframe), sync stops and an `error` event reports it. Annotation filters and visibility are not part of links.

`applyViewLink(link)` restores a link leniently. Settings that do not fit the loaded alignment (unknown rows, out-of-range columns, a scheme for another alphabet) are skipped, returned by name and reported in the message area. Missing `sel`, `q`, `sort`, `mode`, `scope`, `x` and `y` reset to defaults; missing `ref`, `scheme` and `zoom` keep their current values. A different `aln` fingerprint adds a warning and still applies what fits. `setState()` remains strict.

With `urlSync: true` the viewer keeps `location.hash` in sync (via `history.replaceState`) and applies a hash link after the next load. The viewer never fetches `src` itself; the host decides what to load:

```ts
import { createViewer, decodeViewLink } from '@nuin/msa-canvas';
const viewer = createViewer(element, { urlSync: true });
const { source } = decodeViewLink(location.hash);
await viewer.loadUrl(source && isTrusted(source) ? source : defaultUrl);
```

`encodeViewLink(state, source?)` and `decodeViewLink(text)` are also exported as pure functions.

## Workers and bundlers

Parsing, column statistics, reference identity and bounded pairwise comparison use module workers. Cancellation terminates obsolete work on replacement or disposal. The normal Vite source and packed-package builds recognize the static worker constructor and bundle it. A bundler that does not process worker URLs must copy the complete `dist` directory and pass `workerUrl` pointing to `dist/worker.js`, retaining its sibling chunks.

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
npm run build:guide    # browsable user guide and palette previews
npm run screenshots    # capture docs images from a running local demo
npm run release:check  # package preparation checks; does not publish
```

Targeted Chromium interaction checks and actual UI screenshots are available. The full CLI browser suite, WebKit and comprehensive accessibility/performance acceptance remain outstanding. See [performance report](docs/performance.md) for measured results and the exact outstanding acceptance checks. Aligning sequences, gene retrieval, clinical interpretation, editing alignments, structure viewers and tree inference are outside this library's scope.

## License

MIT. See [LICENSE](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
