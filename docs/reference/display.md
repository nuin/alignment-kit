# Columns, rows and tracks

## Hide columns

Column masking hides columns without changing the alignment. Hidden columns leave the grid, the tracks and the overview; the remaining columns close up. Coordinates stay original: selections, `getState().selection`, search hits, annotations, go-to, the Position tab, `hit.start`/`hit.end` and the ruler all use alignment columns (or reference residues in reference mode). Statistics and the consensus are still computed over all columns.

```ts
const viewer = createViewer(el, { hideGapColumns: 0.5 });   // hide columns that are gaps in at least half the rows
viewer.setOptions({ hideGapColumns: null, hideAllGapColumns: true });
viewer.hideColumns(10, 20);        // one-based, inclusive
viewer.showColumns(12, 14);        // reveal part of a manual range
viewer.showColumns();              // reveal everything, including gap-based hiding
viewer.getColumnMask();            // Uint8Array, 1 = visible, 0 = hidden, one entry per column
```

- `hideGapColumns` (0 to 1, or `null` for off, default `null`) hides columns whose gap fraction is at least that value. The fraction counts gaps over all rows of the alignment, not only the filtered rows, and is independent of the statistics scope. `1` hides columns that are gaps in every row, and `0` would hide every column, so a gap rule that hides all columns is ignored and the manual ranges apply alone. When the gap rules and manual ranges together would hide every column, only the gap rules apply. The gap-fraction track follows the statistics scope, so with `statisticsScope: 'filtered'` it can differ from this all-rows fraction; the counts run on the main thread when the alignment loads.
- `hideAllGapColumns` (default `false`) hides columns that are gaps in every row.
- `hideColumns(start, end)` adds a manual range; overlapping and adjacent ranges merge. It throws for an invalid range or when, with the gap rules, it would hide every column. `showColumns(start, end)` throws for a range beyond the width or when a column in it stays hidden by `hideGapColumns` or `hideAllGapColumns`. `getState().hiddenColumns` lists the merged manual `[start, end]` ranges, and `setState` restores them. Gap-based options are viewer options, not view state: a receiver of a state or link needs the same `hideGapColumns` and `hideAllGapColumns` to see the same view.
- `showColumns()` clears the manual ranges and turns both gap options off. `showColumns(start, end)` removes only that range from the manual ranges; gap-based hiding stays.
- `getColumnMask()` returns the effective mask, with the manual and gap-based rules combined.
- The secondary toolbar has **Hide selected columns** (hides the selected columns and clears the selection) and **Show all columns (n hidden)**. `visibility.columnMasking` hides both.
- Find next and the Hits tab still select a hit inside hidden columns and add a note to the status message. Changing the mask keeps the column at the left edge of the viewport in place. Loading another alignment drops the manual ranges; `removeRows` keeps them.

Rendering: a dashed amber line marks each collapsed boundary in the grid and the tracks, with a small tab on the ruler. Ruler labels show original column numbers. A label appears at the first column after a boundary when it has room (about 36 px from the previous label). In reference mode the residue numbers count residues in hidden columns, so the labels still match the sequence. A hit or annotation that spans hidden columns draws as one box over its visible columns, and one that lies entirely in hidden columns is not drawn. A selection draws over the visible part of its range and stays at least 2 px wide when all of it is hidden. Custom track `render` callbacks run once per run of adjacent visible columns, clipped to that run, with `start`, `end` and `offsetX` describing the run. Arrow keys step over hidden columns, Shift+arrows extends a selection across a boundary, and Go to refuses a hidden column with a message.

Export: default exports contain every column. **Export > Visible columns · FASTA** writes every row without the hidden columns. The **Visible columns only** checkbox beside the Export menu (`export: { columns: 'visible' }`, default `'all'`) that applies the same rule to every export except view state JSON, the consensus export and Ctrl/Cmd+C. `fasta: { columns }` still works as an alias. In code, `exportFasta(a, { columns: viewer.getColumnMask() })` keeps only the visible columns inside `start` to `end`; `exportClustal`, `exportStockholm`, `exportPhylip`, `exportNexus`, `exportSvg` and `exportPng` accept the same `columns` region field, and `exportStatistics(stats, { columns })` keeps only those rows. SVG and PNG collapse the hidden columns, number the ruler with original columns, split annotation outlines at the gaps and draw a dashed line with a `<title>` ("2 hidden columns: 3–4") at each collapsed boundary; the SVG metadata records `hiddenColumns`. A range with no visible column throws.

The link parameter is `hide=10-20,30-35` (manual ranges only). A link without `hide` shows all manually hidden columns again; a range beyond the alignment width is skipped and reported as `hide`. The helpers `computeColumnMask(alignment, { gapFraction, allGap, hidden })`, `mergeColumnRanges` and `buildColumnMap` are exported for use outside the viewer.

