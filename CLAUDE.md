# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@alignment-kit/viewer`: a framework-free, canvas-rendered, virtualized multiple sequence alignment viewer with React and Svelte 5 wrappers. Local package only (`private: true`); nothing is published. Node >= 22.

## Commands

```sh
npm run dev               # Vite demo at http://127.0.0.1:4173 (strictPort); /examples/react/, /examples/svelte/
npm test                  # Vitest, tests/**/*.test.ts (jsdom/node)
npx vitest run tests/core.test.ts -t "name"   # single file / single test
npm run check             # tsc --noEmit + svelte-check
npm run build             # scripts/build.mjs: esbuild bundle + tsc declarations into dist/
npm run build:demo        # Vite build of the 3 demo pages into demo-dist/
npm run test:browser      # Playwright, tests/**/*.spec.ts, chromium + webkit; starts `npm run dev`
npx playwright test tests/viewer.spec.ts --project=chromium   # single browser spec
npm run check:package     # npm pack, extract into a temp consumer, build React/Svelte consumers, SSR checks
npm run check:datasets    # verify demo/public snapshots against hashes/dimensions in alignments.json
npm run benchmark         # Node CPU baseline -> docs/benchmark-results.json (not browser FPS)
npm run preview:files     # self-contained offline HTML demos in .preview/ (blob workers)
```

`*.test.ts` runs under Vitest, `*.spec.ts` under Playwright; the split is by filename suffix. Set `AK_STATIC_PREVIEW` to stop Playwright starting its own dev server.

## Architecture

- `src/viewer.ts` (`AlignmentViewer`, `createViewer`) owns all state: alignment, reference row, filter/sort, selection, annotation filter, event listeners. It builds DOM via `controls.ts`, draws via `renderer.ts` (canvas, virtualized), shows details via `inspector.ts`, and uses `selects.ts` for the themed dropdown menus that replace native `<select>`.
- Data model (`model.ts`, `types.ts`): an `Alignment` stores residues as typed-array `codes` with `width`, `rows` and `alphabet`. Rows have stable IDs; annotations attach to row IDs so they survive sorting, pinning and filtering. Public coordinates are 1-based inclusive alignment columns; `alignmentToSequence` / `sequenceToAlignment` convert, gaps map to `null`.
- Parsing (`parsers.ts`) handles aligned FASTA, Stockholm (GF/GS/GC/GR retained) and CLUSTAL; gzip detected by bytes; A3M is rejected deliberately.
- Analysis (`analysis.ts`) computes column statistics, consensus, logo frequencies and pairwise identity. The statistics definitions and denominators are documented in README "Coordinates and statistics"; tests assert them, so changes there are scientific changes, not refactors.
- Workers: `worker-client.ts` `WorkerTask` runs `parse` / `stats` / `pairwise` / `identity` in `src/worker.js` (a module worker). Each `run` cancels the previous job by terminating the worker. Payloads send a compact alignment (codes only). `worker: false` runs the same functions on the main thread via `setTimeout`; tests use this. The viewer keeps three `WorkerTask`s (parser, analysis, comparison) and revision counters to drop stale results.
- Framework wrappers share one lifecycle controller, `mountViewer` in `integration.ts`. `react.tsx`, the Svelte action `svelte.ts` and `svelte/AlignmentViewer.svelte` are thin shells over it. Imports must stay SSR-safe: no DOM access at module load.
- Colors: `palettes.json` holds the 21 Nightingale palettes (MIT, attributed in THIRD_PARTY_NOTICES.md; blob hashes recorded there). `colors.ts` adds the built-in `soft` / `soft-nucleotide` schemes and `registerColorScheme`. Schemes can be restricted by alphabet.
- `pavi.ts` (`./pavi` export) has `fromPavi`, which converts PAVI alignment text plus per-sequence variant info into an `Alignment` with annotations.
- `export.ts` does FASTA/TSV/SVG/PNG export with the 200,000-cell figure cap.
- Package entry points are listed in `package.json` `exports` and in the esbuild `entryPoints` of `scripts/build.mjs`; add a new entry in both. The build copies `src/svelte/` as source and concatenates `fonts.css` + `style.css` into `dist/style.css`.
- Theming uses `--ak-*` CSS custom properties on `.ak-viewer`.

## Demo data

`demo/public/` holds real Pfam/Rfam Stockholm snapshots (some gzipped) with provenance and SHA-256 hashes in `alignments.json`. Run `npm run check:datasets` after touching any of them. `demo/fixtures.ts` holds synthetic fixtures; the UI labels them as synthetic.

## Conventions

- Source style is dense: short names, many statements per line, few comments. Match it in `src/`.
- `docs/source-similarity-audit.md` records a lexical comparison against Nightingale, AlignmentViewer 2.0, React MSAViewer, BioJS MSA and PAVI (`scripts/similarity-audit.mjs`). Do not copy implementation code from those projects; palette data is the only intentional reuse.
- `docs/performance.md` lists browser acceptance checks still outstanding (frame time, memory, WebKit, screen-reader grid audit). Do not claim them as verified without running them.
- Out of scope per README: aligning sequences, gene retrieval, clinical interpretation, alignment editing, structure viewers, tree inference.
