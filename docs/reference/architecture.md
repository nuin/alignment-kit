# Architecture

One class, `AlignmentViewer` in `src/viewer.ts`, owns all viewer state. Pure modules hold the data model, parsing and analysis. A canvas renderer draws only the visible cells, and module workers run the slow analysis. This page maps the source tree for a contributor.

## Layers

| Layer | Files | Role |
|---|---|---|
| Data model | `types.ts`, `model.ts` | `Alignment` type, `createAlignment`, coordinate conversion, alphabet detection |
| Parsing | `parsers.ts`, `annotation-import.ts`, `pavi.ts` | Alignment formats, annotation formats, PAVI conversion |
| Analysis | `analysis.ts`, `summary.ts`, `search.ts`, `mask.ts`, `strand.ts`, `tree.ts`, `variants.ts`, `annotations.ts` | Statistics, column summary, motif search, column masks, complement, Newick, variants, annotation index |
| Output | `export.ts`, `annotation-export.ts`, `textview.ts`, `link.ts` | Text and figure exports, annotation exports, text view, view links |
| Viewer | `viewer.ts`, `viewer/*.ts` | State, public methods, events |
| DOM and drawing | `controls.ts`, `renderer.ts`, `inspector.ts`, `selects.ts`, `tooltip.ts`, `visibility.ts`, `style.css` | Shell markup, canvas drawing, inspector tabs, themed menus, hover cards, visibility switches |
| Workers | `worker-client.ts`, `worker.js` | Job dispatch and the worker entry |
| Framework wrappers | `integration.ts`, `react.tsx`, `svelte.ts`, `svelte/AlignmentViewer.svelte` | One lifecycle controller and three thin shells |
| Configuration and colors | `config.ts`, `colors.ts`, `palettes.json` | JSON configuration parser, color scheme registry, Nightingale palette data |

The first four layers never touch the DOM. They run in Node, Deno and workers. `src/index.ts` exports them next to the viewer.

## Data model

An `Alignment` stores residues in one `Uint8Array` named `codes`. The array holds `rows.length * width` ASCII codes in row order. The residue of row `r` at zero-based column `c` is `codes[r * width + c]`. A gap is code 45 (`-`).

- Each row has a stable `id`. Annotations attach to a row ID, so they survive sorting, pinning and filtering.
- Public coordinates are alignment columns, one-based and inclusive. `alignmentToSequence` and `sequenceToAlignment` convert between a column and an ungapped position. A gap maps to `null`.
- `createAlignment` rejects input above 250 million cells.
- `removeRows` builds a copy of the alignment with a new `id`. The viewer never edits `codes` in place.

## AlignmentViewer and src/viewer

`src/viewer.ts` declares every field and every public method of `AlignmentViewer`. Each method is one line that delegates to a function in `src/viewer/`. Those functions take the viewer state as a `Core` object, typed in `src/viewer/core.ts`. The class casts itself to `Core` once, in its private `core` getter.

| Module | Functions it holds |
|---|---|
| `load.ts` | `load`, `loadUrl`, `setAlignment`, `clear`, the alphabet prompt, file drop |
| `options.ts` | `setOptions`, option clamping, zoom |
| `stats.ts` | Statistics refresh, `getState`, `setState` |
| `rows.ts`, `grouping.ts` | Filter, sort, hide, move and remove rows, groups, the tree |
| `columns.ts`, `marks.ts`, `strand.ts` | Hidden columns, column marks, reverse complement and row strand |
| `selection.ts`, `data.ts` | Selection, go-to, data accessors, scroll methods |
| `find.ts`, `summary.ts` | Motif search, column summary and its cache |
| `notes.ts`, `variants.ts`, `tracks.ts`, `warnings.ts` | Annotations, variants, custom tracks, parser warnings |
| `output.ts`, `link.ts`, `textview.ts` | Export, copy, consensus, view links, text view |
| `draw.ts`, `panel.ts`, `labels.ts` | Layout, the render call, inspector panel, row labels |
| `bind.ts`, `pointer.ts`, `keys.ts`, `forms.ts`, `actions.ts`, `hints.ts`, `tooltip.ts`, `accessibility.ts` | Event listeners, pointer and keyboard handling, toolbar actions, hints, hover cards, the accessible active cell |

A new public method needs three edits: the function in a `src/viewer/` module, the one-line method in `viewer.ts`, and a row in [api.md](api.md). `tests/docs-api.test.ts` fails without the third.

The constructor builds the DOM with `buildShell` from `controls.ts`, then creates a `Renderer`, a `ThemedSelects` and a `ResizeObserver`. One `AbortController` owns every DOM listener. `destroy()` aborts it, cancels every worker job, and removes the root element.

## Rendering

