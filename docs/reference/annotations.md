# Annotations

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
- With an alignment loaded, opening or dropping `.gff`, `.gff3`, `.bed`, `.gb`, `.gbk`, `.genbank` or `.embl` files (optionally `.gz`) imports annotations instead of replacing the alignment. A `.json` file does the same when it is UniProt JSON (`isUniProtJson(text)`: a `features` array on the entry, on every list element or on every `results` element). Other JSON is refused with an error.

### Export annotations

```ts
import { exportAnnotationsGff3, exportAnnotationsTsv, exportAnnotationsJson } from '@nuin/msa-canvas';
const warnings: string[] = [];
const gff = exportAnnotationsGff3(alignment, { filter: viewer.getState().annotationFilter, warnings });
const tsv = exportAnnotationsTsv(alignment, { annotations: subset });
const json = exportAnnotationsJson(alignment);
```

- Options (`AnnotationExportOptions`): `annotations` (default all of `alignment.annotations`), `filter` (an `AnnotationFilter`, applied when `annotations` is omitted), `coordinates` (GFF3 only: `'sequence'` default, or `'alignment'`), `seqid` (GFF3 only: `'name'` default, or `'id'`; rows whose name is shared by several rows always use their id, with a warning, and a leading `#` or `>` in a name is percent-encoded) and `warnings` (an array that receives skip messages).
- The Explorer's Export menu entries (Annotations · GFF3, TSV, JSON) write the annotations visible under the active filter.
- Coordinates are 1-based inclusive. Sequence coordinates count ungapped residues from 1 at the first residue of the row; row offsets such as `seqA/51-120` are not applied, as on import. Alignment columns are always present in TSV and JSON.
- GFF3 skips unmapped annotations, annotations without a row and annotations whose columns are all gaps in their row, with one warning each. TSV and JSON list them with empty (TSV) or null (JSON) coordinates.
- GFF3 with `coordinates: 'sequence'` read by `importAnnotations` returns the same mapped annotations. Columns that are gaps at an annotation's edge shrink it to its first and last residue.

## Variants

A variant is an `Annotation` with `metadata.variant = { ref?, alt?, type, hgvs?, consequenceClass }`. `isVariant(annotation)` is true when `metadata.variant` exists or `kind` is `variant`, `substitution`, `deletion`, `insertion`, `delins`, `duplication`, `frameshift`, `missense` or `nonsense` (any case). Annotations supplied that way, `fromPavi` output and `addVariants` results all count.

```ts
import { variantsToAnnotations, parseHgvsProtein } from '@nuin/msa-canvas';
const { annotations, warnings } = viewer.addVariants([
  { rowId: 'human', hgvs: 'NP_000537.3:p.Arg175His' },
  { rowId: 'human', position: 248, ref: 'R', alt: 'W', consequence: 'missense_variant', disease: true },
  { rowId: 'mouse', position: 12, end: 14, type: 'deletion' },
], { coordinates: 'sequence' });
// Pure form, no viewer: variantsToAnnotations(alignment, variants, options)
parseHgvsProtein('p.Arg123ProfsTer5'); // { start: 123, end: 123, ref: 'R', alt: 'P', type: 'frameshift', consequence: 'frameshift_variant' }
```

- `VariantInput`: `rowId` (required), `id`, `position`, `end`, `ref`, `alt`, `type`, `consequence` (a string or an array of Sequence Ontology terms), `hgvs`, `label`, `disease`, `phenotype`, `color`, `metadata`. HGVS fills fields left out: position, end, ref, alt, type and consequence.
- `coordinates: 'sequence'` (default) counts ungapped residues from 1 at the first residue of the row, without row offsets, as `importAnnotations` does. `'alignment'` uses alignment columns.
- An unknown `rowId`, a missing position or a position past the row gives `mapping: 'unmapped'` and a warning. The unknown row ID is kept in `metadata.rowId`.
- A `ref` that disagrees with the row residue adds a warning and the variant still maps. A two-letter `ref` from an HGVS range is checked against the first and last residue.
- Missing IDs become `${rowId}:${hgvs || position}:${index}`. IDs are unique within a call and do not collide with existing annotations; a repeated explicit ID gets a `:n` suffix and a warning.
- `addVariants` adds the annotations as `addAnnotations` does, returns `{ annotations, warnings }` and shows the count and the first warnings in the message area.
- `fromPavi` maps PAVI variants through the same helpers: `type` comes from `seq_substitution_type`, `hgvs` from `hgvs_protein`, positions from `alignment_start_pos` and `alignment_end_pos`.

