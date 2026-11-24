# Implementation ledger

## 2026-11-22 alignment scrolling with variant cards

- Reproduced a zero-height sequence grid when expanded cards, details and
  tracks exhausted the fixed viewer height; `overflow: hidden` made the rows
  unreachable. The viewer now scrolls vertically and reserves a grid height
  of three rows plus scrollbar space, using the existing track geometry.
- Keep the inspector within the workspace's allocated height. Its content
  scrolls independently instead of stretching the alignment into a large
  blank area. Vertical wheel scrolling can continue from the grid into the
  containing viewer at the end of the sequence list; horizontal scrolling
  stays contained in the grid.
- Added desktop and narrow-screen browser coverage for expanded details,
  reaching the last sequence and column, scrolling back to the cards, and
  removing unnecessary outer overflow when the viewer grows.
- Installed the tested local package in PAVI and rebuilt the standalone HTML
  preview. Live Chromium/WebKit checks reach all four Trp53 job sequences and
  column 411 with cards and noncoding details expanded. All 528 unit tests,
  TypeScript/Svelte, package consumer/SSR checks and the quality gate pass;
  Aislop reports 100/100 with no findings. The full Chromium/WebKit suite passes
  all 74 cases, and all four live PAVI checks pass. Work remains local and uncommitted.

## 2026-11-20 variant cards

- Implemented the approved card strip in the shared viewer. Mapped cards use
  existing variant navigation; unmapped cards show details without moving the
  residue selection. Cards share row, annotation and column filters, retain
  collapse and focus across updates, and render at most 20 per page.
- Added `visibility.variantCards`, the demo customization switch, shared safe
  metadata presentation, and explicit placeholder colors for both themes after
  the reported dark text in Safari's search and motif boxes.
- Unit verification: 525 passing tests; TypeScript/Svelte checks are clean.
  Focused Chromium/WebKit checks passed all eight cases, including keyboard
  use, noncoding details, narrow layouts and accessibility in both themes.
  Final verification: 528 unit tests pass; the full Chromium/WebKit suite passed
  70 cases, followed by 14 focused card/accessibility cases after the last focus
  and heading-color fixes. TypeScript/Svelte, Knip/Aislop (100/100), build and
  packed React/Svelte consumer/SSR checks pass.
- Fresh review found and verified fixes for active-card visibility after
  expansion/filtering and selection resets during late evidence updates. Added
  atomic `updateAnnotations` and changed PAVI to update evidence in place.
  Manual card paging and focus also survive evidence updates.
- PAVI's 12 focused tests, strict type check and edited-file ESLint pass. The
  changed PAVI files have no Aislop diagnostics; a whole-PAVI scan reports
  existing findings elsewhere (including Cypress example globals), so this is
  not a clean audit of the entire PAVI checkout.
- The real local Trp53 job passes Chromium and WebKit checks: five cards (four
  mapped, one noncoding), column selection, unmapped details preserving the
  selected column, and at least 4.5:1 contrast for search/motif input text,
  placeholders and the inspector heading in dark mode. Native Safari opened
  the updated job and showed all five cards and populated statistics; native
  automated click checks were inconclusive, so interaction claims rely on the
  automated browser checks.
- Updated the standalone HTML preview and installed the tested local archive
  in PAVI. Local result: `http://127.0.0.1:3001/result?uuid=31158ddb-89fe-47fc-91ee-eafadbcc47c6`.
  No commits, pushes or publication. Deferred minor: the single-variant header
  currently reads “1 variants”.

## 2026-11-20 stalled local preview

- Investigated the blank Safari tracks and simultaneous statistics/evidence loading messages. The overnight Next.js process had stdout/stderr attached to closed pipes and logged uncaught `EPIPE` errors; new page navigation stalled too. Graceful termination did not release the development lock, so the failed process was force-stopped.
- Restarted the mock preview on port 3001 under Node 24, redirecting stdout/stderr to `/private/tmp/pavi-canvas-dev.log`. Verified the worker URL returns HTTP 200 and the replacement process uses regular log-file descriptors.
- Opened the result URL in native Safari and verified populated overview, frequency/entropy/quality tracks, consensus/logo, position statistics, annotation details and column sequence rows, with both loading messages cleared. No application-code changes were needed.

## 2026-11-19 local PAVI inspector follow-up

- Completed richer annotation details, amino-acid descriptions, and the paginated list of visible sequences at the selected column. Added documentation and unit/browser coverage; corrected the browser test to use the sequence filter's `searchbox` role.
- Validation: 515 library unit tests, TypeScript/Svelte checks, packed React/Svelte consumers and SSR checks pass. The full browser run passed 60 existing cases; after correcting the new test selector and adding pagination coverage, all four inspector cases pass in Chromium/WebKit. Aislop scores the library 100/100 with no findings.
- Installed the tested local archive in `../alliance/agr_pavi/webui/node_modules/@nuin/msa-canvas`; verified all 120 archive files against their installed contents. This is a local install; a dependency reinstall can restore the published package.
- Connected PAVI's evidence lookup for coding and non-coding variants, with stale-response protection, shared pending requests, visible failures, and a 15-second request timeout. Normalized timeout exceptions for Next.js and retained evidence when a variant appears under multiple alleles. The mapper supports both legacy `variants` and current Alliance `variantList`/genomic HGVS responses; checked it against 500 live API rows. Unresolved evidence remains unknown. Mock mode keeps external evidence unknown without making Alliance requests.
- PAVI validation: 11 integration tests, three Chromium browser checks, strict TypeScript, changed-file ESLint and the production build pass. Manually checked evidence filters with a synthetic browser response, detailed pinned cards, and the inspector at 1440px and 820px widths; removed the browser fixture afterward. The preview runs at `http://127.0.0.1:3001/result?uuid=123e4567-e89b-42d3-a456-426614174000`.
- Updated PAVI Next.js and its ESLint config to 16.4.6 to clear Aislop's critical dependency finding. PAVI scores 99/100 with zero errors and one moderate `qs` warning for which the audit reports no fix; development dependency advisories and the missing Knip setup are informational findings.
- PAVI also received concurrent local changes to worker asset serving, viewer customization and result summaries; preserved those changes. All work remains local and uncommitted; no push or publication was performed. Native spoken screen-reader validation remains deferred.

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
