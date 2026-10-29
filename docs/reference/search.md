# Motif search

## Search motifs

The motif box and `search()` accept three syntaxes. Auto mode picks one from the text:

| Text | Mode | Example |
|---|---|---|
| `/.../` | Regular expression | `/N[^P][ST]/` |
| `-` between elements, a whole `x` element, `{...}`, `[...]`, `(n)`, `<` or `>` | PROSITE | `N-{P}-[ST]-{P}` |
| Anything else | IUPAC letters | `ACGNACGG` |

- IUPAC for DNA/RNA: `R Y S W K M B D H V N`; `U` equals `T`. An ambiguity letter in the pattern also matches itself in the data, so `R` matches `A`, `G` and a literal `R`. A lowercase string such as `acx` is IUPAC; `x` is PROSITE only as an element (`x`, `x(2)`, `A-x-G`). For protein: `X` is any residue, `B` is D or N, `Z` is E or Q, `J` is I or L.
- PROSITE: `x` any residue, `[ST]` one of, `{P}` any except, `x(2,4)` repeat, `<` N-terminus, `>` C-terminus, `[G>]` G or C-terminus. A trailing `.` is ignored.
- Regular expressions are case-insensitive and run on each ungapped sequence. Gaps never break a match.
- DNA/RNA searches also scan the reverse complement unless `strands: 'forward'` is set. A site that reads the same on both strands (`ACGT`) is reported once, as `+`.
- Overlapping matches are all reported. The list stops at 10,000 hits or after 2 seconds (`truncated: true`); past the cap each row's scan also stops early.
- The pattern is checked on the main thread. Regexes with a repeated group that contains a repeat, such as `(A+)+B`, or alternatives, such as `(A|AA)+C` or `(?:A|C)*`, are rejected at once; use a character class such as `[AC]+` instead. A group followed by `?` may contain `|`.
- With workers on (the default), the scan runs in a module worker. A regex still running 0.5 s after the 2 second budget, such as `/.*.*.*.*.*.*X/` stuck inside one row, is terminated: `search()` rejects with a `TimeoutError`, the status line reads "Search stopped after 2 s; simplify the pattern.", `error` is emitted and no hits remain. With `worker: false` the scan runs on the main thread. The 2 second budget is then checked only between regex steps, so one slow step can freeze the tab; only the worker path can stop it.
- `search()` returns a Promise. A newer search, `clearSearch()`, `clear()` or a new alignment terminates the running scan and rejects its Promise with an `AbortError`.
- Only the filtered rows are searched; changing the filter or order re-derives the hits from one scan of all rows and emits `search` only when the hit list changes. Loading another alignment or calling `clear()` removes the search, empties the motif box and emits `search` with `null`.

```ts
viewer.search('N-{P}-[ST]-{P}');              // N-glycosylation sequon
viewer.search('ACGNACGG', { strands: 'both' }); // primer with an IUPAC code, both strands
const { hits, truncated } = await viewer.search('/C..C/', { mode: 'regex' });
hits[0]; // { rowId, row, start, end, seqStart, seqEnd, strand: '+' | '-', match }
```

`start` and `end` are alignment columns (1-based, inclusive). `seqStart` and `seqEnd` count residues of the forward sequence from 1 and ignore `metadata.start` (see [Which APIs apply the row offset](statistics.md#which-apis-apply-the-row-offset)). `row` is the zero-based row index into the alignment. `findHits` throws on a `rows` entry outside the alignment and ignores a non-finite `limit`. For a `'-'` hit, `match` is the text found on the reverse complement. Every hit is outlined in the grid (dashed on the reverse strand), the status bar shows the count, and the **Hits** inspector tab lists the first 200. The `hitsTab` visibility key hides the tab. `findHits(alignment, pattern, options)` and `compilePattern(pattern, { alphabet, mode })` run the same engine without a viewer.
