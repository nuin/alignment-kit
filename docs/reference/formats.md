# Input formats and parser warnings

## Input formats

`parseAlignment` accepts aligned FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF and PIR/NBRF, detected from the content (or forced with `options.format`). PHYLIP may be sequential or interleaved, with relaxed or strict 10-character names. NEXUS reads the MATRIX of a DATA or CHARACTERS block, honoring FORMAT `datatype`, `gap`, `missing`, `matchchar` and `interleave`, quoted names and `[comments]`; missing characters (`missing`, default `?`) become gaps and `matchchar` expands to the first row's residue. MSF (GCG) reads `Name:` lines and turns `.` and `~` into gaps. PIR reads `>P1;ID`, the description line (may be empty) and sequence lines up to `*`; a file whose first record has no line ending in `*` is read as FASTA. `createAlignment` accepts `{ id?, name, sequence, species?, metadata? }[]`. All sequences must have equal aligned lengths. FASTA records with duplicate display names are retained; supplied IDs must be unique. Interleaved blocks must be separated by blank lines, contain the same row names and have equal chunk widths within each block. Stockholm GF/GS/GC/GR annotations are retained and coordinate lengths validated.

A3M insertion notation is unsupported. Known `.a3m` files/URLs are rejected. Anonymous strings cannot reliably distinguish lowercase A3M insertions from lowercase aligned FASTA: callers must provide rectangular aligned input. Case is preserved in source rows and normalized for comparisons. `.` and `-` are gaps.

## Parser warnings

Recoverable problems no longer fail a load. The parser repairs them and lists them in `alignment.metadata.warnings` (absent when there are none). Each warning is `{ code, message, line?, rowId? }`; `line` is one-based and `rowId` is the ID the row has in the alignment.

| Code | Case | Repair |
|---|---|---|
| `duplicate-id` | FASTA, PHYLIP or PIR rows with the same name | Later rows get `_2`, `_3` and so on (next free number) |
| `invalid-residue` | FASTA, Stockholm, CLUSTAL, PHYLIP, PIR, MSF or NEXUS characters other than letters, `*`, `-` and `.` | Replaced by `N` for nucleotide input, `X` otherwise (the `alphabet` option decides when given); one warning per row |
| `unequal-length` | Rows of different length, only with the `padShort` parse option (FASTA, PIR, MSF) | Short rows padded with trailing gaps; without `padShort` the load still fails |
| `unknown-stockholm-tag` | A `#=GF`, `#=GS`, `#=GR` or `#=GC` tag outside the Stockholm standard set, or a `#=` line of another kind | Kept in `metadata.stockholm` (or `metadata.headers`); one warning per tag |

The viewer shows a warnings badge in the status bar (`visibility.warnings`). Clicking it lists the warnings in the message area, also when `visibility.messages` is off. The `warnings` event fires after each load (not after `removeRows` or an alphabet switch) with the same list, and `getWarnings()` returns the current list. `removeRows` drops the warnings of the removed rows. A strict PHYLIP name that fills all 10 characters is read as is with no warning, because a longer name would have shifted the sequence columns and failed the load. Stockholm export writes back comments and every `#=GF`, `#=GS`, `#=GR` and `#=GC` line, cut to the exported rows and columns.
