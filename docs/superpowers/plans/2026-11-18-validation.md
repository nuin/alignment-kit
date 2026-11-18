# Release validation implementation plan

**Goal:** Complete the four validation gaps approved in this conversation: browser execution, CI gates, browser performance/accessibility evidence, and current documentation.

**Architecture:** Keep the existing Playwright interaction suite, add accessibility coverage and a separate repeatable browser benchmark, and run the package and quality gates in CI. Record measurements and limitations without turning machine-specific timings into universal guarantees.

**Tech stack:** TypeScript, Playwright Chromium/WebKit, axe-core, Node, Aislop, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-msa-viewer-design.md`, performance and validation section.

## Constraints

- Preserve the pre-existing `src/variants.ts` change and untracked local tooling state.
- Initial validation stayed in this checkout without publication or git history changes. The user's follow-up instruction authorizes a release PR, hosted CI, merge and release tagging.
- Do not change `.aislop/config.yaml` or disable checks to obtain a pass.
- Target 10,000 × 1,000: first usable viewport <5 s, p95 scroll interval <33 ms, incremental browser memory <512 MiB, including workers where measurable.
- Use all four synthetic fixture shapes, warm-up and repeated measurements; identify memory sampling limitations.
- Automated accessibility checks do not constitute a VoiceOver or NVDA audit.

## Review focus

- Browser tests must exercise the actual module worker, exports, framework disposal and narrow layouts.
- Accessibility checks must include both themes, an open menu, keyboard selection and the text alternative.
- Benchmark startup must include real viewer loading and a painted, responsive viewport, rather than just model construction.
- Memory must include child browser/worker processes, and leak checks must cover repeated mount/unmount.
- CI must run on pull requests and must not skip package, browser or quality failures.

## Tasks

- [x] Install browser/test tooling; run existing browser tests; reproduce and fix failures with focused regression coverage.
- [x] Add axe/keyboard/accessibility-tree coverage; inspect actual browser screenshots and attempt the native screen-reader audit when supported.
- [x] Add browser benchmark with warm-up, three measured runs per fixture, 10-second scripted scrolling, process-memory sampling and repeated disposal; save raw results.
- [x] Add full package/release, browser and Aislop CI checks; configure unused-code analysis using actual public entry points.
- [x] Update performance/release/README guidance and implementation ledger with current evidence, commands and any remaining manual limitations.
- [x] Run final release, browser, quality and Deno checks; obtain a fresh review and resolve substantive findings.

## Progress

- Baseline: 495 unit tests, release check and Aislop 100/100 pass. All 50 browser cases could not start because Chromium/WebKit executables were missing.
- Execution: user explicitly authorized all four tasks; proceed inline without another approval checkpoint.
- Browser baseline after installation: 48 passed, six new accessibility failures and two React failures. React mismatch came from the new tooling dependency resolving React independently of React DOM; pin both existing demo peers at 19.2.3. Follow-up: all 56 passed.
- Accessibility: fixed contrast, resize value semantics, inspector focus, active cell and text-view exposure. Added a failing clear-state regression and verified its fix (2/2 focused unit tests).
- Quality: enabled Knip with public package entry points; removed unused internal export modifiers, two dead declarations, and corrected the screenshot script's undeclared Playwright import. Aislop reports no diagnostics.
- Timing pilot: one warm-up plus one measured 10-second scroll pass completed in roughly 22 seconds plus setup. Measured startup 423 ms, p95 28.6 ms, RSS increase 125.75 MiB. Full run uses 16 passes: approximately three minutes plus setup and ten disposal cycles. Completed fixture/run records in the JSON report are the progress unit.
- Visual inspection: desktop screenshot exposed clipped inspector tabs; add a containment regression before changing their layout.
- Native screen-reader audit: user approved temporary VoiceOver enablement. Safari's native accessibility tree exposes the residue and controls, but VoiceOver remained not running and its interface timed out after enabling it through System Settings. Restored the switch to off and closed the temporary Safari window. Spoken-output validation is blocked and not claimed.
- Initial benchmark before review: all four fixtures, one warm-up and three measured runs each, plus ten clean DOM/worker disposal cycles. Primary startup 417–464 ms, p95 21.5–26.1 ms and sampled RSS increase 109.6–112.3 MiB. The final refresh below supersedes these measurements.
- Fresh read-only code review requested while final release checks and documentation are completed.
- Review resolved: corrected the no-selection active cell to follow the first visible column; cached unchanged accessibility state and counted only traversed residues during panning. Both regressions failed before the fixes and pass afterward. Reviewer independently checked 400 coordinate cases across gaps, offsets and row/direction changes; no Important/Critical findings remain. Added a build hook before standalone browser tests to prevent missing or stale packed output.
- Final functional gates: fresh `npm ci`, 499 tests across 40 files, zero TypeScript/Svelte diagnostics, library/demo/guide builds, four real dataset checks, packed React/Svelte builds and SSR, all 60 Chromium/WebKit cases, Knip, Aislop 100/100 with no diagnostics, Deno publish dry run and workflow YAML parsing pass. Desktop/narrow screenshots inspected again after the tab fix. Hosted CI has not been run in this session.
- Final benchmark refresh passed on the corrected accessibility code: primary startup 417–435 ms, p95 29.4–30.4 ms, incremental sampled RSS 59.2–119.8 MiB. All four fixtures met these thresholds in each measured run; ten disposal cycles left no viewer DOM/live workers. Updated the raw JSON and performance table. The guide copies the new report and resolves its accessibility-evidence links. Native screen-reader speech/navigation remains the one blocked audit; all authorized local implementation and automated validation work is complete.
- Follow-up: user explicitly deferred native screen-reader testing and authorized the commit/PR/CI/release workflow. Prepare 0.5.1, verify that version, then use the existing release workflow on the CI-approved master commit.