## Reverse complement view

DNA and RNA alignments can be shown reverse-complemented without changing the alignment. There are two display switches.

```ts
viewer.setReverseComplement(true);       // whole view; also the option reverseComplement and the "Reverse complement" checkbox
viewer.getReverseComplement();           // true while active; always false for protein
viewer.setRowStrand('seq-3', '-');       // flag one row as reverse strand; '+' clears it
viewer.getRowStrand('seq-3');            // '-' or '+'
```

Coordinate model:

- Whole view (`setReverseComplement`) is a display transform. Columns run right to left and every residue is complemented (A pairs with T for DNA and U for RNA; IUPAC codes swap in pairs: C/G, R/Y, K/M, B/V, D/H; gaps and other symbols stay). The ruler shows original column numbers, descending (`12 ... 1`), or reference residue numbers descending in reference mode. The ruler label and the status line say "reverse complement".
- Row strand (`setRowStrand(id, '-')`) complements one row in place. Columns stay aligned and the row label shows a `−` button (`+` for forward rows) that toggles the flag. With the whole view on, a flagged row is complemented twice and reads as its source letters, right to left.
- Coordinates never change. Selection, `getState()`, search hits, annotations, Go to, hidden columns, column statistics and `viewport` events (`start <= end`) all use original 1-based columns. Search runs on the source rows; the `-` strand of a hit still means the reverse complement of the source.
- Consensus and logo tracks complement their letters in the whole view; the statistics themselves stay in source orientation. Row strand flags do not change them. The Position tab shows the displayed letter and, when it differs, the source residue as secondary text.
- Keyboard: in the whole view, Left and Right move one displayed column, so Right moves to a lower column number.
- Custom track `render` callbacks receive `reversed: true` in the whole view. Runs of adjacent columns are drawn right to left: column `end` sits at `offsetX` and each lower column one `cellWidth` further right.
- Protein alignments cannot be reverse-complemented. `setReverseComplement(true)`, `setOptions({reverseComplement:true})` and `setRowStrand` leave the viewer unchanged and show "Reverse complement needs a DNA or RNA alignment." The checkbox is disabled. Switching a loaded alignment to protein turns the view off; switching back turns it on again if the option is still true.

Exports stay in source orientation, whatever the view shows. To export reverse-complemented FASTA, set the FASTA option `orientation: 'reverse-complement'` (panel: **FASTA options > Orientation**). It applies to FASTA exports, the consensus export and Ctrl/Cmd+C: each exported region is reversed and complemented, headers gain ` (reverse complement)` and the column range stays in source coordinates. It does not follow the view or row strand flags. On a protein alignment the option is ignored and the select is disabled. Other formats are never reverse-complemented. Row strand flags never change copy, FASTA or Stockholm exports: they always write the stored residues, reverse-complemented only when `orientation` says so. Sorting by residue, identity, gaps or length compares the stored residues, not the displayed ones, in both the reverse-complement view and flagged rows. `complementSequence(seq, alphabet)` and `reverseComplementSequence(seq, alphabet)` are exported for scripts.

State and links: `ViewState.reverseComplement` and `ViewState.reverseStrandRowIds`; link parameters `rc=1` and `strand=id1,id2` (IDs percent-encoded inside the list). A link without `rc` turns the view off and clears flags. `rc` on a protein alignment and unknown row IDs are skipped and listed. Config: `reverseComplement` (boolean), `fasta.orientation`, `visibility.reverseComplementToggle` and `visibility.rowStrand`.

## Text view

The **Text** button (or `setOptions({ textView: true })`) swaps the residue grid for selectable plain text. Each block covers 60 shown columns: a line with the first and last alignment column of the block, then one line per row with the name (cut at 30 characters), the residues and the residue number of the last residue in the block (row offset applied; blank when the block holds only gaps).

```text
                          1                                                         60
Q9WZH4_THEMA/366-421      V--------K-S---I--------MST--------NL---------V-------VASPD- 380
```

The text follows the grid: the pinned reference first, then the row order, filters, hidden and collapsed rows, hidden columns, the reverse complement view and per-row strands. Tracks and the overview are hidden while it is shown. It writes up to 200,000 residues; rows past that are left out and a note says how many are shown. `formatTextView(alignment, { rows, columns, block, reverse, flagged, limit })` returns the same text for use outside the viewer. `visibility.textView` hides the button.

## Mark columns

Marks flag columns of interest with a persistent coloured outline box across all rows and a marker bar in the ruler.