`parseHgvsProtein(text)` reads protein HGVS with three-letter or one-letter residues, optional parentheses and an optional accession prefix: substitutions (`p.Arg123Trp`, `p.R123W`), stops (`p.Arg123Ter`, `p.Arg123*`, `p.R123X`), synonymous (`p.Arg123=`), frameshifts (`p.Arg123fs`, `p.Arg123ProfsTer5`), deletions (`p.Arg123del`, `p.Arg123_Lys125del`), insertions (`p.Lys2_Leu3insGln`), delins (`p.Arg123delinsTrpGly`) and duplications (`p.Arg123dup`). It returns `{ start, end, ref, alt, type, consequence }` or `null`. Extensions (`ext`), unknown effects (`p.?`) and nucleotide HGVS are not parsed.

### Consequence classes and colors

`consequenceClass(consequences, type?)` picks the most severe class from Sequence Ontology terms, case-insensitive. The type decides when no term matches: `frameshift` gives frameshift, in-frame types give inframe.

| Class | Terms | Color (Okabe-Ito) |
|---|---|---|
| `nonsense` | `stop_gained` | vermillion `#D55E00` |
| `frameshift` | `frameshift_variant` | reddish purple `#CC79A7` |
| `missense` | `missense_variant` | blue `#0072B2` |
| `inframe` | `inframe_insertion`, `inframe_deletion`, `protein_altering_variant` | orange `#E69F00` |
| `splice` | `splice_*` | sky blue `#56B4E9` |
| `synonymous` | `synonymous_variant`, `stop_retained_variant`, `start_retained_variant` | bluish green `#009E73` |
| `other` | anything else | grey `#999999` |

`variantColors` exports the table. A variant cell is outlined in its `color` when that is a six-digit hex color, else in its class color; other annotations keep `#a63d59`. SVG and PNG figures use the same colors. The Colors tab lists the classes when the alignment has variants.

### Variant track and navigation

- The `variants` track sits directly above the pinned reference row, below the other tracks. It shows one marker per mapped variant that passes the annotation filter on a shown row. Markers are diamonds (substitutions, missense, other), triangles (deletions), chevrons (insertions and duplications) and squares (frameshift and nonsense), filled with the class color.
- Overlapping variants stack in lanes of 12 px, at most 8. The track label shows `+n` for the variants beyond the eighth lane. Below 9 px cell width markers merge into 4 px bins per lane. Hidden columns and the reverse-complement view apply as in the other tracks.
- Hover a marker for its annotation card. Click it to select the variant's columns and row, scroll to the row (expanding a collapsed group) and pin the card. The overview strip shows a tick per variant in its class color.
- `viewer.nextVariant(direction = 1)` selects the next (`1`) or previous (`-1`) shown variant, ordered by start column then display row, wrapping around, and returns the annotation or `null`. Variants whose columns are all hidden are skipped. `]` and `[` do the same on the focused grid, and the secondary toolbar has **Previous variant** and **Next variant** buttons with a `k / n` counter.
- `focusFirstVariant: true` selects and reveals the first variant after each load, unless a view link sets the view.
- `visibility.variantTrack` and `visibility.variantNav` turn the track and the buttons off. The buttons are hidden when the alignment has no mapped variants.
