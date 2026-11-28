# Changelog

Each release has a `v<version>` git tag. The entries for 0.1.0 to 0.5.0 were written from the commit subjects between those tags. Dates are the commit dates of the tagged commits.

## Upgrading

No release from 0.1.0 to 0.5.2 removed a value export of the main entry, a type export or a `ViewerOptions` key. A diff of `src/index.ts` at the seven tags shows this. Value exports grew from 25 to 72 and `ViewerOptions` keys from 16 to 37. Three older option names remain as aliases.

| Older name | Since | Replacement | Behavior today |
|---|---|---|---|
| `fasta.columns` (`FastaOptions.columns`) | deprecated in 0.3.0 | `export.columns` (`ExportOptions.columns`) | Setting it sets `export.columns`. An `export` key in the same call wins |
| `showToolbar` | 0.1.0 | `visibility.toolbar` and `visibility.tools` | Sets both flags. An explicit `visibility` key in the same call wins |
| `showInspector`, `showLogo` | 0.1.0 | `visibility.inspector`, `visibility.logo` | Set the matching flag. An explicit `visibility` key in the same call wins |

Saved view states stay readable. `getState()` writes `version: 1`. `setState()` rejects any other version and any state from a different alignment ID. Fields added after 0.1.0 are optional, so `setState()` accepts a state without them and applies these values:

| Missing field | Value applied |
|---|---|
| `matchDisplay` | `'letter'` |
| `rulerCoordinates` | `'alignment'` |
| `reverseComplement` | `false` |
| `consensusThreshold`, `colorThreshold`, `minIdentity`, `minCoverage` | `0` |
| `hiddenColumns`, `columnMarks`, `hiddenRowIds`, `reverseStrandRowIds`, `collapsedGroups` | empty |
| `visibility` | the current flags stay |

`removeRows()` gives the alignment a new ID, so a state saved before the removal no longer applies.

## Unreleased

### Added

- `buildTree()` and a **Tree** toolbar button build a neighbor-joining guide tree from p-distances over every row, in the worker, up to 1,000 rows. The tree goes through `setTree`, so rows sort by it.
- `neighborJoiningTree`, `neighborJoining`, `pDistances`, `MAX_NJ_ROWS` and the `NjTree` type.
- The **Tree** button is an on/off toggle next to **Text**. The first press builds the tree; later presses hide and show the tree column. The pinned reference draws its leaf in the reference row. **Tree view** sits next to it as an on/off button for the full-size tree.
- A full-size tree view: a **Tree view** button, `openTreeView(column?)` and `closeTreeView()`. It shows every leaf with the residue at a chosen alignment column, and a branch click selects the clade.

## 0.6.0 (2026-11-24)

### Changes that can affect existing code

- Alphabet detection uses one rule everywhere: nucleotide when at least 90% of non-gap residues are A, C, G, T, U or N. DNA with more than 10% IUPAC ambiguity codes is now detected as protein. Pass `alphabet` to `parseAlignment` to keep the old result.
- `VariantClass` gains `startstop` for `start_lost` and `stop_lost`. Code that switches over every class needs a new case.
- `viewport` fires only when the visible range or row count changes. `mountViewer` skips `setOptions` when the new options object equals the last one.
- `replace()` and `setAlignment()` emit `selection` when they clear a selection.
- `fromPavi` includes coding and noncoding variants, with genomic context and evidence fields. Callers that expected coding variants only get more annotations.
- The theme button is named Dark theme. Inspector tabs are a tablist and use `aria-selected`.
- Exports use the `default` condition. `require()` works on Node 22.12 and later.

### Added

