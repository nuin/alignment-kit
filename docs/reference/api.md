# API, events and controls

`createViewer(element, options?)` returns an `AlignmentViewer`. This page lists its methods, events and options, then the mouse and keyboard controls. Functions that work without a viewer are in [Standalone functions and types](functions.md).

```ts
import { createViewer } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

const viewer = createViewer(document.querySelector('#alignment'), { height: 600 });
await viewer.load(text);
const off = viewer.on('selection', selection => console.log(selection));
off();
viewer.destroy();
```

Coordinates are one-based, inclusive alignment columns. Row arguments are row IDs. After `destroy()`, most methods throw `This viewer has been destroyed.`

## Viewer methods

The tables in this section hold `AlignmentViewer` members only. `viewer.element` is the host element passed to `createViewer`.

### Data and lifecycle

| Method | Purpose |
|---|---|
| `load(input, parseOptions?)` | Parse text, a `Blob` or an `ArrayBuffer`; resolves when exact statistics are ready |
| `loadUrl(url, parseOptions?)` | Fetch and load a URL. The error names CORS when the request fails |
| `setAlignment(alignment)` | Replace the data with an `Alignment`; resolves when exact statistics are ready |
| `clear()` | Remove the alignment and show the empty state |
| `destroy()` | Cancel every worker job, remove every listener and remove the viewer from the page. A second call does nothing |
| `getAlignment()` | The loaded `Alignment`, or `undefined` |
| `getStatistics()` | The current `AlignmentStats`, or `undefined` while they are pending |
| `getDetectedAlphabet()` | Alphabet suggested by the residues (`protein`, `dna` or `rna`), whatever alphabet the alignment is shown as. Throws before a load |
| `getWarnings()` | Copies of the parser warnings of the loaded alignment (see [Parser warnings](formats.md#parser-warnings)) |
| `on(event, callback)` | Subscribe to an event; returns an unsubscribe function. See [Events](#events) |

### Options and view state

| Method | Purpose |
|---|---|
| `setOptions(options)` | Update options. Omitted keys keep their value. See [Options](#options) |
| `getVisibility()` | A copy of all 81 resolved `visibility` flags (see [Configure the interface](configuration.md#configure-the-interface)) |
| `getState()` | The view as a serializable `ViewState` with `version: 1` |
| `setState(state)` | Restore a `ViewState` on the same dataset; returns a promise |
| `getViewLink()` | The view as URL parameters, with `src` when the alignment came from `loadUrl` |
| `applyViewLink(link)` | Apply a link string or a `ViewLink`; resolves the names of settings that did not fit and were skipped |

### Rows

| Method | Purpose |
|---|---|
| `setReference(rowId)` | Pin a row as the reference |
| `setFilter(query)` | Filter rows by name and species |
| `setSort(sort, column?)` | Order rows by `'input'`, `'name'`, `'identity'`, `'gaps'` (fewest gaps first), `'length'` (longest ungapped first), `'residue'` (residue at `column`, default the selected column, gaps last; rejects without a valid column), `'annotations'` (most annotated first), `'manual'` or `'tree'`. Returns a promise, because identity runs in a worker. `'tree'` needs `setTree` first. `gaps` and `length` give the same order |
| `setRowOrderFromNames(names)` | Put the rows named in `names` (row name, then ID) first in that order, keep the rest in their current order, switch to manual order; returns names that matched no row |
| `hideRows(ids)` | Hide rows from the grid, the filtered statistics scope and exports of visible rows |
| `showRows(ids?)` | Show the given hidden rows, or every hidden row when `ids` is omitted |
| `moveRow(id, index)` | Move a row to a zero-based position of `getRowOrder()` and switch to manual order |
| `getRowOrder()` | All row IDs in the current order, hidden and filtered rows included |
| `removeRows(ids)` | Delete rows from a copy of the alignment and recompute statistics. The alignment ID changes |
| `setGroups(map \| null)` | Group rows by an ID-to-name map; `null` falls back to the `groupBy` option |
| `toggleGroup(name, collapsed?)` | Collapse or expand a group; omit `collapsed` to toggle |
| `setTree(newick \| null)` | Show a Newick tree and order rows by it; `null` removes it |
| `openTreeView(column?)` | Open the tree full size with the residue at one alignment column beside each sequence. The column defaults to the selected one, and the Column box follows the selection. Throws without a tree. Loading or replacing the alignment (including row removal and an alphabet switch), `clear()`, `setTree(null)` and hiding the tree with `visibility` close it |
| `closeTreeView()` | Close the full-size tree view and return focus to the control that opened it |
| `buildTree()` | Build a neighbor-joining guide tree from p-distances over every row and show it with `setTree`. Runs in the worker, limited to 1,000 rows. Resolves with the Newick text |
| `getSelectedRowIds()` | IDs of the checked rows |
| `getVisibleRows()` | Row IDs shown in the grid in display order: the pinned reference first, then rows that are not hidden, filtered out or collapsed |
| `scrollToRow(rowId)` | Scroll the row to the top without changing the selection; `false` for an unknown, hidden, filtered or collapsed row |
| `setRowStrand(rowId, strand)` | Flag a row as reverse strand (`'-'`) or forward (`'+'`). A flagged row is drawn complemented in place. Throws for an unknown row ID; shows a message on protein (see [Reverse complement view](display.md#reverse-complement-view)) |
| `getRowStrand(rowId)` | `'-'` when the row is flagged as reverse strand, else `'+'` |

### Columns

| Method | Purpose |
|---|---|
| `hideColumns(start, end)` | Hide a column range without changing the alignment. Throws when the range is invalid or would leave no column (see [Hide columns](display.md#hide-columns)) |
| `showColumns(start?, end?)` | Show a range, or every hidden column when called with no arguments |
| `getColumnMask()` | `Uint8Array` with 1 for each visible column and 0 for each hidden one |
| `markColumns(ranges, color?)` | Mark columns with an outline box and a ruler marker (see [Mark columns](display.md#mark-columns)) |
| `unmarkColumns(ranges?)` | Remove marks from the ranges, or every mark with no argument |
| `getColumnMarks()` | The marks as sorted `{ start, end, color }` ranges |
| `getVisibleColumns()` | `{ start, end }`, the original columns at the viewport edges; `{ start: 0, end: 0 }` before a load |
| `scrollToColumn(column)` | Scroll the column to the left edge without changing the selection; `false` for a hidden or out-of-range column |
| `setReverseComplement(on)` | Show the alignment reverse-complemented. Columns run right to left and every residue is complemented. Shows a message on protein and changes nothing |
| `getReverseComplement()` | `true` while the reverse-complement view is active; always `false` for protein |

### Selection and data access

| Method | Purpose |
|---|---|
| `setSelection({ start, end, rowId? } \| null)` | Select and reveal an inclusive range; `null` clears the selection |
| `goToResidue(rowId, position)` | Select residue `position` of the row with that ID (numbered as in the ruler); returns `false` and shows a message if the row or residue does not exist |
| `getResidue(rowId, column)` | Upper-case residue at a column; `null` for a gap, an unknown row or a column outside the alignment |
| `getColumn(column)` | `{ rowId, residue }[]` for every row in input order (`-` for gaps); `[]` outside the alignment |
| `getSelectionSequences({ gaps? })` | `{ id, name, sequence }[]` for the checked rows (display order), else the selected row, cut to the selected columns; `gaps: 'remove'` drops gap characters; `[]` with no selection |
| `getSelectionText()` | Gapped FASTA for the rows and columns that Ctrl/Cmd+C copies |
| `copySelection()` | Write that text to the clipboard; returns a promise |
| `getConsensus({ threshold? })` | Consensus sequence over all columns from the current statistics |

### Search and statistics

| Method | Purpose |
|---|---|
| `search(pattern, { mode?, strands? })` | Search filtered rows for an IUPAC, regex or PROSITE motif in the search worker; highlight hits; resolve `{ hits, truncated }`. Rejects on an invalid pattern, with `AbortError` when replaced and with `TimeoutError` when stopped |
| `getSearchHits()` | A copy of the current hits |
| `clearSearch()` | Remove the search and its highlights |
| `findMotif(text, direction?)` | Search if `text` is new, then select the next (`1`, default) or previous (`-1`) hit, wrapping around; resolves `true` when it started a new search, and reports errors through the status line and `error`. Auto mode applies, so in IUPAC text `N` (DNA/RNA) and `X` (protein) match any residue |
| `getSummary(options?)` | Column-class counts, identity and GC as an `AlignmentSummary`. See [Column summary](statistics.md#column-summary) and the cache note below |
| `getVariableColumns(options?)` | Variable columns versus the reference as a `VariableColumnResult` |

Each distinct summary scope (rows, columns and reference) runs in its own worker and is cached. The cache holds 8 scopes. A ninth scope evicts the entry created first, and a pending promise of that entry rejects with an `AbortError`. A new alignment and `destroy()` cancel every pending summary.

### Annotations, variants and tracks

| Method | Purpose |
|---|---|
| `addAnnotations(list)` | Add annotations; throws for a duplicate ID |
| `updateAnnotations(list)` | Replace complete annotations by existing ID atomically, preserving selection, filters and unrelated annotations; rejects unknown/duplicate IDs and invalid coordinates |
| `removeAnnotations(ids?)` | Remove annotations by ID, or all when `ids` is omitted |
| `importAnnotations(text, options?)` | Parse GFF3, BED, GenBank, EMBL or UniProt JSON, add the result, return `{ annotations, warnings }` |
| `setAnnotationFilter(filter)` | Replace the type, consequence, evidence and row-visibility filters |
| `addVariants(variants, options?)` | Map variant records (row, position or protein HGVS) onto rows and add them as annotations; returns `{ annotations, warnings }`. See [Variants](annotations.md#variants) |
| `nextVariant(direction?)` | Select the next (`1`, default) or previous (`-1`) shown variant by start column then display row, wrapping; returns the annotation or `null` |
| `addTrack(track)` | Register a custom track below the built-in tracks (see [Tracks](display.md#tracks)) |
| `removeTrack(id)` | Remove a custom track |
| `getTracks()` | Copies of the registered tracks in drawing order |

## Standalone exports

These names are functions of the package, and the viewer has no method with these names, except `importAnnotations`. [Standalone functions and types](functions.md) lists every export with its arguments.

| Export | Use |
|---|---|
| `createViewer(element, options?)` | Create the viewer |
| `detectAlphabet(alignment)` | The check behind `getDetectedAlphabet()`, for use without a viewer |
| `exportAnnotationsGff3`, `exportAnnotationsTsv`, `exportAnnotationsJson` | Functions of `(alignment, options?)`; see [Export annotations](annotations.md#export-annotations) |
| `importAnnotations(alignment, text, options?)` | The standalone form returns the mapped annotations and adds nothing |
| `exportFasta`, `exportSvg`, `exportPng` and the other exporters | Functions of `(alignment, region?, ...)`; see [Export and shareable links](export.md) |
| `parseViewerConfig(input)` | Validate JSON options before `createViewer` or `setOptions` |

## Events

`viewer.on(event, callback)` subscribes and returns a function that unsubscribes.

| Event | Payload | Fires when |
|---|---|---|
| `ready` | `Alignment` | An alignment and its statistics finished loading |
| `warnings` | `ParseWarning[]` | Each alignment load; an empty array when the parser recorded none |
| `selection` | `Selection` or `null` | The selection changes |
| `search` | `SearchResult` or `null` | A scan finishes; `null` after `clearSearch()`, a new alignment or a stopped scan |
| `viewport` | `Viewport` | The visible columns or rows change. Reports alignment columns and visible row offsets |
| `annotation` | `Annotation` | The user clicks an annotation |
| `hover` | `CellInfo` or `null` | The mouse or pen moves to a cell; `null` when it leaves. Not sent for touch |
| `cellclick` | `CellClick` | Every click on a residue that is not a drag. `CellInfo` plus `shiftKey` |
| `state` | `ViewState` | The user changes selection, filter, reference or order. Call `getState()` to persist the latest scroll and zoom |
| `error` | `Error` | A load, an option or a worker job fails |

## Options

`createViewer(element, options)` and `setOptions(options)` take a `ViewerOptions` object. `setOptions` merges: an omitted key keeps its value. `setOptions` clamps a number outside its range to the nearest limit. `parseViewerConfig` throws for the same value.

| Option | Type | Range | Default | Notes |
|---|---|---|---|---|
| `alignment` | `Alignment` | | none | Loaded by the constructor. `setOptions` ignores it; call `setAlignment` |
| `height` | number | 360 to 2000 | `740` | Viewer height in pixels |
| `theme` | `'light'`, `'dark'` or `'auto'` | | `'light'` | Surface colors. `'auto'` follows `prefers-color-scheme`. Residue palettes keep their meaning in both |
| `colorScheme` | string | a registered scheme ID | `'soft'` | A scheme that does not fit the alphabet falls back to `soft` or `soft-nucleotide`. See [Colors and themes](configuration.md#colors-and-themes) |
| `colorMode` | `ColorMode` | 5 values | `'all'` | Color all residues, or only matches or differences against the reference or the consensus |
| `matchDisplay` | `'letter'` or `'dot'` | | `'letter'` | `'dot'` draws residues identical to the comparison residue as `.` |
| `cellWidth` | number | 3 to 32 | `16` | Column width in pixels; the zoom buttons change it |
| `rowHeight` | number | 18 to 48 | `36` | Rows below 32 pixels hide the species line |
| `labelWidth` | number | 100 to 420 | `230` | Width of the row label gutter in pixels |
| `showLogo` | boolean | | `false` | Alias of `visibility.logo` |
| `showInspector` | boolean | | `true` | Alias of `visibility.inspector` |
| `showToolbar` | boolean | | `true` | Alias that sets `visibility.toolbar` and `visibility.tools` |
| `visibility` | `ViewerVisibility` | 81 boolean keys | `defaultVisibility` | Keys merge one by one. See [Configure the interface](configuration.md#configure-the-interface) |
| `statisticsScope` | `'all'` or `'filtered'` | | `'all'` | Rows that the statistics cover |
| `rulerCoordinates` | `'alignment'` or `'reference'` | | `'alignment'` | Ruler numbering by column, or by residue of the pinned reference |
| `consensusThreshold` | number | 0 to 1 | `0` | Consensus columns with a lower modal frequency become X or N |
| `colorThreshold` | number | 0 to 1 | `0` | The `conservation` and `percent-identity` schemes leave lower columns uncolored |
| `minIdentity` | number | 0 to 100 | `0` | Show only rows with at least this percent identity to the reference |
| `minCoverage` | number | 0 to 100 | `0` | Show only rows with at least this percent of non-gap columns |
| `logoMode` | `'frequency'` or `'bits'` | | `'frequency'` | `'bits'` scales each logo stack by information content |
| `conservationWindow` | odd integer | 1 to 51 | `1` | Centered moving average for the entropy and quality bars |
| `groupBy` | string | | `''` (no groups) | A `row.metadata` key, or `'species'`. An empty string turns grouping off |
| `treeWidth` | number | 0 to 400 | `120` | Width of the tree column in pixels; 0 hides it |
| `hideGapColumns` | number or `null` | 0 to 1 | `null` | Hide columns whose gap fraction is at least this value. See [Hide columns](display.md#hide-columns) |
| `hideAllGapColumns` | boolean | | `false` | Hide columns that are gaps in every row |
| `reverseComplement` | boolean | | `false` | DNA and RNA only. See [Reverse complement view](display.md#reverse-complement-view) |
| `textView` | boolean | | `false` | Plain text blocks in place of the grid. See [Text view](display.md#text-view) |
| `focusFirstVariant` | boolean | | `false` | Select and reveal the first variant when new data loads |
| `dragToPan` | boolean | | `true` | Drag the residue grid to pan. See [Mouse](#mouse-and-keyboard) |
| `tooltips` | boolean | | `true` | Hover cards for residues and annotation marks. See [Tooltips](#tooltips) |
| `annotationLinks` | `Record<string, string>` | `http` or `https` templates with `{id}` | `{}` (no links) | URL templates keyed by `pubmed`, `evidence` or a source name. See [Tooltips](#tooltips) |
| `tracks` | `CustomTrack[]` | | `[]` | Replaces the custom track list. See [Tracks](display.md#tracks) |
| `fasta` | `FastaOptions` | | `{}` | Keys merge. Effective defaults: keep gaps, original case, 80 columns, name header, source orientation |
| `export` | `ExportOptions` | | `{}` | `columns` is `'all'` (the effective default) or `'visible'`, which leaves hidden columns out of every export and copy |
| `urlSync` | boolean | | `false` | Keep `location.hash` in sync with the view. Read once by the constructor |
| `worker` | boolean | | `true` | `false` runs analysis on the main thread. Read once by the constructor |
| `workerUrl` | `WorkerSource`: string, `URL` or `() => Worker` | | the bundled `worker.js` | Read once by the constructor. See [Workers and bundlers](frameworks.md#workers-and-bundlers) |

`showToolbar`, `showInspector` and `showLogo` are aliases from before the `visibility` option. They stay supported. An explicit `visibility` key in the same call wins over an alias.

## Mouse and keyboard

Mouse: press and drag the residue grid to pan horizontally and vertically (mouse, pen or touch). A press that moves under 4 px is a click and selects; a drag never changes the selection. Clicking a residue selects its column and row; clicking the same cell again, without Shift, while it is the whole selection clears the selection. The same applies to a track column. Panning stops on release. Labels, tracks, the tree and row drag handles do not start a pan. Set `dragToPan: false` to turn it off. No hover card shows while panning.

Keyboard: arrows inspect adjacent residues/rows, Shift+arrows extends a range, Home/End jumps, +/− zooms, Escape clears selection, `]` and `[` select the next and previous variant, F toggles full screen (outside text fields), Ctrl/Cmd+C copies the selection as FASTA. Shift-click selects a range. The overview and label-width separator have keyboard controls. The canvas grid exposes one active cell with its row name, alignment column, residue or gap, and sequence position. The inspector is keyboard-focusable; Text view exposes readable alignment blocks and removes the covered grid from accessibility navigation. See [accessibility validation](../performance.md) for automated coverage and native screen-reader limits.

## Alphabet guard

The viewer detects the alphabet from the residues on load (`getDetectedAlphabet()`). Nucleotide means at least 90% of non-gap residues are A, C, G, T, U or N. When the **Type** select is changed across the protein/nucleotide line from the detected alphabet, the message area asks first, for example `This alignment looks like protein (83.3% of residues are not A, C, G, T/U, N). Treat it as DNA?`, with **Switch** and **Cancel** buttons. Switch reloads the alignment with the new alphabet; Cancel restores the select. DNA to RNA and back switch without asking. The prompt shows even when `visibility.messages` is off. Programmatic alphabets (`load`, `parseAlignment` or `createAlignment` with `alphabet`, then `setAlignment`) are not gated. The Color select lists only schemes for the current alphabet (`colorSchemes(alphabet)`), and a scheme that no longer fits falls back to `soft` (protein) or `soft-nucleotide` (DNA/RNA).

## Tooltips

Hovering a residue for about 300 ms shows a card with the row name, residue, alignment column, residue number in the row (offset by `metadata.start`, "gap" in a gap) and, when `rulerCoordinates` is `reference`, the reference residue number. The card hides on leave, scroll, key press or while a drag-to-pan is active. Touch input has no hover cards.

Over an annotation mark the card also lists, for up to 3 annotations, the label, kind, consequence, disease and phenotype flags, and `metadata.evidence` (evidence codes), `metadata.source` and `metadata.pubmed` or `metadata.pmid` (PubMed IDs). Clicking a residue under an annotation pins the card (up to 10 annotations) until Escape or its close button. All text is inserted as text, never HTML.

- `tooltips` (default `true`) and `visibility.tooltip` turn the cards off. The `hover` and `cellclick` events still fire. `hover` skips touch; `cellclick` fires for every non-drag click on a residue.
- Icon-only buttons (row select, hide, pin as reference, strand, zoom, theme, full screen) carry a `data-hint` and show a short hint after 400 ms of hover or at once on keyboard focus. The hint is linked with `aria-describedby`; Escape hides it. `visibility.tooltip` turns hints off too.
- `annotationLinks` maps a key to a URL template with `{id}`: `pubmed` (or `pmid`) for PubMed IDs, `evidence` (or `eco`) for evidence codes, or a source name (matched case-insensitively, `{id}` is the annotation `id`). There are no default links, so the viewer makes no network request. Only `http` and `https` templates are accepted; anything else throws. Links open with `rel="noopener noreferrer"`.
- React and Svelte forward `onHover` and `onCellClick`.

```js
createViewer(el, { annotationLinks: { pubmed: 'https://pubmed.ncbi.nlm.nih.gov/{id}/' } });
viewer.on('hover', cell => cell && console.log(cell.rowId, cell.column, cell.residue, cell.position));
```
