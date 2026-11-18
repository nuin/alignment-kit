# Validation and performance

Recorded 2026-11-18: 499 unit tests and all 60 Chromium/WebKit cases pass. The release checks cover scientific definitions, parsers, exports, lifecycle, worker protocols, TypeScript/Svelte, four real dataset snapshots, production builds and packed-package consumers. Browser cases include interactions, accessibility and packed React/Svelte consumers. CI runs these checks together with Knip and Aislop on pull requests; tagged releases run the package, quality and browser gates before publication.

## Browser performance

Run `npm run benchmark:browser` after installing Chromium with `npx playwright install chromium`. The benchmark uses the built package and writes [browser-benchmark-results.json](browser-benchmark-results.json). Process-memory sampling requires a Unix-style `ps` command. It runs separately from CI because timing thresholds depend on hardware and runner load.

Recorded environment: Apple M1 Ultra, 20 logical CPUs, 64 GiB RAM, arm64 Darwin 27.0.0, Node 22.23.5, headless Chromium 145.0.7632.6, viewport 1440 × 1000. Each fixture received one discarded warm-up and three measured runs, each with ten seconds of scripted horizontal and vertical scrolling. The table reports the range across those three runs, not confidence intervals.

| Rows × columns | Annotations | First usable viewport | p95 frame interval | Sampled RSS increase | Maximum rendered row labels |
|---|---:|---:|---:|---:|---:|
| 10,000 × 1,000 | 0 | 417–435 ms | 29.4–30.4 ms | 59.2–119.8 MiB | 11 |
| 1,000 × 10,000 | 0 | 430–454 ms | 29.4–32.2 ms | 76.4–79.4 MiB | 11 |
| 50,000 × 300 | 0 | 659–685 ms | 28.9–30.0 ms | 165.7–192.3 MiB | 11 |
| 10,000 × 1,000 | 100,000 | 635–956 ms | 28.7–30.8 ms | 131.6–214.2 MiB | 7 |

All three runs of the primary 10,000 × 1,000 fixture met the measured targets: startup under five seconds, p95 animation-frame interval under 33 ms and incremental sampled browser RSS under 512 MiB. These are results on the recorded machine and workload, not guarantees for every browser or device.

Startup begins with FASTA text and annotations already in memory. It includes parsing, module workers, exact statistics, annotation indexing, two animation frames, a keyboard selection and its repaint. Fetching, decompression and generating the synthetic input are excluded. Scrolling measures `requestAnimationFrame` intervals, including DOM-bound checks and concurrent memory sampling; it does not measure GPU/compositor presentation. Individual maximum intervals reached 88.4 ms even though each run's p95 met the target.

Memory is the summed RSS of the dedicated browser process and its descendants, including workers. The baseline is taken after preparing input and forcing garbage collection. Sampling waits 100 ms between process queries; query overhead produced 59–74 samples per measured run. Shared pages can be counted more than once and peaks between samples can be missed. The primary fixture's absolute sampled browser RSS peaked at 547.3 MiB; the 119.8 MiB target comparison is the incremental cost above the prepared browser baseline, not total browser memory. Raw baselines, peaks and sample counts are retained in the report.

Ten load/destroy cycles left no viewer DOM and no live workers after each disposal. Post-GC page heap changed from 11.69 to 11.87 MiB, with the input intentionally retained. Browser RSS changed from 395.0 to 413.2 MiB. This bounded check found no leftover viewer DOM or workers; it does not prove the absence of every long-lived leak.

Rendering uses viewport-bounded Canvas 2D with a glyph cache and bounded DOM labels. Exact analysis still scales with total cells and the full input is retained. Pairwise analysis is limited to 200 selected rows and figures to 200,000 cells. These constraints do not imply unlimited input sizes.

## Accessibility

Automated checks use axe-core 4.14 with WCAG 2 A/AA and 2.1 A/AA rules in Chromium and WebKit. They cover light/dark themes, an open color menu, the color inspector and the text view. Keyboard checks exercise menu focus return, grid navigation, range selection, all inspector tabs at desktop/narrow widths, and focus transfer to the text alternative. Unit regressions cover independent active-cell IDs, clearing stale alignment state and complemented residue announcements.

The grid exposes an active cell with sequence name, original alignment column, displayed residue and ungapped sequence position. The live region announces selection changes. The text alternative has its own named region and hides the covered canvas grid from the accessibility tree. Native Safari's macOS accessibility tree was inspected and exposed the active residue, resize control value and inspector region. Desktop and narrow screenshots were visually reviewed; clipped inspector tabs were fixed and covered by a containment regression.

**Native screen-reader testing is deferred for this release.** The user accepted this deferral after the attempted audit: VoiceOver was temporarily enabled in System Settings, but the application remained reported as not running and its automation interface timed out. The setting was restored to off and the temporary Safari window closed. No spoken-output or VoiceOver navigation pass is claimed. A future manual VoiceOver/Safari or NVDA/browser session should verify residue announcements, range changes, inspector navigation and the text alternative. Automated axe results and accessibility-tree inspection do not replace that check.

## Reproducing release validation

Use Node 22.20 or later for development tooling; Node 22 LTS is recommended and CI uses Node 22. The library's Node runtime minimum remains 22; the higher development minimum covers the locked tooling dependencies.

```sh
npm ci
npm run release:check
npm run check:quality
npx playwright install --with-deps chromium webkit
npm run test:browser
deno publish --dry-run --allow-dirty
```

`release:check` packs the actual npm archive and builds/SSR-renders isolated consumers. `test:browser` builds the library first so packed-consumer tests use current output. The browser suite opens the packed React and Svelte production consumers, checks styling and selection, and observes real module workers. It covers exports, row virtualization, replacement/disposal and framework examples. Playwright retains traces and screenshots on failure; CI uploads its HTML report and test results for 14 days. A successful local run does not imply a hosted CI run has occurred.

## Historical CPU baseline

[benchmark-results.json](benchmark-results.json) retains the 2026-10-27 Node-only measurements on an Apple M3 Max with Node 26.12.1. Reproduce that method with `npm run build && npm run benchmark`. Each fixture ran once, sequentially, so those values are observations rather than stable estimates. They exclude text parsing, fetch/decompression, browser layout/paint and worker messaging; their RSS differences are not peak browser memory. Use the browser report above for the current browser acceptance evidence.
