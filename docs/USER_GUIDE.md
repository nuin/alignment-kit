# Alignment Kit user guide

Alignment Kit displays **already aligned** protein, DNA and RNA sequences. Use it to explore a family, compare residues, inspect supplied annotations and export a region. It runs in your browser; the library does not upload your alignment. Loading a remote URL requests that file from its server.

This guide describes the standalone Explorer. Applications embedding the library can hide controls or supply their own data and annotations. For installation and JavaScript, React and Svelte examples, see the [developer README](../README.md).

## Start with a real alignment

1. Open the Explorer and choose **CBS family**, **Protein kinase**, **Globin · 20,705**, or **Transfer RNA** under **Real alignments**.
2. Read the dataset description and source link. The globin example has 20,705 sequences; the tRNA example uses RNA interpretation.
3. Click a residue. The **Position** inspector shows its alignment column, sequence position and column statistics.
4. Use **Color** to choose a palette. Open **Colors** in the inspector to see its meaning.
5. Scroll sideways through columns and vertically through sequences. The reference and sequence labels remain visible.
6. Use **Inspect** to hide or reopen the inspector when you need more space.

The annotated example and large benchmark buttons are explicitly synthetic. Their variants and group names illustrate interactions; they are not biological findings. Real example downloads retain all supplied rows and columns. Source URLs, retrieval dates and hashes are recorded with each snapshot.

![CBS protein alignment with reference, statistical tracks and position inspector](screenshots/protein-explorer.png)

*Actual CBS seed alignment: 838 sequences and 160 columns. The selected alignment column is shown in the inspector.*

## Open your own file

Choose **Open alignment**, or drop a file onto the viewer. Supported formats are aligned FASTA, Stockholm and CLUSTAL, including gzip-compressed files. A filename ending in `.gz` is convenient; gzip detection uses the file bytes.

Every sequence must have the same aligned length. Use `-` or `.` for a gap. A minimal DNA alignment is:

```text
>reference
AC-GT
>sample
ACTGT
```

The viewer preserves duplicate FASTA display names as separate rows. Explicit IDs supplied by an embedding application must be unique. Interleaved Stockholm and CLUSTAL blocks must be separated by blank lines and retain consistent row membership and chunk widths.

The viewer does not align raw sequences, infer homology or repair ragged inputs. Align the sequences first using your chosen alignment tool. A3M insertion notation is unsupported: convert it to a rectangular alignment first. Known `.a3m` files and URLs are rejected; anonymous text cannot reliably distinguish insertion notation from lowercase aligned FASTA.

Remote URL loading is available through the JavaScript API, not a separate URL field in the Explorer. If the source server blocks browser CORS requests, download the file and open it locally.

## Choose Protein, DNA or RNA

The **Type** menu controls interpretation and compatible palette choices. Files loaded without an explicit type use alphabet detection; short or ambiguous sequences can be misclassified, so check the menu.

- **Protein:** canonical positions for identity use the 20 standard amino acids.
- **DNA:** canonical positions use A, C, G and T.
- **RNA:** canonical positions use A, C, G and U.

Changing Type does not translate a protein, reverse-complement DNA or replace T with U. It keeps the original letters. It replaces the alignment model and resets the reference, filters and selection, so choose the correct type before detailed exploration. An incompatible color scheme is replaced by the default for the new type.

Lowercase letters are retained in source sequences and normalized for comparisons. Ambiguity symbols are counted as literal symbols. They are not expanded into fractional A/C/G/T/U counts.

## Move through the alignment

The matrix is a window into the full alignment. Ordinary scroll controls move through rows and columns. Labels stay at the left, and the reference row stays above the matrix.

| Control | What it does |
|---|---|
| Overview | Click or drag to move horizontally across the alignment. |
| Go to | Enter a **1-based alignment column**, then press Enter. |
| − / + | Change residue cell width, preserving the viewport's horizontal center. |
| Fit | Fit as much width as possible, down to the 3px minimum; very wide alignments still scroll. |
| Label divider | Drag the divider between sequence labels and residues to change label width. |
| Theme button | Toggle the viewer's light and dark surfaces. |
| Full screen | Expand the viewer when the browser supports fullscreen. |

At small cell widths, letters disappear to keep rendering legible. Zoom in to read individual residues. Dots represent gaps. Sequence rows default to 36px to accommodate names and species; applications can configure density. Compact rows below 32px hide the secondary species line.

## Select a position or region

Click a residue to select its row and alignment column. **Shift-click** another column to select an inclusive range. The Position inspector reports the start of the selection and its full range.

Row checkboxes select sequences for pairwise comparison and region export. They are separate from the clicked residue: clicking a residue does not check its row. Checked sequences remain selected when you scroll or filter names.