```ts
viewer.markColumns([10, [12, 14]]);          // a column or an inclusive one-based [start, end] range each
viewer.markColumns([[40, 42]], '#d62728');   // hex color, default #7b2cbf
viewer.unmarkColumns([[13, 13]]);            // remove part of a mark
viewer.unmarkColumns();                      // remove every mark
viewer.getColumnMarks();                     // [{ start: 10, end: 10, color }, ...] sorted, non-overlapping
```

- Alt-click (Option-click on macOS) a cell or the ruler toggles a mark on that column. The click does not change the selection.
- The Position tab has **Mark column** (**Unmark column**; plural for a range). It marks the selected columns, or unmarks them when all are already marked. Columns that already carry a colour keep it. `visibility.columnMarks` hides the button and turns off Alt-click; the API keeps working.
- Ranges outside 1 to the alignment width throw. Adjacent ranges of one colour merge. Marking a marked column replaces its colour.
- Marks use original column numbers. Column masking does not move or drop them: a mark spanning hidden columns draws over its visible columns, and a mark whose columns are all hidden is kept but not drawn until they return.
- `getState().columnMarks` holds `{ start, end, color }` ranges; `setState` restores them and rejects ranges beyond the width. `removeRows` keeps marks; loading another alignment clears them.
- Links carry `marks=10-12,40` (ranges only, no colours). Applying a link replaces the marks with the link's ranges; columns already marked keep their colour, others get the default. A range beyond the width is skipped and reported as `marks`. A link without `marks` clears them.

## Dots for matches

`matchDisplay: 'dot'` draws a residue identical to the comparison residue as `.`; the cell keeps its color. The comparison is the consensus when `colorMode` starts with `consensus`, otherwise the pinned reference row. The reference row always shows letters. Gaps, `?` and mismatches keep their symbol. The **Dots for matches** checkbox in the secondary toolbar sets the option, and `visibility.matchDots: false` hides the checkbox. Dots need a cell width of 9 or more, like letters. Canvas, SVG and PNG figures use dots; FASTA, copy and the other text exports keep real residues. `getState()` carries `matchDisplay` and links carry `dots=1`. When the reference row is not shown (reference hidden or filtered out by a name filter), the viewer and `exportSvg` fall back to letters, so a dot never refers to an invisible row.

```ts
viewer.setOptions({ matchDisplay: 'dot', colorMode: 'consensus-differences' });
exportSvg(alignment, stats, {}, 'soft', { referenceId: 'seq-1', matchDisplay: 'dot' });
```

## Hide, reorder and group rows, and show a tree

Each row label has a hide button (×). **Show hidden (n)** in the secondary toolbar restores them. Hidden rows leave the grid and the `filtered` statistics scope; the alignment is unchanged. Dragging a row label onto another row, or Alt+Up and Alt+Down on a focused label, moves it and switches the order to `manual`. Dragging does not auto-scroll, so move a row far away in steps or with `moveRow`.

```ts
viewer.hideRows(['seq-3', 'seq-9']);
viewer.showRows();                      // or showRows(['seq-3'])
viewer.moveRow('seq-5', 0);             // zero-based index into getRowOrder()
viewer.getRowOrder();                   // all row IDs in the current order, including hidden rows
await viewer.removeRows(['seq-2']);     // new alignment copy, new alignment ID, statistics recomputed
```

`ViewState` carries `hiddenRowIds`, `manualOrder` (null until a manual order exists) and `collapsedGroups`. Links carry `sort` (`tree` and the new `gaps`, `length`, `residue` and `annotations` included, `manual` omitted because a link holds no row list), `scol` for the residue sort column, and `minid`/`mincov` for the row filters, but not hidden rows. `ViewState` also carries `sortColumn`, `consensusThreshold`, `colorThreshold`, `minIdentity` and `minCoverage`. `removeRows` keeps the filter, order, hidden rows, groups and tree, drops annotations of removed rows, and throws if no row would remain.

Groups: `groupBy` takes `'species'` or a `row.metadata` key. `setGroups({ rowId: 'name' })` overrides it, and `setGroups(null)` returns to `groupBy`. Rows order by group (alphabetical, `Ungrouped` last), then by the current order inside each group. Each group has a header row with its name and visible row count, and a color bar on its labels. Click a header, in the label gutter or on the grid, to collapse or expand it; `toggleGroup(name)` does the same. The pinned reference stays above the groups.

Tree: `setTree(newick)` parses one Newick tree, orders rows by it (`sort: 'tree'`) and draws it in a column left of the labels, `treeWidth` pixels wide (0 hides it, the `tree` visibility key hides it too). While groups are active (`groupBy` or `setGroups`) the tree column collapses to 0 px and a message says so once. Leaves match rows by ID, then by name; a message lists unmatched leaves and rows, and `setTree(null)` or a new tree clears it. Newick names, branch lengths, quoted labels, `[comments]` and numeric internal labels (kept as support values) are read. Underscores stay literal. The pinned reference has no leaf in the column and is not checked by a branch click. Support values are parsed but not drawn. Click a branch point to check the visible rows under it. With a sort other than `tree`, branches cross. `parseNewick` and `leafOrder` are exported for use without a viewer.

