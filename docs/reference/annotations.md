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