Use **Escape** while the matrix is focused to clear the residue/range selection. Use **Clear rows** in the Compare tab to clear checked sequences.

Press **Ctrl+C** (**Cmd+C** on macOS) while the matrix is focused to copy the selection as gapped FASTA. Checked rows are copied in their on-screen order, followed by checked rows hidden by the name filter. Without checked rows, the clicked row is copied; without either, the rows that Export uses. Copying works on HTTPS pages and localhost.

## Alignment columns versus sequence positions

Alignment columns count every displayed column, including gaps. Sequence positions count non-gap residues in one particular sequence. Both are 1-based in the public UI/API.

```text
Alignment column:  1 2 3 4 5
Sequence:          A C - G T
Sequence position: 1 2 · 3 4
```

Alignment column 3 has no sequence position for this row. Column 4 corresponds to sequence position 3. Another row can have a different mapping at the same column. Do not treat an alignment column as a genomic coordinate or a universal residue number.

## Find sequences and motifs

**Find a sequence** filters names and supplied species labels, ignoring case. It changes the visible rows, not the underlying alignment. The pinned reference remains visible even if it does not match the filter.

**Find a motif** searches for a literal, ungapped sequence of letters, optionally including `*`. Press **Find next** to move through matches among the filtered rows. Searching `ACG` can match `A-C-G` because gaps are ignored; the selected alignment range includes those intervening gaps.

Motif search is not a regular-expression search. IUPAC ambiguity letters are literal here: searching `N` looks for an actual N, not any nucleotide. The same rule applies to protein X.

## Pin a reference and order rows

Click the diamond beside a sequence to pin it as the reference. You can also click a residue and choose **Pin reference** in the Position inspector. The reference is displayed once above the scrolling rows; pinning does not give it an extra statistical vote.

**Order** offers input order, name order and identity to reference. Identity ordering runs an exact comparison against the pinned sequence. After choosing it, selecting a row shows matched and compared-position counts in the inspector. Changing the reference while using identity order recomputes those comparisons.

Row IDs keep annotations attached to their original sequence when you reorder or filter. The viewer does not infer a phylogenetic tree or cluster sequences by evolutionary distance.

## Choose DNA and RNA colors

Open **Color** to choose a scheme, then open the inspector's **Colors** tab for its legend. The menu contains only compatible schemes. All nucleotide schemes use the same color for T and U; the letter itself remains unchanged.

| Scheme | Use it for | Meaning |
|---|---|---|
| Nucleotide · muted | Comfortable everyday exploration | A green, C gold, G rose, T/U blue. |
| Nucleotide · classic | A vivid base-by-base display | The attributed Nightingale nucleotide palette. |
| Nucleotide · blue/orange | An alternative four-color view | A blue, C orange, G purple, T/U teal. |
| Nucleotide · strong | More saturated base blocks | A navy, C gold, G purple, T/U teal, with contrasting letters. |
| Nucleotide · grayscale | Monochrome figures | Four gray levels; use the letters to identify the bases. |
| GC / AT(U) | Explore base groups | G/C/S are blue; A/T/U/W are gold. This is not a GC-content percentage. |
| Purine / pyrimidine · muted | Explore chemical classes | A/G/R are blue; C/T/U/Y are gold. |
| Purine / pyrimidine | Vivid chemical-class coloring | The attributed Nightingale group palette. |
| Consensus support | Locate well-supported columns | Shade represents modal residue count divided by all rows in the chosen statistics scope. |

The new four-base schemes give mixed ambiguity symbols a neutral background. Group schemes color an ambiguity symbol only when every possible base belongs to the same group: S means G/C; W means A/T; R means A/G; Y means C/T. Symbols spanning both groups remain neutral. The color choice does not change statistics, search semantics or pairwise identity exclusions.

<!-- nucleotide-palette-preview -->

For protein alignments, **Residue classes** is the muted default. Fixed schemes include Clustal/Clustal2, Taylor, Zappo, Lesk, Cinema, MAE, hydrophobicity, buried index and secondary-structure propensities. These color residue identities or properties; they do not predict function or structure. Clustal2 is a fixed mapping, not column-dependent ClustalX coloring.

![Real tRNA alignment using the blue-orange nucleotide palette and frequency logo](screenshots/rna-colors.png)

*The Rfam tRNA example is RNA. These nucleotide schemes also work for DNA; T and U share a color while their letters remain distinct.*

## Emphasize matches or differences

The menu next to **Order** controls which residues receive full color. Choose all residues, matches/differences to the reference, or matches/differences to the consensus. De-emphasized cells remain present; no rows, columns or letters are deleted.

Reference comparison uses the pinned row. Consensus comparison uses the selected statistics scope. Gaps and tied-consensus markers are not treated as matching residue identities. Coloring and identity percentages are different operations: identity uses only canonical, comparable positions.

## Understand the tracks and statistics

