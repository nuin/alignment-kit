# Coordinates and statistics

## Coordinates and statistics

Public positions are **1-based, inclusive alignment columns**. Sequence coordinates require a row identity and count only non-gap symbols. Use `alignmentToSequence(alignment, rowIndex, column)` and `sequenceToAlignment(alignment, rowIndex, position)`; a gap maps to `null`.

### Reference ruler and residue go-to

`rulerCoordinates: 'reference'` (or the **Ruler** menu, **Reference residues**) labels the ruler with the ungapped residue numbers of the pinned reference row instead of alignment columns. Columns where the reference has a gap get no number or tick. Labels fall on multiples of the tick step, plus the first residue. The Position tab shows both the alignment column and the reference residue number.

A row starts counting at `row.metadata.start` when that is a positive integer, otherwise at 1. The Stockholm parser sets it from names of the form `NAME/START-END` (START at least 1 and not above END) and does not rename the row. Reverse-strand ranges (START above END) are not numbered backwards. This numbering applies to the ruler, the Position tab and go-to; `alignmentToSequence` and `sequenceToAlignment` stay offset-free.

### Which APIs apply the row offset

| Uses `metadata.start` (residue numbers) | Uses raw positions (1-based, ungapped, first residue is 1) |
|---|---|
| Reference ruler, Position tab, **Go to** and `goToResidue` | `alignmentToSequence`, `sequenceToAlignment` |
| `columnToResidue`, `residueToColumn`, `rowOffset` (exported) | Search hits: `Hit.seqStart`, `Hit.seqEnd` and the hit message |
| | `importAnnotations` and `viewer.importAnnotations` with `coordinates: 'sequence'`; parser records (`parseGff3` and the others) keep the file's numbers |

For a row with `metadata.start` 51, residue 51 is raw position 1. Convert a raw position with `position + rowOffset(row) - 1`. An annotation file that numbers a Stockholm `seqA/51-120` row from 51 needs its positions shifted by `rowOffset(row) - 1` before import, or `coordinates: 'alignment'`.

The **Go to** box accepts `123` (an alignment column, or a reference residue number when the ruler is in reference mode) and `rowIdOrName:45` (residue 45 of that row; the ID is tried before the name, and the last `:` splits the text). Out-of-range numbers and unknown rows show a message. `goToResidue(rowId, position)` does the same by row ID. The view link carries `ruler=ref` in reference mode, and `getState()` includes `rulerCoordinates`. Hide the menu with `visibility.rulerCoordinates`.

Statistics default to all loaded rows. Scrolling, pinning a reference and visually filtering rows do not change that scope. Select **Filtered sequences** explicitly to recompute for a subset. Each row receives one vote; no deduplication, phylogenetic weighting or sampling is implicit.

| Quantity | Definition |
|---|---|
| Gap fraction | Gap count / rows in statistics scope |
| Modal frequency | Largest non-gap symbol count / non-gap rows |
| Consensus support | Largest non-gap symbol count / all scoped rows |
| Percent identity | Rows carrying the residue / all scoped rows, per column; shaded by that fraction |
| BLOSUM62 to consensus | Protein only: residues with a positive BLOSUM62 score against the column consensus are colored |
| Consensus | Unique most frequent non-gap symbol; ties are explicit |
| Consensus sequence | Track, export, copy and `getConsensus()`: modal non-gap residue; ties as IUPAC codes (DNA/RNA) or `X`; `X`/`N` below `consensusThreshold` |
| Frequency logo | Literal symbol frequencies among non-gap rows; information content with `logoMode: 'bits'` |
| Entropy | Shannon entropy in bits over non-gap residues, `-sum p log2 p`, using every non-gap symbol including ambiguity codes |
| Information | `max(0, log2 s - (H + e(n)))` with `e(n) = (s - 1) / (2 ln2 n)`, `n` non-gap rows, `s` = 4 (DNA/RNA) or 20 (protein) |
| Quality | Protein only: mean BLOSUM62 score over all pairs of non-gap rows holding one of the 20 standard amino acids, scaled to 0..1 as `(mean + 4) / 15`; NaN for DNA/RNA and for columns with fewer than 2 scored residues |
| Pairwise identity | Exact matches / columns with canonical residues in both rows |

