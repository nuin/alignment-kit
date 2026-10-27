# MSA viewer library: design proposal

Status: approved 2026-10-26. User added React and Svelte integrations as required deliverables.

## Intent and scope

Build an elegant, embeddable JavaScript library combining PAVI's protein annotation and variant interactions with AlignmentViewer 2.0's large-alignment exploration. The user explicitly wants a better version of the viewer experience used in PAVI, retaining the functionality discussed for large sequence sets. This is a new library in `alignment_lib`; changing or deploying PAVI is outside the initial scope.

The primary workflow is opening an existing alignment, moving between family-wide patterns and individual residues, inspecting annotations, comparing against a reference, and exporting a selected view. Alignment computation, gene lookup, clinical interpretation, and job orchestration remain host-application responsibilities.

The user approved this direction; implementation details below are engineering choices within that scope.

## Evidence examined

- Public PAVI application and guide: https://www.alliancegenome.org/pavi/help/guide
- Local PAVI source: `/Users/nuin/Projects/alliance/agr_pavi/webui`.
- `package.json` declares `@nightingale-elements/nightingale-msa`, manager, navigation, and track at `^5.0.0`, and linegraph-track at `^5.6.0`. These are dependency ranges, not verified deployed versions.
- `InteractiveAlignment/nightingale/MSA.tsx` wraps Nightingale with `@lit/react`.
- `InteractiveAlignment/VirtualizedAlignment.tsx` implements manual row slicing, custom variant markers, reference promotion, species labels, filtering, and position inspection. Although TanStack Virtual is a dependency, this component uses its own scrolling/window calculations.
- That component renders one selector chip per sequence outside the virtualized matrix. Its conservation track divides the modal residue count by all rows; its position inspector divides by non-gap rows. Both definitions can be useful, but should have distinct names.
- PAVI's `ResultsSummary.tsx` computes all sequence pairs with an inner column scan. This is a scaling risk inferred from source, not a measured production slowdown.
- The local checkout includes publication SVG export. The public guide says image export is absent; do not assume documentation and local/deployed code are identical.
- Nightingale MSA itself uses canvas and documents worker-based conservation sampling: https://github.com/ebi-webcomponents/nightingale/tree/main/packages/nightingale-msa. Canvas alone is not a differentiator.
- AlignmentViewer 2.0 supports logos, consensus, gap/conservation plots, sorting, coloring, overview rendering and interaction events: https://github.com/sanderlab/AlignmentViewer2.0.
- Downloaded the linked Pfam CBS seed, accession PF00571.34: 838 rows x 160 aligned columns, gzip-compressed Stockholm, retrieved 2026-10-26. The future demo must record source URL, retrieval date and hash with its bundled copy.

Inspection used source, public documentation and PAVI's checked-in guide screenshot. No live interactive result session or performance benchmark was run.

## Product and visual direction

The alignment is the main surface. Provide a compact embed and an expanded workbench using the same engine. Avoid a dashboard surrounding a small sequence window.

- Top toolbar: open, sequence/motif search, coordinate jump, color scheme, zoom, export.
- Slim whole-alignment overview with an explicit viewport indicator; drag to navigate.
- Synchronized ruler, consensus, gap, conservation and optional logo tracks.
- Frozen, resizable sequence-label gutter with species/annotation columns; reference row remains pinned during vertical scrolling.
- Large matrix with native scroll behavior, range selection and persistent selected-column feedback.
- Optional right inspector for the selected position, sequence or annotation. At narrow widths it becomes a drawer.
- Bottom status: visible row/column ranges, total and filtered counts, alphabet, selected coordinate system and statistics scope.

Use white `#FFFFFF` for the matrix, cool gray `#F3F6F8` for controls, ink `#243447` for text, rule gray `#D7E0E7`, and blue `#2463A6` for active navigation. Residue palettes are independent biological encodings, with legends. Use Source Sans 3 for controls and a locally bundled, tested monospace font for residue cells. Font choice may change after a legibility comparison. Provide CSS tokens and dark-theme equivalents.