`Renderer` in `renderer.ts` draws the residue grid, the tracks, the tree column and the overview on canvas elements. It draws only the rows and columns inside the viewport, so the drawing cost follows the viewport size.

- `schedule()` requests one animation frame. Several state changes in one task produce one `render()` call.
- `view()` in `viewer/draw.ts` builds a `RenderView`: the row list, the column map, the selection, search hits, marks and tracks.
- A `ColumnMap` from `mask.ts` maps display columns to original columns. Hidden columns and the reverse-complement view change only this map. Selection, annotations and statistics keep original coordinates.
- Row labels and the inspector are DOM elements. The viewer rebuilds them only when their keys change (`labelKey`, `inspectorDirty`).

## Workers

`WorkerTask` in `worker-client.ts` runs one job at a time in a new module worker. Each `run` call first cancels the previous job of that task by terminating its worker. A cancelled job rejects with an `AbortError`.

| Job `kind` | Function in the worker | Result |
|---|---|---|
| `parse` | `parseAlignment(text, options)` | `Alignment` |
| `stats` | `calculateStats(alignment, rows)` | `AlignmentStats` |
| `pairwise` | `pairwiseMatrix(alignment, rows)` | `Identity[][]` |
| `identity` | `pairwiseIdentity` of the reference against each row | `Identity[]` |
| `summary` | `analyzeColumns(alignment, scope)` | Column summary and variable columns |
| `search` | `findHits(alignment, pattern, options)` | `SearchResult` |

The request is one message `{ kind, ... }`. The reply is one message, `{ result }` or `{ error }`, and typed arrays in the result are transferred. Requests send a compact alignment with `codes`, `width` and `alphabet` only.

The viewer keeps five fixed tasks: `parser`, `analysis`, `comparison`, `ranking` and `searcher`. Summary requests use one extra task per distinct scope, with at most 8 cached scopes. Three counters (`loadRevision`, `statsRevision`, `revision`) let the viewer drop a result that arrives after a newer request.

`worker: false` runs the same functions on the main thread inside a `setTimeout`. The Vitest tests use this mode. A worker search is terminated 2,500 ms after it starts. The main-thread path has only the 2,000 ms budget inside `findHits`, checked between rows and every 256 matches. One slow regular expression call cannot be stopped there.

## Framework wrappers

`mountViewer` in `integration.ts` is the only lifecycle code. It creates the viewer, forwards eight events to callback props, and returns `{ viewer, update, destroy }`. `update` calls `setOptions` when the `options` object changed identity, and `setAlignment` or `clear` when `alignment` changed identity.

- `react.tsx` calls `mountViewer` in an effect and `update` after each render with changed props.
- `svelte.ts` wraps `mountViewer` as an action.
- `svelte/AlignmentViewer.svelte` applies that action to a `<div>`. The package ships this file as source.

No module may access `document` or `window` while it loads. The React and Svelte entries are imported during server rendering, and `tests/integrations.test.ts` and `npm run check:package` check that import.

## Build and package entries

`scripts/build.mjs` bundles five entries with esbuild as ES modules with code splitting: `index.ts`, `react.tsx`, `svelte.ts`, `pavi.ts` and `worker.js`. `tsc` then writes the declarations. The script copies `src/svelte/` and `src/fonts/` into `dist/` and joins `fonts.css` and `style.css` into `dist/style.css`.

| Import path | File |
|---|---|
| `@nuin/msa-canvas` | `dist/index.js` |
| `@nuin/msa-canvas/react` | `dist/react.js` |
| `@nuin/msa-canvas/svelte` | `dist/svelte.js` |
| `@nuin/msa-canvas/svelte/AlignmentViewer.svelte` | `dist/svelte/AlignmentViewer.svelte` |
| `@nuin/msa-canvas/pavi` | `dist/pavi.js` |
| `@nuin/msa-canvas/style.css` | `dist/style.css` |
| `@nuin/msa-canvas/config.schema.json` | `config/viewer-config.schema.json` |
| `@nuin/msa-canvas/config.example.json` | `config/viewer-config.example.json` |

JSR publishes `src/index.ts` and its imports as TypeScript source, from `deno.json`. The React, Svelte and PAVI entries are npm only.

## Styling

Every viewer element sits under one `.ak-viewer` root. The colors and the font come from `--ak-*` custom properties on that root. See [Colors and themes](configuration.md#colors-and-themes). `data-theme` on the root selects the light or dark surface.

## Related pages

- [CONTRIBUTING](../../CONTRIBUTING.md) lists the setup, the test layers and the pull request rules.
- [Standalone functions and types](functions.md) lists the exports of the pure layers.
- [Coordinates and statistics](statistics.md) defines every statistic and its denominator.