Statistics default to **All sequences**. Scrolling, sorting, pinning and filtering names do not silently change that scope. Choose **Stats → Filtered sequences** explicitly to analyze only matching rows. A pinned reference that does not match the filter remains visible but is not added to filtered statistics.

| Quantity | Definition |
|---|---|
| Gap fraction | Gap count divided by the number of rows in scope. |
| Modal frequency | Most frequent non-gap symbol count divided by non-gap rows. |
| Consensus support | Most frequent non-gap symbol count divided by all rows in scope. |
| Consensus | Unique most frequent non-gap symbol; ties are shown explicitly. |
| Frequency logo | Literal symbol frequencies among non-gap rows; not information content. |

For a column `A, A, C, -`, modal frequency is 2/3 (66.7%), support is 2/4 (50%), and gap fraction is 1/4 (25%). The consensus is A. A high modal frequency with many gaps is not the same as broad support.

An all-gap column has no modal residue and an unavailable modal frequency; its support is zero if the scope contains rows. An empty statistics scope has unavailable fractions. Tied top counts produce a tied consensus rather than an arbitrary winner. Each row gets one vote: no sampling, deduplication, sequence weighting or phylogenetic correction is implicit.

Enable **Frequency logo** to add a frequency track. Ambiguity symbols keep their own counts. Interpret the logo together with gap fraction, because its denominator excludes gaps.

## Compare selected sequences

1. Check two or more sequence rows.
2. Open the **Compare** tab.
3. Choose **Calculate identity**.
4. Inspect the percentages and their matched/compared-position counts.

Each pair excludes columns where either sequence has a gap, an ambiguity symbol or a non-canonical residue. DNA uses A/C/G/T; RNA uses A/C/G/U; protein uses the 20 standard amino acids. A pair with no comparable positions is unavailable. Different pairs can have different denominators, so compare percentages with their coverage in mind.

The matrix is limited to **200 explicitly selected rows**. It is not automatically calculated for the whole alignment. Use identity-to-reference ordering for large families.

## Inspect supplied annotations

The **Features** tab displays annotations supplied by the embedding application or the synthetic annotated demo. A FASTA file alone does not fetch variants, domains or disease evidence. Stockholm metadata is retained, but the viewer does not automatically convert all metadata into plotted feature tracks.

Filter features by type or consequence. Disease and phenotype checkboxes select explicitly supplied evidence; missing evidence remains **unknown**, not false. The list reports shown, excluded and unknown counts, with 30 features per page.

Click a mapped feature to select its alignment range. Unmapped features remain inspectable without an invented protein position. **Hide row features** in the Position inspector affects that row's annotations. Annotation filters do not change the sequence data or column-statistics scope.

Annotation presence does not establish pathogenicity, functional consequence or transfer of an observation to an aligned ortholog. Preserve the supplying application's source and coordinate context.

## Export data and figures

Use the **Export** menu:

| Export | Scope and contents |
|---|---|
| All rows · FASTA | Every original row, full aligned width, in input order. |
| Selection · FASTA | Selected/visible columns and checked/visible rows, retaining gaps. |
| Selection · SVG | Vector figure with palette, coordinate scope, legend, supplied provenance and visible annotations. |
| Selection · PNG | Raster version of the selected figure. |
| Column statistics · TSV | All alignment columns using the current statistics scope, with denominator-specific headers. |
| View state · JSON | Navigation, reference, order, filters, selection and coloring settings; not the alignment itself. |

For selection exports, a selected column range takes precedence over the horizontal viewport. Checked rows take precedence over the vertical viewport. Without checked rows, export uses the pinned reference plus the currently visible scrolling rows. A checked row hidden by a name filter remains part of the export. Clear checked rows when you want a viewport-only export.

Figures preserve the palette, match/difference emphasis and annotation filters. They use their own fixed figure layout, not a screenshot of the entire application. SVG/PNG exports are limited to **200,000 cells** (rows × selected columns). PNG also limits dimensions to 16,384px per side and total area to 32 million pixels. Narrow the region when an export exceeds a limit.

FASTA exports carry names and aligned letters; they do not serialize all annotation metadata. View state can be restored with the API's `setState` against the same alignment ID. The current Explorer has no JSON-state upload button and does not create a hosted share link.

## Show and hide interface elements

In the Explorer, open **Customize viewer** above the alignment. Check or uncheck individual elements in the Layout, Main controls, Navigation and analysis, Tracks and residues, Sequence labels, and Inspector groups. **Restore default view** restores presentation defaults, including a hidden frequency logo. It does not reset your data, selection, filters, zoom or palette.

You can hide a whole toolbar or just one control, retain only the tracks you need, hide the label gutter or row actions, and choose which inspector tabs are available. A hidden parent keeps its children hidden until the parent is enabled again. When every inspector tab is disabled, the inspector collapses. Hidden track heights and label widths are reclaimed by the alignment.

