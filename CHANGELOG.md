# Changelog

## 0.5.1 — 2026-11-18

- Expose the active alignment cell to assistive technology with sequence, column, residue and sequence-position details. Clear stale accessible data when an alignment is removed, keep multiple viewers independent, and follow the visible column after scrolling without a selection.
- Improve control contrast, resize-control semantics, inspector keyboard access and text-view accessibility. Wrap inspector tabs so every tab remains reachable at desktop and narrow widths.
- Avoid repeated residue scans and accessibility DOM replacement when the active cell is unchanged; update sequence coordinates incrementally during panning.
- Harden inspector SVG content handling and remove unused internal code without changing public package exports.
- Add Chromium/WebKit accessibility and packed React/Svelte browser tests, plus package and quality checks to pull-request and release CI.
- Record repeatable browser startup, scrolling, memory and disposal measurements, and refresh release and user documentation.

Validation: 499 unit tests and 60 Chromium/WebKit cases pass locally; TypeScript/Svelte, builds, packed consumers, Knip, Deno dry run and Aislop pass. Browser performance targets pass on the recorded machine; see `docs/performance.md` for methods and limits. Native spoken screen-reader testing is deferred and is not claimed as verified.
