# MSA viewer implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task. User authorized execution with React and Svelte integrations.

**Goal:** Deliver an embeddable large-alignment viewer with annotations, standalone demo, React and Svelte integrations.
**Architecture:** Framework-independent typed model and Canvas 2D viewport, worker parsing/statistics, thin framework lifecycle wrappers. One package with separate core, React, Svelte and PAVI exports.
**Tech stack:** TypeScript, esbuild package build, Vite examples, Vitest unit tests, Playwright browser tests, React 19, Svelte 5.
**Spec:** `docs/superpowers/specs/2026-10-26-msa-viewer-design.md`.

## Global constraints

- Public coordinates are 1-based inclusive; gaps are not sequence positions.
- Row identity and statistics must not depend on rendering order or scroll position.
- Core must not import React/Svelte or access DOM during module import.
- All row/column views and controls must be bounded by viewport size.
- No publication, deployment, PAVI modification or git history change.
- Preserve source metadata; synthetic fixtures are labeled.
- Image export bounded at 200,000 cells; pairwise identity capped at 200 explicit rows.

## Review focus

- Malformed interleaved alignments and duplicate names: clear errors and stable IDs (task 1).
- All-gap/tied/ambiguous columns: consistent metrics and unavailable states (task 1).
- Stale asynchronous loads and detached instances: no stale draws or leaked workers (tasks 2, 4).
- Filter/reorder/pin actions: annotations stay with their original sequence (tasks 2, 3).
- Published assets and SSR: worker/CSS/component paths work outside this source tree (task 4).

### Task 1: Model, input and analysis

Files: `src/types.ts`, `src/model.ts`, `src/parsers.ts`, `src/analysis.ts`, `src/colors.ts`, `src/pavi.ts`, `tests/core.test.ts`, package/TS/test configuration.

Interfaces: `parseAlignment(text, options): Alignment`; `createAlignment(rows, options): Alignment`; `calculateStats(alignment, rowIndices?): AlignmentStats`; `alignmentToSequence(alignment,row,column): number|null`; `sequenceToAlignment(alignment,row,position): number|null`; `pairwiseIdentity(alignment,rowA,rowB): Identity`; `fromPavi(text,seqInfo,annotations?): Alignment`.

- [ ] Write tests: duplicate FASTA headers retain rows; interleaved Stockholm/CLUSTAL concatenate correctly; inconsistent widths fail; annotation metadata survives; gzip loading; sequence/gap coordinate round trip.
- [ ] Run `npm test -- tests/core.test.ts`; expect missing implementation failure.
- [ ] Implement parsers, compact encoded model, exact statistics, canonical-only identities, palette registry and PAVI adapter.
- [ ] Check hand fixture `A-.X / A-.N / C-AX`: gap fractions `[0,1,2/3,0]`, modal frequency `[2/3,null,1,2/3]`; ties remain explicit. Test malicious SVG metadata escaping later in task 3.
- [ ] Run unit tests and TypeScript checks; expect passes.

### Task 2: Viewer engine and scalable renderer

Files: `src/viewer.ts`, `src/renderer.ts`, `src/worker.js`, `src/worker-client.ts`, `src/annotations.ts`, `src/style.css`, `src/index.ts`, `tests/viewer.spec.ts`, `demo/`.

Interfaces: `createViewer(element, options): AlignmentViewer`; viewer methods `load`, `setAlignment`, `setOptions`, `setReference`, `setFilter`, `setSelection`, `getState`, `setState`, `on`, `destroy`. Options/events exported from `types.ts`.

- [ ] Write browser tests for real seed loading, column click and keyboard movement, pinned reference, bounded row nodes, data replacement and destroy; run to confirm missing-viewer failures.
- [ ] Implement cancellable load/statistics worker, shared viewport, canvas cells/tracks, labels, annotation indexing, overview navigation, inspector, toolbar and accessible controls.
- [ ] Add real CBS fixture plus provenance/hash; demo loads real data by default and offers explicitly synthetic large fixtures.
- [ ] Run tests and inspect screenshots at desktop and narrow widths; fix visible clipping and control overflow.

### Task 3: Exploration, annotations and export

Files: `src/controls.ts`, `src/inspector.ts`, `src/export.ts`, associated core/browser tests.

Interfaces: `exportFasta`, `exportStatistics`, `exportSvg`, `exportPng`; row and annotation filters, motif search and sort methods on viewer. Use stable row IDs from task 1 and shared viewport from task 2.

- [ ] Write tests for variant mapping through sorting/filtering, all-vs-filtered statistics scope, motif navigation, reference/consensus coloring, selection exports and escaped text.
- [ ] Implement annotation type/consequence/disease/phenotype filters, per-row visibility, frequency logo, reference/identity comparison, bounded pairwise matrix, and region/image/state exports.
- [ ] Run complete unit/browser suites; compare exported counts/coordinates to fixtures.

### Task 4: React, Svelte and package integration

Files: `src/react.tsx`, `src/svelte.ts`, `src/svelte/AlignmentViewer.svelte`, `examples/react/`, `examples/svelte/`, `scripts/build.mjs`, `tests/integrations.spec.ts`, `README.md`.

Interfaces: React `AlignmentViewer` component; Svelte default `AlignmentViewer` component and `alignmentViewer` action. Both accept `alignment`, `options`, `onReady`, `onSelectionChange`, `onViewportChange`, `onAnnotationClick`, `onError` and dispose on unmount. No framework runtime in core.

- [ ] Write lifecycle tests: mount, reactive options and alignment replacement, current callbacks, repeated mount/unmount, SSR import/render.
- [ ] Implement wrappers and independently runnable demo pages. Build package declarations, CSS, worker and Svelte source/declarations.
- [ ] Verify local packed-package consumption in React/Svelte builds and SSR, not only aliases into source. Run `npm pack --dry-run`.
- [ ] Document JS/React/Svelte/PAVI examples, coordinates, analysis definitions, limits, CSP/worker requirements, themes and all public methods.

### Task 5: Performance and final review

Files: `scripts/benchmark.mjs`, `docs/performance.md`, test artifacts and plan ledger.

- [ ] Benchmark 10k x 1k, 1k x 10k, 50k x 300 and dense 100k annotations; record machine/browser, initialization and scripted scroll frame timing. Report unavailable memory measurement honestly.
- [ ] Run unit tests, type checks, package/examples builds and browser suites. Check WebKit compatibility where available.
- [ ] Request one fresh reviewer for correctness, package integration, scientific definitions and lifecycle; address material findings with regression tests.
- [ ] Record exact outcomes and remaining limits; leave local demo running for user review.
