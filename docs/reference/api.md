# API, events and controls

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
| `setSort(sort, column?)` | Stable ordering by `'input'`, `'name'`, `'identity'`, `'gaps'` (fewest gaps first), `'length'` (longest ungapped first), `'residue'` (residue at `column`, default the selected column, gaps last; rejects without a valid column), `'annotations'` (most annotated first), `'manual'` or `'tree'`; identity calculation is asynchronous; `tree` needs `setTree` first. `gaps` and `length` give the same order |
| `setRowOrderFromNames(names)` | Put the rows named in `names` (row name, then ID) first in that order, keep the rest in their current order, switch to manual order; returns names that matched no row |
| `hideRows(ids)` / `showRows(ids?)` | Hide rows from the grid / restore some or all hidden rows |
| `hideColumns(start, end)` / `showColumns(start?, end?)` | Hide columns by one-based range / show a range, or everything when called with no arguments (see [Hide columns](display.md#hide-columns)) |
| `markColumns(ranges, color?)` / `unmarkColumns(ranges?)` / `getColumnMarks()` | Mark columns, remove marks (all when called with no argument), read the marks (see [Mark columns](display.md#mark-columns)) |
| `getColumnMask()` | `Uint8Array` with 1 for each visible column and 0 for each hidden one |
| `moveRow(id, index)` / `getRowOrder()` | Move a row to a zero-based position and switch to manual order / read all row IDs in the current order |
| `removeRows(ids)` | Delete rows from a copy of the alignment and recompute statistics |
| `setGroups(map \| null)` / `toggleGroup(name, collapsed?)` | Group rows by an ID-to-name map / collapse or expand a group |
| `setTree(newick \| null)` | Show a Newick tree and order rows by it / remove it |
| `setSelection({ start, end, rowId? } \| null)` | Select and reveal an inclusive range |
| `search(pattern, { mode?, strands? })` | Search filtered rows for an IUPAC, regex or PROSITE motif in the search worker; highlight hits; resolve `{ hits, truncated }`. Rejects on an invalid pattern, with `AbortError` when replaced and with `TimeoutError` when stopped |
| `getSearchHits()` / `clearSearch()` | Read the current hits / remove the search and its highlights |
| `findMotif(text, direction?)` | Search if `text` is new, then select the next (`1`, default) or previous (`-1`) hit, wrapping around; resolves a boolean, `true` when it started a new search, and reports errors through the status line and `error`. Auto mode applies, so in IUPAC text `N` (DNA/RNA) and `X` (protein) match any residue |
| `addAnnotations(list)` / `removeAnnotations(ids?)` | Add annotations / remove some by ID (all when omitted) |
| `exportAnnotationsGff3`, `exportAnnotationsTsv`, `exportAnnotationsJson` | Functions of `(alignment, options?)`; see [Export annotations](annotations.md#export-annotations) |
| `importAnnotations(text, options?)` | Parse GFF3, BED, GenBank, EMBL or UniProt JSON, add the result, return `{ annotations, warnings }` |
| `addVariants(variants, options?)` | Map variant records (row, position or protein HGVS) onto rows and add them as annotations; returns `{ annotations, warnings }`. See [Variants](annotations.md#variants) |
| `nextVariant(direction?)` | Select the next (`1`, default) or previous (`-1`) shown variant by start column then display row, wrapping; returns the annotation or `null` |
| `setAnnotationFilter(filter)` | Replace type/consequence/evidence/row-visibility filters |
| `getState()` / `setState(state)` | Serialize/restore view state for the same dataset |
| `getAlignment()` / `getStatistics()` | Read model / current exact statistics (may be pending) |
| `getDetectedAlphabet()` | Alphabet suggested by the residues (`protein`, `dna` or `rna`), whatever alphabet the alignment is shown as. Throws before a load. `detectAlphabet(alignment)` is exported for use without a viewer |
| `getSelectedRowIds()` | Read checked sequence IDs |
| `copySelection()` / `getSelectionText()` | Copy the selection to the clipboard as gapped FASTA / return that text |
| `getViewLink()` / `applyViewLink(link)` | Encode the view as URL parameters / apply a link, skipping settings that do not fit |
| `goToResidue(rowId, position)` | Select residue `position` of the row with that ID (numbered as in the ruler); returns `false` and shows a message if the row or residue does not exist |
| `addTrack(track)` / `removeTrack(id)` / `getTracks()` | Register, remove and list custom tracks (see [Tracks](display.md#tracks)) |
| `getWarnings()` | Copies of the parser warnings of the loaded alignment (see [Parser warnings](formats.md#parser-warnings)) |
| `getResidue(rowId, column)` | Upper-case residue at a one-based column; `null` for a gap, an unknown row or a column outside the alignment |
| `getColumn(column)` | `{ rowId, residue }[]` for every row in input order (`-` for gaps); `[]` outside the alignment |
| `getSelectionSequences({ gaps? })` | `{ id, name, sequence }[]` for the checked rows (display order), else the selected row, cut to the selected columns; `gaps: 'remove'` drops gap characters; `[]` with no selection |
| `getVisibleRows()` | Row IDs shown in the grid in display order: the pinned reference first, then rows that are not hidden, filtered out or collapsed |
| `getVisibleColumns()` | `{ start, end }`, the one-based original columns at the viewport edges |
| `scrollToRow(rowId)` / `scrollToColumn(column)` | Scroll the row to the top or the column to the left edge without changing the selection; `false` for unknown, hidden, filtered, collapsed or out-of-range targets |
| `getSummary(options?)` / `getVariableColumns(options?)` | Column-class counts, identity and GC / variable columns versus the reference. See [Column summary](statistics.md#column-summary) |
| `getConsensus({ threshold? })` | Consensus sequence over all columns from the current statistics |
| `on(event, callback)` | Subscribe; returns an unsubscribe function |

Events: `ready`, `warnings` (the parser warnings of each loaded alignment, an empty array when there are none), `selection`, `search` (`{ hits, truncated }` when a scan finishes, or `null` after `clearSearch()`, a new alignment or a stopped scan), `viewport`, `annotation`, `hover` (`{ rowId, column, residue, position }`, or `null` when the pointer leaves a cell), `cellclick` (the same plus `shiftKey`), `state`, `error`. The `viewport` event reports alignment columns and visible row offsets. `state` represents user selection/filter/reference/order changes; call `getState()` when persisting the latest scroll/zoom state.

Options: `reverseComplement` (default `false`, see [Reverse complement view](display.md#reverse-complement-view)), `height`, `theme`, `colorScheme`, `colorMode`, `matchDisplay` (`letter` or `dot`, default `letter`), `cellWidth` (3–32), `rowHeight` (18–48, default 36), `labelWidth` (100–420), `showLogo`, `showInspector`, `showToolbar`, `statisticsScope`, `consensusThreshold` (0–1, default 0), `colorThreshold` (0–1, default 0), `minIdentity` (0–100, default 0), `minCoverage` (0–100, default 0), `logoMode`, `conservationWindow`, `tracks`, `groupBy`, `treeWidth` (0–400, default 120), `hideGapColumns` (0–1 or `null`, default `null`), `hideAllGapColumns` (default `false`), `rulerCoordinates` (`'alignment'` or `'reference'`, default `'alignment'`), `fasta`, `export` (`{ columns: 'all' | 'visible' }`), `workerUrl`, `worker`, `urlSync`, `focusFirstVariant` (default `false`: select and reveal the first variant when new data loads), `textView` (default `false`, see [Text view](display.md#text-view)). Compare coloring supports matches/differences against reference or consensus. Both light and dark surfaces are provided; biological palettes keep their meaning. Rows below 32px hide the secondary species line to avoid overlap.

Mouse: press and drag the residue grid to pan horizontally and vertically (mouse, pen or touch). A press that moves under 4 px is a click and selects; a drag never changes the selection. Clicking a residue selects its column and row; clicking the same cell again, without Shift, while it is the whole selection clears the selection. The same applies to a track column. Panning stops on release. Labels, tracks, the tree and row drag handles do not start a pan. Set `dragToPan: false` to turn it off. No hover card shows while panning.

Keyboard: arrows inspect adjacent residues/rows, Shift+arrows extends a range, Home/End jumps, +/− zooms, Escape clears selection, `]` and `[` select the next and previous variant, F toggles full screen (outside text fields), Ctrl/Cmd+C copies the selection as FASTA. Shift-click selects a range. The overview and label-width separator have keyboard controls. Canvas is accompanied by labeled controls, visible focus, live selection announcements and textual position inspection; a full screen-reader grid audit is still outstanding.

Alphabet guard: the viewer detects the alphabet from the residues on load (`getDetectedAlphabet()`). Nucleotide means at least 90% of non-gap residues are A, C, G, T, U or N. When the **Type** select is changed across the protein/nucleotide line from the detected alphabet, the message area asks first, for example `This alignment looks like protein (83.3% of residues are not A, C, G, T/U, N). Treat it as DNA?`, with **Switch** and **Cancel** buttons. Switch reloads the alignment with the new alphabet; Cancel restores the select. DNA to RNA and back switch without asking. The prompt shows even when `visibility.messages` is off. Programmatic alphabets (`load`, `parseAlignment` or `createAlignment` with `alphabet`, then `setAlignment`) are not gated. The Color select lists only schemes for the current alphabet (`colorSchemes(alphabet)`), and a scheme that no longer fits falls back to `soft` (protein) or `soft-nucleotide` (DNA/RNA).

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