Ambiguity symbols are counted separately and never fractionally distributed. All-gap modal frequency/consensus and identity with zero comparable positions are unavailable. Pairwise identity excludes gaps, ambiguity and stops; it includes matched and compared-position counts. Its matrix is calculated only for selected rows, capped at 200, in a cancellable worker. Selecting **Identity to reference** computes and sorts reference identities; selecting a row then shows its identity and compared-position count.

## Column summary

`getSummary({ rows?, start?, end?, referenceId?, limit? })` returns `AlignmentSummary` and `getVariableColumns(options)` returns `VariableColumnResult`. Both return promises, run in the worker (`worker: false` runs them on the page) and share one cached result per rows, columns and reference. `rows` is `'all'` or `'filtered'` and defaults to the `statisticsScope` option. `start` and `end` are inclusive 1-based columns and default to the whole alignment. `referenceId` defaults to the pinned reference row. A newer request, a load or `destroy()` rejects a pending one with an `AbortError`.

| Field | Meaning |
| --- | --- |
| `conserved` | One residue, no gaps |
| `constantWithGaps` | One residue plus at least one gap |
| `variable` | Two or more distinct residues; gaps are ignored. `singleton + parsimonyInformative = variable` |
| `parsimonyInformative` | At least two residues each seen at least twice |
| `singleton` | Any other variable column |
| `gapOnly` | Every row has a gap |
| `gapFraction` | Gap cells over rows times columns |
| `meanPairwiseIdentity` | Pooled over all row pairs from per-column counts, canonical residues only (A/C/G/T, A/C/G/U, or the 20 amino acids). One pass, no sampling |
| `identityToReference` | Pooled identity of every other row to the reference, as `{ matches, compared, identity }` |
| `rowGc` | DNA and RNA only: `{ id, name, gc, bases }` per row, G+C over A+C+G+T/U in the columns summarized; null for protein |

`VariableColumn` is `{ column, referenceResidue, reference, alleles: [{ residue, count }], gapCount, kind }`. `referenceResidue` honors the row offset and is null where the reference has a gap. Alleles sort by count, then letter, and exclude gaps. The list stops at `limit` (default 50,000); `total` is always exact and `truncated` says whether the list is short. Pure functions `summarizeColumns(alignment, scope)` and `variableColumns(alignment, scope)` take `{ rows (indexes), start, end, reference (index), limit }`, and `exportVariableColumns(result)` writes the TSV.

Limits: the work reads rows times columns cells once (plus one pass each for reference identity and GC), in blocks of 4,096 columns so memory stays flat. The 250 million cell load limit bounds it; on the page thread a full alignment of that size blocks for seconds, so keep the worker on.

The **Summary** inspector tab (`summaryTab`) shows these numbers and a table of 20 variable columns per page. Selecting two or more columns switches it to the selected block: the same counts for those columns, mean identity to the reference and the gap fraction inside the block. **Export > Variable columns (selected block or all) · TSV** writes the table for the selected block (file `variable-columns-<start>-<end>.tsv`) or, with fewer than two columns selected, the whole alignment (`variable-columns.tsv`). `getSummary` and `getVariableColumns` calls run in parallel without cancelling each other; with `statisticsScope: "filtered"` and a filter that matches no rows they reject with "No sequences match the filter". Hidden columns are not excluded from the counts.

Consensus sequence: the modal non-gap residue per column. With a `consensusThreshold` above 0, a column whose modal frequency (among non-gap rows) is below the threshold becomes `X` (protein) or `N` (DNA/RNA). Ties become the IUPAC code covering every tied base for DNA/RNA (A+G is `R`, A+R is `R`, U counts as T; a tie involving `*` becomes `N`) and `X` for protein. All-gap columns stay `-`, so the sequence keeps the alignment width. The consensus track draws these symbols as colored cells; `getConsensus({ threshold? })` returns the full-width sequence and `consensusSequence(stats, alphabet, threshold?, start?, end?)` is exported as a pure function.

Color threshold: `colorThreshold` (0–1) leaves residues uncolored when their column value is below it, for the `conservation` (support) and `percent-identity` (fraction of scoped rows sharing the residue) schemes. `blosum62` ignores it and uses `consensusThreshold` to decide which columns have a consensus. Row filters: `minIdentity` keeps rows with at least that percent identity to the reference (canonical positions, as in the identity sort); `minCoverage` keeps rows with at least that percent non-gap fraction. The tools row has controls for all four, each behind its own `visibility` key.
