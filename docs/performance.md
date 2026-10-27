# Validation and performance

Recorded 2026-10-27. The implementation has 27 passing automated tests across scientific definitions, parsers, exports, lifecycle, SSR imports and the worker protocol. TypeScript and Svelte checks pass without diagnostics. The worker tests execute the bundled worker protocol in Node worker_threads; they do not validate a browser's worker URL or CSP handling.

## CPU baseline

Run `npm run build && npm run benchmark` to reproduce. Raw output: [benchmark-results.json](benchmark-results.json).

Machine: Apple M3 Max, 16 logical CPUs, 64 GiB RAM, arm64 Darwin 27.0.0, Node 26.12.1. Each fixture ran once, sequentially in one process. These are single-run observations, not statistically stable estimates. Synthetic rows use a repeated motif with deterministic substitutions; diverse real alignments can have different costs. The real CBS fixture was also parsed and contains 838 rows and 160 columns.

| Rows × columns | Annotations | Model creation | Exact statistics | Annotation index | 10k interval queries | RSS increase |
|---|---:|---:|---:|---:|---:|---:|
| 10,000 × 1,000 | 0 | 109.40 ms | 13.03 ms | 0.07 ms | 1.01 ms | 28.0 MiB |
| 1,000 × 10,000 | 0 | 111.17 ms | 14.17 ms | 0.01 ms | 0.49 ms | 5.0 MiB |
| 50,000 × 300 | 0 | 201.45 ms | 23.24 ms | 0.01 ms | 0.56 ms | 50.8 MiB |
| 10,000 × 1,000 | 100,000 | 107.52 ms | 21.86 ms | 14.64 ms | 1.50 ms | 51.8 MiB |

Timings exclude fetch, decompression, text parsing, browser layout/paint and worker messaging. RSS increase is the process difference around a fixture, not peak memory, retained viewer memory or browser heap. Garbage collection and retained allocations affect comparisons between rows. Zero-annotation query timings only measure empty-index overhead.

## Browser acceptance remains outstanding

This environment rejects listening on 127.0.0.1 with EPERM. Chromium also fails before page execution because MachPortRendezvous is denied. A native Chrome attempt returned a crashed page. Consequently no browser interaction, screenshot, accessibility audit, scrolling frame-time or browser-memory pass is claimed. WebKit remains unverified too.

Run `npm run test:browser` in a normal desktop environment with Playwright Chromium and WebKit installed. Tests cover viewer interactions, bounded rendered labels, replacement/disposal and both framework examples. For visual review run `npm run dev`, or generate standalone files with `npm run preview:files` and open `.preview/index.html`, `.preview/react.html` and `.preview/svelte.html`.

Before a production release, record browser/OS versions and repeat each large fixture with warm-up and multiple runs. Measure time to the first interactive viewport, p95 scripted horizontal/vertical scroll frame intervals, peak memory including workers, annotation density effects, and repeated mount/unmount. The design targets of under five seconds to usability, p95 frame interval under 33 ms, and under 512 MiB on the target fixture are goals, not verified results. Check desktop/narrow layouts, both themes, keyboard navigation, screen readers and image exports visually.

Rendering uses viewport-bounded Canvas 2D with a glyph cache and bounded DOM labels. Exact analysis still scales with total cells; the full input is retained. Pairwise analysis is explicitly limited to 200 selected rows and figures to 200,000 cells. These constraints do not imply unlimited input sizes.