Favor clean row alignment, restrained separators and adjustable density. Keep long identifiers available in the inspector; never let one identifier consume the viewport. Reference selection and variant visibility belong to searchable row controls, not thousands of chips above the matrix. Aggregate overlapping annotations at low zoom and expose exact features when zoomed in.

## Feature contract for the first release

1. Aligned FASTA, Stockholm and CLUSTAL import; explicit protein/DNA/RNA modes, optional detection with an override; local file, string and URL loading. Detect gzip by bytes. Remote CORS and fetch failures must explain recovery through local file import.
2. Two-dimensional navigation and virtualization, overview, zoom, coordinate jumps, keyboard navigation, row search, literal motif search, reference pinning, stable sorting, filtering and range selection.
3. Consensus, gap fraction, modal-residue frequency and frequency-logo tracks. Information-content logos are a later extension; label frequency logos explicitly. Support exact-match/difference coloring relative to reference or consensus, plus PAVI's palette choices through a color-scheme registry. Document whether a palette uses fixed residue colors or column context.
4. Per-row and global annotation tracks, variant highlighting, click-to-focus, per-row visibility, type/consequence/disease/phenotype filters, and metadata inspection. Optional interval tracks support host-provided domains and exon boundaries; fetching those data is outside the viewer.
5. Reference identity computed on request; pairwise identity matrix retained for an explicitly selected subset, capped at 200 rows initially. Never start an all-pairs calculation automatically for a large dataset. Show compared-position counts and missing results.
6. FASTA export of all or selected rows/columns, TSV statistics export, SVG/PNG export of a bounded selected region, and serializable view state. Default figure limit is 200,000 cells; explain how to narrow a larger selection. Region exports include coordinate range, legend, statistics definition and source metadata when available. Full-alignment image export is not implicit.
7. Plain JavaScript API, TypeScript declarations, React component, Svelte 5 component and Svelte action, CSS themes, lifecycle cleanup and typed viewport/selection/annotation events. Include a standalone demo, working framework examples and a PAVI data adapter with a documented migration example. Both integrations must support reactive data/options, event callbacks and cleanup; importing during SSR must be safe.

This is a focused viewer release. Tree inference, realignment, sequence editing, 3D structure rendering, external variant lookups, collaboration and hosting are later projects. Existing PAVI backend functions continue to supply annotations.

## Architecture

Use a framework-independent TypeScript core, a canvas renderer with accessible DOM controls, and a thin optional React wrapper. Ship ES modules and a direct-browser module example. Keep the React peer dependency out of the core. A custom element wrapper can follow without changing the engine.

The engine owns immutable alignment data, stable sequence IDs, row-order/filter indices, coordinate maps, annotation indexes and one shared viewport. Rendering only consumes the visible window and overscan. Reference pinning must not duplicate a sequence in statistics. Reordering must not change annotation ownership.

Parse and compute statistics in a cancellable worker using transferable buffers. Encode residues compactly and index annotations by row and interval. Cache statistics by dataset identity, row subset and metric policy, never by the scrolling window. Progressive startup should display the matrix while full statistics are pending; dependent colors/tracks remain visibly pending until ready. Dataset replacement cancels stale worker work.

Start with Canvas 2D, cached glyphs and aggregated overview tiles. Measure before adding WebGL. Preserve a rendering backend boundary, but do not ship an untested GPU path. Accessible DOM labels/controls and a virtualized textual inspection surface accompany canvas; keyboard users can navigate and inspect a cell without needing a pointer.

The adapter accepts PAVI's CLUSTAL alignment and `SeqInfoDict`, preserving embedded/non-coding variants, source IDs, HGVS, species and supplied coordinates. Non-coding/unmapped annotations remain inspectable with an explicit mapping status; they must not be placed at an invented protein position. The host supplies disease/phenotype annotation metadata separately. An adapter should not import Next.js server actions or fetch Alliance data implicitly.

## Scientific and coordinate contract