```ts
viewer.setOptions({ groupBy: 'species', treeWidth: 160 });
viewer.setTree('((human_1:0.1,chimp_1:0.1)0.98:0.3,mouse_1:0.5);');
viewer.setTree(null);
```

## Tracks

Track area, top to bottom: the built-in column tracks `ruler`, `modalFrequency`, `gapFraction`, `entropy`, `quality`, `consensus`, `logo`; then Stockholm `#=GC` tracks and registered tracks; then the `#=GR` tracks of the selected or reference row; then the pinned `reference` row, directly above the alignment body. `entropy` and `quality` default to hidden. `quality` is only drawn for protein alignments. Labels sit in the label gutter. The track area grows to fit its tracks and has no scrollbar of its own. Clicking any track column selects that column (`Shift` extends the range); clicking the reference row also selects that row.

`entropy`, `information` and `quality` are `Float32Array`s on `AlignmentStats` (`NaN` where undefined), appear in the Position tab, and are the last three columns of the Column statistics TSV (`entropy_bits`, `information_bits`, `quality`; `NA` when undefined). Two options shape them:

- `logoMode: 'frequency' | 'bits'` (default `'frequency'`). `'bits'` scales each letter stack by `information / log2(s)`, where `s` is 20 for protein and 4 for DNA/RNA, so a column with the maximum information (4.32 or 2 bits) fills the 41 px stack area of the logo track. The track label reads `Information logo · bits` in this mode and `Frequency logo · non-gap` otherwise.
- `conservationWindow` (odd integer 1 to 51, default 1). Centered moving average of the entropy and quality bars, skipping `NaN`. `setOptions` rounds an even value down to the next odd one; JSON configuration rejects it.

### Custom tracks

```ts
viewer.addTrack({ id: 'rate', label: 'Rate', type: 'bar', values: rates, domain: [0, 5], color: '#8a6bb0' });
viewer.addTrack({ id: 'dom', label: 'Domain', type: 'custom', height: 30, render(ctx, { start, end, cellWidth, offsetX, top, height }) { /* draw columns start..end */ } });
createViewer(element, { tracks: [{ id: 'ss', label: 'Structure', type: 'text', values: 'HHHEEE' }] });
```

| Field | Meaning |
|---|---|
| `id` | 1 to 64 letters, digits, `.`, `:`, `_`, `-`. Unique; built-in names are reserved. |
| `label` | Gutter label, 1 to 120 characters |
| `type` | `bar` (height scales with value), `heatmap` (opacity scales with value), `text` (one character per column), `custom` |
| `height` | 12 to 120, default 26 |
| `values` | One entry per alignment column: an array of numbers and `null`, or a string. In a string, digits `0`-`9` are values for `bar` and `heatmap`. Typed arrays work in JavaScript. |
| `domain` | `[min, max]` mapped to 0..1, default `[0, 1]` |
| `color` | Any CSS color, default `#3a7da4` |
| `render(ctx, info)` | Required for `custom`. `ctx` is clipped to the track. `info` has `start` and `end` (visible 1-based inclusive columns), `cellWidth`, `offsetX` (x of column `start`), `top`, `height` and `alignment`. |

`addTrack(track)`, `removeTrack(id)` and `getTracks()` (copies, in drawing order) manage tracks; `ViewerOptions.tracks` replaces the whole set. Errors are thrown and also emitted as `error`: invalid fields, a duplicate id, an unknown id, and a `values` length other than the alignment width (the track is then not registered). A registered track whose `values` do not fit a newly loaded alignment emits `error` and is skipped until it fits. A `render` that throws emits `error` once per track. The track area is capped at 45% of the viewer height and scrolls beyond that. `setOptions` validates every option before applying any. Class-based tracks keep their `render` method. JSON configuration accepts `bar`, `heatmap` and `text` tracks with `values` as a string or an array of numbers and `null`; `render` and `custom` need JavaScript.

### Stockholm tracks

Stockholm `#=GC` lines become tracks when `visibility.stockholmTracks` is on (default). Each key (`SS_cons`, `RF`, `seq_cons` and others) is a 20 px text track; `PP_cons` is grey shading from `0` to `9`. `#=GR` lines draw for the selected row, or the pinned reference when no row is selected, labelled `<feature> <row name>`; `PP` is shaded. Selecting another row swaps the `#=GR` tracks. These tracks are not listed by `getTracks()`.
