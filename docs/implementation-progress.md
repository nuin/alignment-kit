# Implementation ledger

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