- Public coordinates are 1-based inclusive with explicit `alignment` or `sequence` space and sequence ID where needed. Internal arrays use 0-based indices; conversion is centralized and tested. Genomic coordinates stay metadata unless the host supplies a mapping.
- Every input row must have the same aligned length. Reject malformed alignments with a useful row/line diagnostic. Do not silently pad, delete or deduplicate rows. Retain duplicate display names through unique internal IDs. Repeated Stockholm blocks append to the same sequence; repeated FASTA records remain separate records.
- Normalize `.` and `-` as gaps for calculations while retaining source data for provenance. Lowercase residues compare case-insensitively; retain case in original input. Preserve supported Stockholm annotations and source headers in the model. A3M insertion semantics are not supported by the aligned FASTA parser and must not be silently interpreted as ordinary aligned columns.
- Default statistics scope is all loaded rows and does not change when scrolling or visually hiding rows. Explicitly choosing a filtered-row scope recomputes statistics and updates its visible label. Default weighting is one vote per row; no implicit phylogenetic weighting or deduplication.
- Gap fraction = gap count / row count. Modal-residue frequency = largest non-gap symbol count / non-gap count. Consensus support = largest non-gap symbol count / all rows. Show both coverage and frequency so a sparsely occupied column cannot look well-supported without context.
- Ambiguity symbols are counted literally and separately; do not distribute B/Z/X/N across possible residues. The inspector shows their counts. Ties produce an explicit ambiguous/tied consensus state, not input-order-dependent winners. An all-gap column has undefined modal frequency and consensus, displayed as unavailable rather than 0% conservation.
- Pairwise identity compares only columns with canonical residues in both sequences; gaps, ambiguity and stop symbols are excluded. Report matches, compared columns and fraction. No comparable positions returns unavailable. Reference-identity sorting uses the same rule.
- Frequency logos show each non-gap symbol's frequency with gap fraction alongside. Label the alphabet and denominator; avoid implying information content or functional importance.
- Annotation filters affect annotation visibility, not underlying alignment statistics. Missing disease/phenotype metadata is unknown, not negative. Expose excluded/unknown counts when filtering. A variant mapped to one sequence is never presented as an observed variant in orthologs.

## Performance goals and validation

These are proposed acceptance targets, not achieved performance claims. Record hardware, browser, dataset dimensions, annotation count, warm/cold state and measurements with every report.

- Functional fixture: real CBS seed (838 x 160), small protein/DNA/RNA fixtures and PAVI-shaped variant fixtures.
- Primary performance fixture: 10,000 rows x 1,000 columns; wide fixture: 1,000 x 10,000; many-row fixture: 50,000 x 300. Include a dense annotation case with 100,000 features. Synthetic fixtures must be labeled as synthetic.
- Reference machine: a contemporary desktop with at least 16 GB RAM; capture its exact model rather than claiming device-independent guarantees. Measure Chrome first, then Firefox and Safari compatibility.
- Target first usable matrix within 5 seconds after bytes are available for the primary fixture; target p95 interaction frame time below 33 ms during a scripted 10-second pan/scroll after loading. Target incremental peak memory below 512 MiB for the primary fixture, with measurement method recorded. If a browser lacks reliable memory instrumentation, report that limitation rather than asserting a pass.
- The number of rendered row controls and residue draw operations per frame must be bounded by viewport size. Overview and whole-dataset preprocessing are separately measured, cancellable jobs.
- Exact statistics and coordinates tested with hand-computable gappy, tied, ambiguous and all-gap fixtures. Regression checks cover scrolling without statistic changes, row reordering without variant movement, and filtered scopes.
- Browser checks cover zoom anchoring, linked tracks, keyboard selection, resize/high-DPI rendering, import failures, worker cancellation, multiple simultaneous viewer instances, cleanup, export and React integration. No performance claim based only on a small demonstration.

## Delivery sequence

1. Approve the design, then write an implementation plan and produce a real-data UI slice to assess visual hierarchy and interaction.
2. Implement the core model, parsers, coordinate mapping, tests and scalable viewport; benchmark before adding the full inspector.
3. Add PAVI annotation interactions, summary tracks, search/filtering and large-data safeguards.
4. Complete export, adapters, API documentation, accessibility checks and measured performance report.

Naming, package availability, license choice and publication destination can be settled before release. The builder can choose build/test tooling and folder structure. No package publication, deployment, PAVI edits or git history changes are authorized by this proposal.
