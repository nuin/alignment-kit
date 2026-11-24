# Standalone functions and types

Every export of `@nuin/msa-canvas` is listed on this page, grouped by source module. The functions need no viewer and no DOM, except `createViewer` and `exportPng`, which need a browser. The rest run in Node 22, Deno and workers.

```ts
import { parseAlignment, calculateStats, consensusSequence } from '@nuin/msa-canvas';

const alignment = parseAlignment('>a\nAC-G\n>b\nACTG', { alphabet: 'dna' });
const stats = calculateStats(alignment);
consensusSequence(stats, alignment.alphabet); // 'ACTG'
```

Three rules hold for every function:

- A `column`, `start` or `end` argument is a one-based, inclusive alignment column unless its row says otherwise.
- A `row` argument is a zero-based index into `alignment.rows`. A `rowId` argument is the stable `id` of a row.
- Invalid input throws an `Error` with a readable message. Parsers also record repairs in `metadata.warnings`.

`tests/docs-api.test.ts` compares this page with `src/index.ts` and fails when an export is missing.

## Viewer

| Export | Purpose |
|---|---|
| `createViewer(element, options?)` | Create an `AlignmentViewer` inside `element`. Needs a browser. See [API, events and controls](api.md) |
| `AlignmentViewer` | The viewer class. `new AlignmentViewer(element, options?)` equals `createViewer` |
| `parseViewerConfig(input)` | Validate a JSON string or a parsed object and return a `ViewerConfig`. Throws on an unknown key, a wrong type or a value out of range. See [Configure from a JSON file](configuration.md#configure-from-a-json-file) |
| `defaultVisibility` | Frozen object with the default of every `ViewerVisibility` key: all `true` except `logo`, `entropy` and `quality` |

## Model (`model.ts`)

| Export | Purpose |
|---|---|
| `createAlignment(sequences, options?)` | Build an `Alignment` from `{ name, sequence, id?, species?, metadata? }` records. `options` takes `name`, `alphabet`, `annotations` and `metadata`. Throws for no rows, an empty first row or more than 250 million cells |
| `alignmentToSequence(alignment, row, column)` | Ungapped position (from 1) of the residue at `column`, or `null` in a gap. Ignores the row offset |
| `sequenceToAlignment(alignment, row, position)` | Alignment column of ungapped position `position`, or `null` when the row is shorter |
| `rowOffset(row)` | Number of the first residue of a row: `metadata.start` when it is a positive integer, else 1 |
| `columnToResidue(alignment, row, column)` | Residue number at `column` with the row offset applied, or `null` in a gap |
| `residueToColumn(alignment, row, residue)` | Alignment column of a residue number with the row offset applied, or `null` |
| `detectAlphabet(alignment)` | `{ alphabet, other }` suggested by the residues. Nucleotide means at least 90% of non-gap residues are A, C, G, T, U or N. `other` is the fraction outside that set |

## Parsing (`parsers.ts`)

| Export | Purpose |
|---|---|
| `parseAlignment(text, options?)` | Parse aligned FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF or PIR into an `Alignment`. `options` is a `ParseOptions`. See [Input formats](formats.md) |
| `readAlignmentInput(input)` | Resolve a string, `Blob` or `ArrayBuffer` to text. Detects gzip by the bytes `1f 8b` and decodes UTF-8 strictly. Gzip needs `DecompressionStream` |

## Statistics (`analysis.ts`, `summary.ts`)

| Export | Purpose |
|---|---|
| `calculateStats(alignment, rows?)` | Per-column counts, gaps, consensus, modal frequency, support, entropy, information and quality as an `AlignmentStats`. `rows` limits the rows by index |
| `columnDetail(stats, column)` | One column of an `AlignmentStats` as a `ColumnDetail` with residue counts sorted by count. `NaN` values become `null` |
| `pairwiseIdentity(alignment, rowA, rowB)` | `{ matches, compared, identity }` over columns where both rows hold a canonical residue |
| `pairwiseMatrix(alignment, rows)` | `Identity[][]` for up to 200 distinct row indexes |
| `consensusSequence(stats, alphabet, threshold?, start?, end?)` | Consensus string over `start` to `end`. Columns below `threshold` (0 to 1, default 0) become X or N |
| `summarizeColumns(alignment, scope?)` | Column class counts, gap fraction, identity estimates and GC per row as an `AlignmentSummary`. `scope` is a `ColumnScope` |
| `variableColumns(alignment, scope?)` | Columns with two or more distinct residues as a `VariableColumnResult` |
| `MAX_VARIABLE_COLUMNS` | `50000`, the default `limit` of `variableColumns` |

[Coordinates and statistics](statistics.md) defines each statistic and its denominator.

## Colors (`colors.ts`)

| Export | Purpose |
|---|---|
| `registerColorScheme(scheme)` | Add or replace a `ColorScheme`. The `id` takes letters, digits, underscores and hyphens. Colors are 3 or 6 digit hex values |
| `getColorScheme(id)` | The registered `ColorScheme` with that `id`. Throws for an unknown `id` |
| `colorSchemes(alphabet?)` | Every registered scheme, `soft` and `soft-nucleotide` first. With `alphabet`, only the schemes that allow it |

## Text and figure export (`export.ts`)

Each function takes an optional `ExportRegion`: `{ rowIds?, start?, end?, columns? }`. The default region is every row and every column.

| Export | Purpose |
|---|---|
| `exportFasta(alignment, region?, options?)` | FASTA text. `options` is a `FastaOptions` |
| `formatFastaRecord(header, sequence, options?)` | One FASTA record with gap removal, case and line width applied |
| `exportClustal(alignment, region?)` | CLUSTAL text in 60-column blocks |
| `exportStockholm(alignment, region?)` | Stockholm 1.0. Input parsed from Stockholm keeps its `#=GF`, `#=GS`, `#=GR` and `#=GC` lines |
| `exportPhylip(alignment, region?, options?)` | PHYLIP with one line per sequence. `options.variant` is `'relaxed'` (default) or `'strict'` (10-character names) |
| `exportNexus(alignment, region?)` | NEXUS `DATA` block |
| `exportStatistics(stats, region?)` | Tab-separated per-column statistics. `region.columns` is a keep mask |
| `exportVariableColumns(result)` | Tab-separated table of a `VariableColumnResult` |
| `exportSvg(alignment, stats, region?, schemeId?, options?)` | SVG figure as a string. Limited to 200,000 cells. `schemeId` defaults to `'soft'` |
| `exportPng(alignment, stats, region?, schemeId?, options?)` | `Promise<Blob>` with a PNG of the same figure. Needs a browser canvas |

The figure `options` object takes `colorMode`, `referenceId`, `matchDisplay`, `colorThreshold` and `consensusThreshold`. Its type, `FigureOptions`, is declared in `src/export.ts` and is not exported by name. See [Export and shareable links](export.md).

## Column masks (`mask.ts`)

| Export | Purpose |
|---|---|
| `computeColumnMask(alignment, options?)` | `Uint8Array` with 1 for a kept column and 0 for a hidden one. `options` is a `MaskOptions`: `{ gapFraction?, allGap?, hidden? }`. The mask never hides every column |
| `hidesEveryColumn(alignment, options?)` | `true` when the gap rules and the manual ranges together hide every column |
| `mergeColumnRanges(ranges)` | Sort `[start, end]` ranges and merge those that overlap or touch |
| `buildColumnMap(mask)` | A `ColumnMap` from display columns to original columns |
| `reverseColumnMap(map)` | The same `ColumnMap` with columns running right to left |

## Strand (`strand.ts`)

| Export | Purpose |
|---|---|
| `complementSequence(sequence, alphabet)` | Complement of a DNA or RNA string, keeping case and gaps. Throws for `'protein'` |
| `reverseComplementSequence(sequence, alphabet)` | Reverse complement of a DNA or RNA string |

## Text view (`textview.ts`)

| Export | Purpose |
|---|---|
| `formatTextView(alignment, options?)` | Plain text blocks as `{ text, rows, omitted }`. `options` is a `TextViewOptions`; `block` is 10 to 200 residues per line, default 60 |
| `TEXT_CELL_LIMIT` | `200000`, the default residue limit of `formatTextView` |

## Annotations (`annotations.ts`, `annotation-import.ts`, `annotation-export.ts`)

| Export | Purpose |
|---|---|
| `AnnotationIndex` | Class built from `Annotation[]`. `query(rowId, start, end)` returns the mapped annotations of a row that overlap the column range |
| `filterAnnotations(annotations, filter)` | `{ visible, unknown, excluded }` for an `AnnotationFilter` |
| `importAnnotations(alignment, text, options?)` | Parse an annotation file and map its features onto rows. Returns `{ annotations, warnings }` and does not change the alignment |
| `detectAnnotationFormat(text)` | `'gff3'`, `'bed'`, `'genbank'`, `'embl'` or `'uniprot'`. Throws when no format matches |
| `parseGff3(text, warnings?)` | GFF3 features as `AnnotationRecord[]` |
| `parseBed(text, warnings?)` | BED features as `AnnotationRecord[]`, converted to one-based inclusive coordinates |
| `parseGenBank(text, warnings?)` | GenBank feature table as `AnnotationRecord[]` |
| `parseEmbl(text, warnings?)` | EMBL feature table as `AnnotationRecord[]` |
| `parseUniProtJson(text, warnings?)` | UniProt JSON features as `AnnotationRecord[]` |
| `isUniProtJson(text)` | `true` when the text is JSON with a `features` array per entry |
| `exportAnnotationsGff3(alignment, options?)` | GFF3 text. `options` is an `AnnotationExportOptions` |
| `exportAnnotationsTsv(alignment, options?)` | Tab-separated text with every selected annotation |
| `exportAnnotationsJson(alignment, options?)` | JSON text with the alignment identity and one object per annotation |
| `validateAnnotationLinks(value)` | Check that every URL template is `http` or `https` and holds `{id}`. Returns a copy with lower-case keys |

The viewer method `importAnnotations(text, options?)` also adds the result to the viewer. See [Annotations](annotations.md).

## Variants (`variants.ts`)

| Export | Purpose |
|---|---|
| `variantsToAnnotations(alignment, variants, options?)` | Turn `VariantInput[]` into annotations with `metadata.variant`. Returns `{ annotations, warnings }` |
| `parseHgvsProtein(text)` | Parse a protein HGVS change such as `p.Arg123Trp` into an `HgvsProtein`, or `null` |
| `consequenceClass(consequences?, type?)` | The `VariantClass` of a list of Sequence Ontology terms, most severe first |
| `isVariant(annotation)` | `true` when the annotation carries `metadata.variant` |
| `variantColors` | Okabe-Ito hex color per `VariantClass` |
| `variantClassLabels` | Display label per `VariantClass` |
| `assignLanes(spans, max?)` | Place `{ start, end }` spans into lanes with no overlap. Returns `{ lanes, count, overflow }`; a span that fits no lane gets `-1` |

## Trees and tracks (`tree.ts`, `tracks.ts`)

| Export | Purpose |
|---|---|
| `parseNewick(text)` | Parse one Newick tree into a `TreeNode` |
| `leafOrder(root)` | Leaf names from top to bottom |
| `validateTrack(input, json?)` | Check one `CustomTrack` definition and return a shallow copy. `json: true` rejects functions and typed arrays |

## Search (`search.ts`)

| Export | Purpose |
|---|---|
| `compilePattern(pattern, options)` | Compile a motif into a global, case-insensitive `RegExp`. `options` is `{ alphabet, mode? }`. Patterns are limited to 500 characters |
| `findHits(alignment, pattern, options?)` | Every match as a `SearchResult`. Stops at 10,000 hits or after 2 seconds and then sets `truncated` |

See [Motif search](search.md) for the pattern syntax.

## View links (`link.ts`)

| Export | Purpose |
|---|---|
| `encodeViewLink(state, source?)` | URL parameters for a `ViewState`, such as `sel=50-60&row=seq-3&scheme=soft`. Defaults are left out |
| `decodeViewLink(input)` | Parse a fragment or query string into a `ViewLink`. Malformed parameters are named in `ignored` |
| `isViewLink(input)` | `true` when a fragment or query holds at least one link parameter |

## PAVI import (`@nuin/msa-canvas/pavi`)

`fromPavi` converts PAVI output into an `Alignment` with variant annotations. It has its own entry point, and npm publishes it. The JSR package does not include it.

```ts
import { fromPavi, type PaviSequenceInfo } from '@nuin/msa-canvas/pavi';
import { createViewer } from '@nuin/msa-canvas';

const info: Record<string, PaviSequenceInfo> = {
  'transcript-1': {
    species: 'Homo sapiens',
    embedded_variants: [{
      variant_id: 'var-1', alignment_start_pos: 3, alignment_end_pos: 3,
      seq_substitution_type: 'substitution', hgvs_protein: 'p.Ala3Val',
      molecular_consequences: ['missense_variant'],
    }],
  },
};
const alignment = fromPavi('>transcript-1\nMKAL\n>transcript-2\nMKVL', info, { 'var-1': { hasDisease: true } });
await createViewer(element).setAlignment(alignment);
```

| Argument | Type | Contents |
|---|---|---|
| `text` | `string` | The alignment text PAVI returns. `fromPavi` parses it as protein with `parseAlignment` |
| `info` | `Record<string, PaviSequenceInfo>` | Variant info per sequence. The key is the first word of the sequence name |
| `annotationInfo` | `Record<string, { hasDisease?, hasPhenotype? }>` | Optional disease and phenotype flags per `variant_id` |

`fromPavi` returns an `Alignment`. For each row with an `info` entry it does three things:

1. It sets `row.species` and copies the entry into `row.metadata` with a `sourceId` field.
2. It reads `embedded_variants` and `non_coding_variants`.
3. It adds one annotation per variant. A variant with integer `alignment_start_pos` and `alignment_end_pos` is mapped to those columns. Any other variant is added with `mapping: 'unmapped'`.

| Type | Fields |
|---|---|
| `PaviVariant` | `variant_id`, `alignment_start_pos?`, `alignment_end_pos?`, `seq_start_pos?`, `seq_end_pos?`, `seq_substitution_type?`, `hgvs_protein?`, `molecular_consequences?`, plus any other key |
| `PaviSequenceInfo` | `species?`, `embedded_variants?`, `non_coding_variants?`, `requested_variant_ids?`, `error?` |

## Framework entries

| Export | Entry | Purpose |
|---|---|---|
| `AlignmentViewer` | `@nuin/msa-canvas/react` | React component. Props are `AlignmentViewerProps` |
| `AlignmentViewerProps` | `@nuin/msa-canvas/react` | `IntegrationProps` plus `className`, `style` and `id` |
| `alignmentViewer` | `@nuin/msa-canvas/svelte` | Svelte action that takes an `IntegrationProps` object |
| `IntegrationProps` | both | `alignment`, `options`, `onReady`, `onSelectionChange`, `onViewportChange`, `onAnnotationClick`, `onHover`, `onCellClick`, `onError`, `onSearch`, `onWarnings` |

See [React, Svelte, workers and Deno](frameworks.md).

## Types

Every type is exported from `@nuin/msa-canvas` as a type-only export. `src/types.ts` carries the field comments, and `npm run docs:api` renders them with TypeDoc.

### Data

| Type | Meaning |
|---|---|
| `Alphabet` | `'protein'`, `'dna'` or `'rna'` |
| `SequenceInput` | Input row for `createAlignment`: `name`, `sequence`, optional `id`, `species`, `metadata` |
| `Sequence` | A `SequenceInput` with a required `id` |
| `Alignment` | `id`, `name`, `alphabet`, `width`, `rows`, `codes`, `annotations`, `metadata` |
| `AlignmentMetadata` | `format`, `warnings`, `source`, `headers`, `stockholm` and free keys |
| `Provenance` | `url`, `retrieved`, `sha256`, `description` of a source file |
| `ParseOptions` | `padShort`, `name`, `alphabet`, `format`, `source` |
| `ParseWarning` | `{ code, message, line?, rowId? }` |
| `ParseWarningCode` | `'duplicate-id'`, `'invalid-residue'`, `'unequal-length'` or `'unknown-stockholm-tag'` |
| `Annotation` | `id`, `label`, `mapping`, optional `rowId`, `start`, `end`, `kind`, `consequence`, `disease`, `phenotype`, `color`, `metadata` |
| `AnnotationFilter` | `types`, `consequences`, `disease`, `phenotype`, `hiddenRowIds` |
| `AnnotationFormat` | `'gff3'`, `'bed'`, `'genbank'`, `'embl'` or `'uniprot'` |
| `AnnotationRecord` | One parsed feature: `seqid`, `start`, `end`, `kind`, `label`, `metadata` |
| `AnnotationImportOptions` | `format`, `rowId`, `coordinates` |
| `AnnotationImportResult` | `{ annotations, warnings }` |
| `AnnotationExportOptions` | `annotations`, `filter`, `coordinates`, `seqid`, `warnings` |
| `AnnotationLinks` | `Record<string, string>` of URL templates with `{id}` |

### Statistics and search

| Type | Meaning |
|---|---|
| `AlignmentStats` | Typed arrays per column: `counts`, `gaps`, `consensus`, `frequency`, `support`, `entropy`, `information`, `quality` |
| `ColumnDetail` | One column of the statistics with `null` in place of `NaN` |
| `Identity` | `{ matches, compared, identity }`; `identity` is `null` when `compared` is 0 |
| `ColumnScope` | Scope of a standalone summary: `rows`, `start`, `end`, `reference`, `limit` |
| `SummaryOptions` | Scope of a viewer summary: `rows` (`'all'` or `'filtered'`), `start`, `end`, `referenceId`, `limit` |
| `AlignmentSummary` | Column class counts, `gapFraction`, `meanPairwiseIdentity`, `identityToReference`, `rowGc` |
| `VariableColumn` | `column`, `referenceResidue`, `reference`, `alleles`, `gapCount`, `kind` |
| `VariableColumnResult` | `{ columns, total, truncated }` |
| `AlleleCount` | `{ residue, count }` |
| `RowGc` | `{ id, name, gc, bases }` |
| `SearchMode` | `'auto'`, `'literal'`, `'iupac'`, `'regex'` or `'prosite'` |
| `SearchOptions` | `mode`, `strands`, `rows`, `limit` |
| `Hit` | `rowId`, `row`, `start`, `end`, `seqStart`, `seqEnd`, `strand`, `match` |
| `SearchResult` | `{ hits, truncated }` |

### Viewer

| Type | Meaning |
|---|---|
| `ViewerOptions` | Constructor and `setOptions` argument. See the [options table](api.md#options) |
| `ViewerConfig` | `ViewerOptions` without `alignment`, with `workerUrl` as a string. The result of `parseViewerConfig` |
| `ViewerVisibility` | 80 optional boolean switches. See [Configure the interface](configuration.md#configure-the-interface) |
| `ViewState` | Serializable view from `getState()`, with `version: 1` |
| `ViewLink` | View fields a shareable link carries |
| `Selection` | `{ start, end, rowId? }` |
| `Viewport` | `start`, `end`, `firstRow`, `lastRow`, `visibleRows`, `totalRows` |
| `CellInfo` | `{ rowId, column, residue, position }` for the `hover` event |
| `CellClick` | `CellInfo` plus `shiftKey` for the `cellclick` event |
| `ViewerEvents` | Map from event name to payload type |
| `ViewerEvent` | Union of the event names |
| `EventHandler` | `(event) => void` for one event name |
| `SortKey` | `'input'`, `'name'`, `'identity'`, `'gaps'`, `'length'`, `'residue'`, `'annotations'`, `'manual'` or `'tree'` |
| `ColorMode` | `'all'`, `'reference-differences'`, `'reference-matches'`, `'consensus-differences'` or `'consensus-matches'` |
| `RulerCoordinates` | `'alignment'` or `'reference'` |
| `ColorScheme` | `id`, `label`, `description`, `colors`, optional `alphabets`, `classes`, `cvdSafe`, `highContrast` |
| `CustomTrack` | `id`, `label`, `type`, optional `height`, `values`, `domain`, `color`, `render` |
| `TrackType` | `'bar'`, `'heatmap'`, `'text'` or `'custom'` |
| `TrackRenderInfo` | Argument of a custom track `render` function |
| `ColumnMark` | `{ start, end, color }` |
| `MarkRange` | A column number or a `[start, end]` pair |
| `ColumnRange` | `[start, end]`, one-based and inclusive |
| `ColumnMap` | Display to original column map: `width`, `count`, `mask`, `cols`, `before`, `edges`, `reversed` |
| `MaskOptions` | `{ gapFraction?, allGap?, hidden? }` |
| `TreeNode` | `{ name, length, support, children }` |

### Export and variants

| Type | Meaning |
|---|---|
| `ExportOptions` | `{ columns?: 'all' or 'visible' }`, default `'all'` |
| `FastaOptions` | `gaps`, `letterCase`, `lineWidth`, `header`, `orientation`, and the deprecated `columns` |
| `ExportRegion` | `{ rowIds?, start?, end?, columns? }` |
| `TextViewOptions` | `rows`, `columns`, `block`, `reverse`, `flagged`, `limit` |
| `TextView` | `{ text, rows, omitted }` |
| `VariantInput` | A variant to place on a row: `rowId`, optional `position`, `end`, `ref`, `alt`, `type`, `consequence`, `hgvs`, `label` and flags |
| `VariantOptions` | `{ coordinates?: 'sequence', 'residue' or 'alignment' }`, default `'sequence'` |
| `VariantResult` | `{ annotations, warnings }` |
| `VariantInfo` | The record stored in `annotation.metadata.variant` |
| `VariantClass` | `'nonsense'`, `'frameshift'`, `'missense'`, `'inframe'`, `'splice'`, `'synonymous'` or `'other'` |
| `VariantType` | `'substitution'`, `'deletion'`, `'insertion'`, `'delins'`, `'duplication'`, `'frameshift'` or `'other'` |
| `HgvsProtein` | Parsed protein HGVS change: `start`, `end`, `ref`, `alt`, `type`, `consequence` |