- A collapsible variant-card strip with bounded paging, shared navigation and filters, and details for unmapped variants. `visibility.variantCards` turns it on or off.
- `updateAnnotations(list)` replaces annotations by existing ID in one step. It keeps selection, filters and card focus, also inside a shadow root.
- The Position inspector shows amino-acid names and chemical classes, supplied variant metadata, and a paged list of visible residues and positions.
- `<msa-canvas>` custom element (`./element`). Its events carry an `msa-` prefix.
- Vue 3 wrapper (`./vue`). `vue` is an optional peer dependency.
- Script-tag bundle `dist/msa-canvas.global.js` (global `MsaCanvas`) with the worker inlined, plus `dist/style.inline.css` with fonts as data URLs.
- `workerUrl` accepts a string, a `URL` or a function that returns a `Worker`.
- Wire format version 1: `toJson`, `fromJson`, `fillTemplate`, `escapeJson`, `WIRE_FORMAT`, `WIRE_VERSION` and `WIRE_PLACEHOLDER`, and `MsaCanvas.mountWire` in the bundle.
- Package exports `./wire.schema.json`, `./view-state.schema.json` and `./template.html`. The template is one self-contained page with a single JSON payload placeholder.
- `msa-canvas <file> -o view.html` command, with `--config`, `--state`, `--theme`, `--height` and `--json`.
- Python package `msa_canvas` (`python/`) with `to_wire`, `to_html` and an anywidget `MSAWidget`. R htmlwidgets package `msacanvas` (`r/msacanvas`). Neither is in the npm archive or published by the release workflow.
- `theme: 'auto'` follows `prefers-color-scheme`.
- The tools bar has labelled groups, with rarely used controls behind More. New `--ak-*` tokens cover type sizes, radius, mono font, danger, warning, scrollbar and shadow.
- `getVariableColumns({ limit: Infinity })` and `variableColumns` with `limit: Infinity` list every variable column.
- Annotation import matches Stockholm `NAME/START-END` row names and warns when a name matches more than one row.

### Fixed

- Tree leaves match the first word of a row name, so FASTA headers with a description match.
- The regex guard rejects a repeated group that holds a repeat at any depth. Such patterns froze main-thread search.
- `~` is a gap in FASTA, Stockholm, CLUSTAL and PIR.
- Parsers load more than about 120,000 rows. Warning line numbers stay correct when a file starts with blank lines.
- A React parent that passed inline `options` and set state in `onViewportChange` no longer loops.
- An alphabet switch keeps the view state. A superseded failed load resets `loading`.
- `setOptions` validates every field before it applies any, and emits `error` on a bad value.
- Overview and label-resize drags end on `pointercancel`.
- PNG export checks 16,384 px per side and 32,000,000 px area before it builds the figure. Before, it failed after building a large SVG.
- SVG and PNG export follow the reverse-complement view and per-row strand flags.
- `escapeXml` drops XML-illegal control characters, which broke SVG output.
- Glyphs stay sharp at a fractional `devicePixelRatio`. Re-registering a color scheme redraws its colors.
- GFF3 export names the reason when it skips an annotation without a row.
- The alignment stays scrollable when cards and annotation tracks exceed the viewer height.
- Dark-theme input placeholders and headings have readable contrast.

### Accessibility

- Residue letters use dark or white ink per fill, so every built-in palette entry reaches 4.5:1 contrast.
- Focus rings on the grid and the reference label are no longer clipped.
- Forced-colors mode shows pressed and selected states. Reduced-motion mode stops transitions.
- A layout for widths under 480px. Larger touch targets on coarse pointers.
- Visible labels match accessible names. Toggle buttons carry `aria-pressed`.
- Menus open, close and select inside a shadow root.

### Packaging and documentation

- Declarations resolve under TypeScript `moduleResolution` `node16` and `bundler`.
- The build prints a size table and checks each entry against a gzip budget.
- New pages: quick start, functions and types, architecture, wire format, other languages and CONTRIBUTING. `npm run docs:api` builds a TypeDoc reference.
- `docs/reference/frameworks.md` covers Vue, Solid, Angular, Preact, Next.js, Astro, SvelteKit, CDN use, worker setup per bundler and CSP.
- CI enforces coverage minimums of 90% statements, 85% branches, 90% functions and 95% lines.
- A release sets the version in four binding files as well; see `docs/RELEASE.md`.

## 0.5.2 (2026-11-18)

- Publish the accessibility, safety and validation improvements prepared in 0.5.1.
- Use Ubuntu's official HTTPS archives for browser dependencies in CI and release jobs, avoiding the slow regional mirror that prevented the 0.5.1 release from reaching npm and JSR. The existing 0.5.1 source tag is preserved.

## 0.5.1 (2026-11-18)

- Expose the active alignment cell to assistive technology with sequence, column, residue and sequence-position details. Clear stale accessible data when an alignment is removed, keep multiple viewers independent, and follow the visible column after scrolling without a selection.
- Improve control contrast, resize-control semantics, inspector keyboard access and text-view accessibility. Wrap inspector tabs so every tab remains reachable at desktop and narrow widths.
- Avoid repeated residue scans and accessibility DOM replacement when the active cell is unchanged; update sequence coordinates incrementally during panning.
- Harden inspector SVG content handling and remove unused internal code without changing public package exports.
- Add Chromium/WebKit accessibility and packed React/Svelte browser tests, plus package and quality checks to pull-request and release CI.
- Record repeatable browser startup, scrolling, memory and disposal measurements, and refresh release and user documentation.