Hiding the pinned reference returns that sequence to the scrolling matrix, subject to the current sequence filter. It remains the reference for comparisons. Hiding checkboxes does not clear checked rows; those rows still participate in selection exports. Hiding annotation marks does not remove the annotations. Turn controls back on to change their settings, or restore the default view.

![Minimal tRNA viewer with toolbars and inspector hidden](screenshots/minimal-embed.png)

*The same real alignment in a minimal embedding: sequence labels, ruler, consensus and reference remain visible.*

Embedded applications configure these switches through `visibility` in the JavaScript, React or Svelte options. They may provide their own settings panel; the standalone Explorer's customization panel is not automatically added to an embedded viewer. The [interface configuration reference](../README.md) lists every flag, update behavior and code examples. Developers can also supply a JSON configuration file; the README includes a checked parser, an example and a JSON Schema for editor assistance.

Visibility affects presentation only. Keyboard shortcuts, file dropping and API methods remain available. SVG/PNG exports use their own figure layout; they are not screenshots of the configured interface. Exported view-state JSON retains visibility settings.

## Keyboard reference

Focus the matrix by clicking it or navigating to it with Tab.

| Key / focused control | Action |
|---|---|
| Arrow keys / matrix | Inspect adjacent columns or rows. |
| Shift + arrows / matrix | Extend the selected column range. |
| Home / End / matrix | Jump to the first/last alignment column. |
| + or − / matrix | Increase/decrease cell width. |
| Escape / matrix | Clear residue selection. |
| Ctrl/Cmd + C / matrix | Copy the selection as gapped FASTA. |
| Enter / Go to | Navigate to the entered alignment column. |
| Enter / motif input | Find the next literal motif. |
| Left / Right / overview | Move the viewport horizontally. |
| Left / Right / label divider | Change label width. |
| Enter, Space or arrow / closed menu | Open the viewer-themed menu. |
| Up/Down, Home/End / open menu | Move through choices. |
| Letters / menu | Type ahead to a choice. |
| Enter or Space / open menu | Commit the highlighted choice. |
| Escape / open menu | Cancel without changing the value. |
| Tab / open menu | Close and move focus onward. |

Controls have accessible names and focus indicators, and selections have textual/live announcements. A complete screen-reader grid audit remains outstanding; the canvas is not a fully audited spreadsheet substitute.

## Troubleshooting

| Problem | Check |
|---|---|
| Unequal-length error | Supply an existing rectangular alignment; do not mix raw and aligned sequences. |
| Stockholm/CLUSTAL block error | Check blank-line block separation, row membership, per-block widths and annotation lengths. |
| File is not recognized | Use aligned FASTA, Stockholm or CLUSTAL. A3M, FASTQ, VCF and tree files are not alignment inputs here. |
| Colors look wrong | Check Type, Color and the Colors legend. Type changes interpretation, not letters. |
| A palette disappeared | The Color menu filters schemes by alphabet. |
| No motif found | Search is literal, ignores gaps and searches filtered rows. Ambiguity letters are not wildcards. |
| Filtering does not change statistics | Select Stats → Filtered sequences if that is the intended denominator. |
| Reference remains after filtering | The pinned reference is intentionally retained for context. |
| No annotations appear | Sequence formats do not automatically retrieve annotations; the host must supply them. |
| URL load fails | Check HTTP status and CORS. Download and open the file locally if needed. |
| Empty embedded viewer | Import the stylesheet, give the host usable space and wait until it is visible. |
| Worker fails in an embedding app | Check module-worker assets, bundler handling and the site's Content Security Policy. See the README. |
| Export unavailable or too large | Wait for statistics and reduce selected rows/columns; SVG avoids raster size limits but retains the cell limit. |
| Browser slows on a large file | Reduce the input size and compare selected rows instead of all pairs. Rendering is virtualized but full input and exact statistics still use memory. |

## Embedding and support

The library has a framework-independent JavaScript API, a React component, and a Svelte 5 component/action. The [README](../README.md) includes working examples, event semantics, custom palettes, annotation schema, coordinate helpers, worker/CSP guidance and SSR behavior. The [release notes](RELEASE.md) describe package preparation and publication status.

For a reproducible issue, record the package version, browser/OS, alphabet, dimensions, palette, statistics scope, exact interaction and error text. Use a small non-sensitive alignment that demonstrates the issue. Do not include private biological data merely to report a UI problem.

See [performance and validation](performance.md) for measured CPU baselines and outstanding browser acceptance checks. Input validation caps a single alignment at 250 million cells; this is a guardrail, not a promise that every device can load that size. Aligning sequences, editing the alignment, phylogenetic inference and structure visualization are outside this release.
