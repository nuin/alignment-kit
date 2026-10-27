# Source similarity audit

Checked 2026-10-27 against five source snapshots. No substantial shared implementation block was found by this screening. This supports a bounded statement about these files and comparison methods; it does not prove that all code is globally unique.

The audited local source matches commit `f4a91588447fdfa0dc303b4b3aea897dc2c28ace`, verified against every file hash in the results inventory. Subsequent toolbar, menu and nucleotide-palette changes are outside that recorded snapshot.

## Scope and results

Compared 22 local JS/TS/Svelte-script/CSS files under `src/` (16,484 lexical tokens) against 602 files (318,969 tokens). Local JSON palettes were checked separately as intentionally reused data. Application demos, tests, documentation, fonts, dependencies and build output are outside the local implementation comparison. Upstream source directories include their checked-in tests/examples where present, but not dependency or build directories. PAVI's compared `webui/src` directory is clean relative to its recorded commit.

| Source | Pinned commit | Files | Exact matches ≥12 tokens | Longest exact match | Normalized matches ≥40 tokens |
|---|---|---:|---:|---:|---:|
| [Nightingale](https://github.com/ebi-webcomponents/nightingale/tree/913ca037000ac6048afdf2e68075983c7c779a1e/packages) | `913ca037000ac6048afdf2e68075983c7c779a1e` | 162 | 4 | 12 | 15 |
| [AlignmentViewer 2.0](https://github.com/sanderlab/AlignmentViewer2.0/tree/e59bce84c75e1780b5a73bb8f96041fc4114adac/src) | `e59bce84c75e1780b5a73bb8f96041fc4114adac` | 78 | 15 | 17 | 2 |
| [React MSAViewer](https://github.com/wilzbach/react-msa-viewer/tree/b328927f42eabc19c811588d2ccd9c1fbda424cd/src) | `b328927f42eabc19c811588d2ccd9c1fbda424cd` | 36 | 0 | <12 | 0 |
| [BioJS MSAViewer](https://github.com/wilzbach/msa/tree/6622fe63fc26c75d8d7590321f4e4949ce5a81e5/src) | `6622fe63fc26c75d8d7590321f4e4949ce5a81e5` | 67 | 1 | 12 | 0 |
| PAVI, local `webui/src` | `b730d536b7e5c5aefcb836a273eb2870a864f007` | 259 | 46 | 16 | 2 |

No byte-identical implementation files and no exact contiguous matches of 20 or more tokens were found. Match counts are candidate occurrences, including repeated snippets across several files; they are not percentages of copied code.

## Manual review

The 66 short exact candidates consist of ordinary syntax and common operations: loop headers, nested `Record` types, React effect boundaries, string normalization, sorting callbacks, HTML closing tags, error-to-string conversion, and CSS positioning/ellipsis/flex declarations. Examples include `error instanceof Error ? error.message : String(error)` and `.sort((a, b) => b.count - a.count)`. These snippets are too generic to establish copying.

The 19 normalized candidates are import lists (4 occurrences) and string-valued object-map structures (15 occurrences). Replacing identifiers and literal values erases the differences between unrelated imports or dictionaries. The longest normalized candidate, 52 tokens, compares our palette display-name dictionary to a Nightingale residue-color dictionary. The other candidates similarly do not share application logic. No candidate in these results indicates copied rendering, parsing, worker-analysis or annotation-mapping algorithms.

## Confirmed reuse

All **21 palettes / 339 residue-color entries** in `src/palettes.json` match their Nightingale counterparts after CSS-name/hex/whitespace normalization and the documented `Gap` → `-` key conversion. All 21 upstream Git blob hashes match the records in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). This is intentional reuse with the existing MIT notice; it is not part of the zero-substantial-implementation-match finding.

Bundled IBM Plex fonts and Pfam/Rfam alignment snapshots are also external assets, already identified separately in their license/provenance files. This check does not classify those assets as original implementation.

## Method and limits

The reproducible [screening script](../scripts/similarity-audit.mjs) uses the installed TypeScript scanner for JS/TS and Svelte script content, and a small CSS tokenizer. It strips whitespace and comments. Exact comparison retains spelling and punctuation. Normalized JS comparison replaces identifiers and string/numeric literals, retaining operators and keyword/token kinds; CSS remains literal-token comparison. Rolling hashes find candidate windows, then every token is compared to reject hash collisions. Known-copy, inserted-copy-with-spacing, renamed-variable and negative controls exercise the detector.

Every matched candidate was inspected; all matching local snippets and their upstream contexts are accounted for above. [Machine-readable results](source-similarity-results.json) record file hashes, upstream commit IDs, offsets, line numbers, all candidates and palette checks without embedding upstream source code.

This is contiguous lexical matching, not AST, control-flow, semantic, or internet-wide analysis. It can miss reordered/refactored implementations, matches below the thresholds and historical versions outside these snapshots. Svelte markup is excluded. The scanner is not a full JSX/template/regular-expression parser, so boundaries in those constructs are approximate. The report does not establish independent invention or legal clearance.

To reproduce, clone the four linked repositories, check out their pinned commits, and provide the PAVI checkout at its recorded commit. Create a JSON corpus configuration with entries `{ "name": "...", "root": "/path/to/checkout", "sourceDirs": ["src"], "url": "..." }`. Use `packages` for Nightingale and `webui/src` for PAVI; use Nightingale's canonical repository URL without a trailing slash for palette verification. Then run:

```sh
node scripts/similarity-audit.mjs corpus.json docs/source-similarity-results.json 12 40
```

No viewer implementation was changed as a result of this audit.