Validation: 499 unit tests and 60 Chromium/WebKit cases pass locally; TypeScript/Svelte, builds, packed consumers, Knip, Deno dry run and Aislop pass. Browser performance targets pass on the recorded machine; see `docs/performance.md` for methods and limits. Native spoken screen-reader testing is deferred and is not claimed as verified.

## 0.5.0 (2026-10-30)

- Add a text view and a labeled full screen button.
- Show hints on icon-only buttons and center the inspector crosshair.

## 0.4.0 (2026-10-29)

Added:

- Variant model, protein HGVS parser and `variantsToAnnotations`.
- Variant track, variant navigation and `addVariants` on the viewer.
- Variant outline colors in exports and a consequence legend in the Colors tab.
- Zenodo citation.

Changed:

- Split the README developer reference into `docs/reference`.
- Harden inspector rendering and clean up diagnostics.

Fixed:

- Variant review findings: residue offsets for HGVS, bounded lanes, metadata-only variants, display-order navigation.

## 0.3.0 (2026-10-28)

Added:

- PHYLIP, NEXUS, MSF and PIR input, CLUSTAL, Stockholm, PHYLIP and NEXUS export, and paste loading.
- Annotation import from GFF3, BED, GenBank, EMBL and UniProt JSON.
- Annotation export (GFF3, TSV, JSON) and UniProt JSON file open.
- Regex, IUPAC and PROSITE motif search with a hit list. The search runs in the worker with a hard timeout.
- Custom track API, entropy and information tracks, and Stockholm GC/GR tracks.
- Hidden, removable and reorderable rows, collapsible row groups and a Newick tree panel.
- Non-destructive column masking, applied to every export. View state and links carry the motif search.
- Reverse-complement view and per-row strand flags.
- Persistent column marks, and colorblind-safe and high-contrast palettes.
- Consensus and color thresholds, percent-identity and BLOSUM62 schemes, extra sort keys, and identity and coverage filters.
- Column summary statistics, a variable-column table and a Summary tab that follows the selected block.
- Residue and annotation tooltips with `hover` and `cellclick` events.
- Parser warnings panel and programmatic data accessors.
- Reference-relative ruler and residue go-to.
- Dots-for-matches display mode.
- Drag-to-pan, click-to-clear and the alphabet guard.

Changed:

- Split `viewer.ts` into `src/viewer` modules.
- Make exported row names unique, default NEXUS missing to `?`, require a `*` terminator for PIR detection.
- Repair invalid residues in Stockholm and CLUSTAL, and drop the `name-truncated` warning.
- Run summary requests independently and retry failures.
- Honor dynamic color schemes in figure export, consensus track, overview and legend.

Fixed:

- Reverse-complement visible range, column scroll, identity shading and annotation sort refresh.
- Protein FASTA orientation, Position tab letters and the reverse ruler numbering cache.
- GFF3 export for repeated and `#`-prefixed row names.
- Annotation seqid matching for described FASTA headers and track-prefixed seqids.
- Motif search cost bounds and search state handling.
- Track copy, `setOptions` validation order, GR row fallback and track area height.
- Go-to width, ruler label overlap and the bare `#ruler` anchor.
- Tooltip hover state after hide and after scroll.
- Legend class color validation and escaping in the Colors tab.
- Gap-based hiding when manual ranges cover the rest, hidden search hit flags and `showColumns` range validation.
- Match dots fall back to letters when the reference row is hidden.
- Tree clade selection skips the pinned reference, and view links drop the manual order.

## 0.2.0 (2026-10-28)

- Add consensus sequence export, a colored consensus track and a consensus threshold.
- Expand ambiguity codes in consensus ties and merge T with U.
- Add FASTA options for gaps, case, line width and header.
- Add JSR publishing, CI and tag-triggered release workflows.
- Publish to npm with trusted publishing in place of a token.
- Pin workflow actions to commit SHAs.

## 0.1.0 (2026-10-27)

First release, published to npm as `@nuin/msa-canvas` under MIT.

- Initial viewer with React and Svelte integrations.
- Configurable viewer and documentation.
- Themed viewer menus, nucleotide colors and row spacing.
- Ctrl/Cmd+C copy of the selection as gapped FASTA.
- Shareable view links and opt-in URL hash sync.
- Fixes for the export menu, identity sort cancellation and stale progress messages.
- Source similarity audit and reproducible screening.
