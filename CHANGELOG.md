# Changelog

## Unreleased

- Add the wire format, version 1: `toJson`, `fromJson`, `fillTemplate`, `escapeJson`, `WIRE_FORMAT`, `WIRE_VERSION` and `WIRE_PLACEHOLDER` from the package entry, and `MsaCanvas.mountWire` in the script-tag bundle.
- Add the package exports `./wire.schema.json`, `./view-state.schema.json` and `./template.html`. `npm run build` writes `dist/template.html`, one self-contained page with a single JSON payload placeholder.
- Add the `msa-canvas <file> -o view.html` command (`bin`), with `--config`, `--state`, `--theme`, `--height` and `--json`.
- Add the Python package `msa_canvas` (`python/`) and the R htmlwidgets package `msacanvas` (`r/msacanvas`) to the repository. Neither is in the npm archive. `npm run sync:bindings` copies the built bundle, CSS and template into both.
- A release now sets the version in four binding files as well; see `docs/RELEASE.md`.

## 0.5.2 — 2026-11-18

- Publish the accessibility, safety and validation improvements prepared in 0.5.1.
- Use Ubuntu's official HTTPS archives for browser dependencies in CI and release jobs, avoiding the slow regional mirror that prevented the 0.5.1 release from reaching npm and JSR. The existing 0.5.1 source tag is preserved.

## 0.5.1 — 2026-11-18

- Expose the active alignment cell to assistive technology with sequence, column, residue and sequence-position details. Clear stale accessible data when an alignment is removed, keep multiple viewers independent, and follow the visible column after scrolling without a selection.
- Improve control contrast, resize-control semantics, inspector keyboard access and text-view accessibility. Wrap inspector tabs so every tab remains reachable at desktop and narrow widths.
- Avoid repeated residue scans and accessibility DOM replacement when the active cell is unchanged; update sequence coordinates incrementally during panning.
- Harden inspector SVG content handling and remove unused internal code without changing public package exports.
- Add Chromium/WebKit accessibility and packed React/Svelte browser tests, plus package and quality checks to pull-request and release CI.
- Record repeatable browser startup, scrolling, memory and disposal measurements, and refresh release and user documentation.

Validation: 499 unit tests and 60 Chromium/WebKit cases pass locally; TypeScript/Svelte, builds, packed consumers, Knip, Deno dry run and Aislop pass. Browser performance targets pass on the recorded machine; see `docs/performance.md` for methods and limits. Native spoken screen-reader testing is deferred and is not claimed as verified.
