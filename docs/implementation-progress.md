# Implementation ledger

## 2026-11-18 release validation

Plan: `docs/superpowers/plans/2026-11-18-validation.md`. User authorized completing the browser, CI, performance/accessibility and documentation work in this checkout, preserving pre-existing changes and leaving git history unchanged.

- Installed Chromium and WebKit and added axe, keyboard, inspector-containment and packed React/Svelte consumer tests. Fixed contrast, active-cell semantics, stale clear-state accessibility, text-view exposure and clipped inspector tabs. Pinned matching React/React DOM development peers after tooling installation exposed a version mismatch.
- Added package/release, Knip/Aislop and browser gates to PR and release workflows, with retained CI browser reports. Removed unused internal declarations/exports without changing package entry points; no Aislop rules were disabled or modified.
- Completed one warm-up plus three measured runs for each of four browser fixtures and ten disposal cycles. The primary fixture met all three measured targets; raw data and measurement limits are in `docs/browser-benchmark-results.json` and `docs/performance.md`.
- Inspected native Safari's accessibility tree. The approved temporary VoiceOver enablement did not start a usable reader: the app remained not running and its interface timed out. Restored VoiceOver to off. Spoken screen-reader validation remains explicitly unverified.
- Refreshed README, release instructions, user/API accessibility guidance and performance evidence. Final check results and review disposition are recorded in the validation plan.
- Follow-up authorization: user deferred native VoiceOver testing and requested committing the work, opening a PR, checking hosted CI and releasing it. Preparing patch release 0.5.1 with matching npm/JSR versions and a changelog; this supersedes the initial no-publication/no-history-change boundary for these release steps.

## Historical implementation notes (2026-10-26/27)

The environment restrictions and outstanding checks below describe the original implementation session; current browser evidence is recorded above.

Plan: `docs/superpowers/plans/2026-10-26-msa-viewer.md`.

- User approved implementation and required both React and Svelte integrations.
- Ruling: execute inline without another plan approval; existing user authorization covers implementation choices.
- Ruling: directory has no git repository. Work here without creating commits/worktrees; preserve the approved no-history-change boundary.
- Preflight: tasks 2-4 consume task 1's Alignment/IDs/coordinates; framework wrappers use the same public viewer API as the demo. No conflicting interfaces found.
- Tasks 1–4: implementation complete; browser acceptance remains outstanding.

- Tasks 1–4 implemented; core tests, lifecycle tests and SSR tests pass (20 tests before review). TypeScript/Svelte checks and package/demo builds passed.
- Ruling: use locally available IBM Plex Sans with bundled OFL license and system monospace; Source Sans/fontsource registry packages were not cached. Typography remains configurable.
- Registry install initially failed under restricted DNS. Standard dependencies installed from the existing npm cache with exact available versions; no external files modified.
- Browser validation blocked: local listening returns EPERM; Chromium headless launch is denied at MachPortRendezvous. Native Chrome preview returned a crashed page after a tool stall. No visual/performance pass claimed. Self-contained file previews generated as a user-accessible alternative, retaining blob workers.
- Review complete: fixed prototype-sensitive Stockholm maps, malformed interleaved blocks, GR metadata validation, main-thread pairwise work, export filtering/emphasis, reactive alignment clearing, A3M URL handling and stale same-object ready events. Regression tests cover each relevant behavior. Reference identity denominators, species labels and frequency-logo denominator are exposed.
- Final validation: 27 Vitest tests passed across five files; TypeScript/Svelte checks passed with zero diagnostics. Library and three demo entry points build successfully. Actual npm archive extracted into a separate consumer directory; React/Svelte builds, React SSR, Svelte action import and Svelte component SSR pass using locally installed framework peers. This verifies archive contents and resolution, not a network install or browser worker execution.
- Large-data CPU baseline recorded in `docs/benchmark-results.json` and qualified in `docs/performance.md`: 10k × 1k, 1k × 10k, 50k × 300, and 100k annotations. Browser frame time, peak memory, visual layout, accessibility and WebKit remain unverified due to environment restrictions.
- Self-contained standalone/React/Svelte previews regenerated after final fixes in `.preview/`. A running development server cannot be left available because local listening is denied. Start `npm run dev` outside the restricted runner, or open those files directly.
- No package publication, deployment, PAVI modification, commits or git history changes performed.
