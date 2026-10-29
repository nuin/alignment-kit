# Export and shareable links

## Export

The toolbar exports all rows or a selected region as FASTA, CLUSTAL, Stockholm, PHYLIP (relaxed) or NEXUS, a selected region as SVG/PNG, or the consensus of the selected (or visible) columns as FASTA. Checked rows define exported rows; otherwise the pinned reference and currently visible rows are used. Selected columns define the range; otherwise the visible range is used. Figure exports preserve active annotation filters, palette and reference/consensus emphasis. Figures include coordinate scope, legend and source metadata when supplied.

**FASTA options…** in the Export menu opens a panel with gap removal, letter case (original, upper, lower), line width (80, 60, unwrapped), header (name; name and species; ID and name) and orientation (source or reverse complement, see [Reverse complement view](display.md#reverse-complement-view)). The same settings apply to FASTA exports, the consensus export and Ctrl/Cmd+C. The **Visible columns only** checkbox beside the Export menu covers all exports (`export.columns`, see [Hide columns](display.md#hide-columns)); **Visible columns · FASTA** in the Export menu writes all rows without hidden columns. Set them in code with `setOptions({ fasta: { gaps: 'remove', letterCase: 'upper', lineWidth: 0, header: 'id-name' } })`; updates merge with the current settings. `lineWidth` is 0 (unwrapped) or 10 to 1000.

The standalone `exportFasta(alignment, region?, fastaOptions?)`, `exportClustal(alignment, region?)` (60-column blocks, `*` under identical non-gap columns; CLUSTAL, Stockholm and NEXUS add `_2`, `_3` to repeated names so the file re-opens), `exportStockholm(alignment, region?)`, `exportPhylip(alignment, region?, { variant?: 'relaxed' | 'strict' })` (strict truncates names to 10 characters and adds numeric suffixes to keep them unique), `exportNexus(alignment, region?)` (DATA block, `gap=-`, `missing=?`, names quoted when needed), `formatFastaRecord`, `exportStatistics`, `exportSvg` and `exportPng` functions are also exported. SVG/PNG figures are capped at **200,000 cells**; PNG additionally caps raster dimensions/area. Use a smaller region or SVG when raster dimensions are excessive. TSV exports define denominators in column headers. JSON view state contains navigation/filter/selection settings, not alignment data or hosted sharing URLs.

Pasting text (Ctrl/Cmd+V) anywhere in the viewer, except into an input, textarea, select or editable element, loads it as an alignment in any supported format. Parse errors go to the `error` event and the status line. Names with whitespace become `_` in CLUSTAL, Stockholm and PHYLIP exports.

Ctrl/Cmd+C on the focused matrix copies gapped FASTA for the selected columns (or the visible columns). Rows are the checked rows in display order, with checked rows hidden by the filter appended; else the clicked row; else the export rows. Once statistics are ready, the copy starts with a `consensus` record for the same columns. Copy requires a secure context (HTTPS or localhost); otherwise the viewer reports an error.

## Shareable links

`getViewLink()` returns readable parameters such as `src=…&aln=…&sel=50-60&row=seq-3&ref=seq-1&scheme=soft&zoom=16&q=human&x=41`. `src` appears only when the alignment came from `loadUrl`; links to local files carry the view without the data. `src` is the full URL passed to `loadUrl`, query string included; with `urlSync` it lands in the address bar, so do not use it with signed or token-bearing URLs. Hash changes without link parameters, such as in-page anchors, are ignored. If `history.replaceState` is blocked (for example in a sandboxed iframe), sync stops and an `error` event reports it. Annotation filters and visibility are not part of links.

The active motif search travels in `ViewState` as `find`, `findMode` (omitted for `auto`) and `strands` (omitted for `both`), and in links as `find=<pattern>`, `findmode=literal|iupac|regex|prosite` and `strands=forward`. `find` is capped at 500 characters; an empty or longer value, an unknown `findmode` or `strands`, or `findmode`/`strands` without `find` is ignored and listed. Applying a link or `setState()` reruns the search through the search worker and fills the Find box; a link without `find` clears the search. `applyViewLink` skips a `find` that does not compile for the alphabet and returns `find`; `setState()` throws `Invalid search in view state.` before changing anything.

`applyViewLink(link)` restores a link leniently. Settings that do not fit the loaded alignment (unknown rows, out-of-range columns, a scheme for another alphabet) are skipped, returned by name and reported in the message area. Missing `find`, `sel`, `q`, `sort`, `mode`, `dots`, `scope`, `ruler`, `hide`, `marks`, `rc`, `strand`, `x` and `y` reset to defaults; missing `ref`, `scheme` and `zoom` keep their current values. A different `aln` fingerprint adds a warning and still applies what fits. `setState()` remains strict.

With `urlSync: true` the viewer keeps `location.hash` in sync (via `history.replaceState`) and applies a hash link after the next load. The viewer never fetches `src` itself; the host decides what to load:

```ts
import { createViewer, decodeViewLink } from '@nuin/msa-canvas';
const viewer = createViewer(element, { urlSync: true });
const { source } = decodeViewLink(location.hash);
await viewer.loadUrl(source && isTrusted(source) ? source : defaultUrl);
```

`encodeViewLink(state, source?)` and `decodeViewLink(text)` are also exported as pure functions.
