# Contributing

Changes reach `master` through a pull request from a branch. Nobody commits to `master` directly. This page lists the setup, the checks and the rules a pull request must meet.

## Setup

Development needs Node 22.20 or later and npm. CI runs Node 22 on Ubuntu 24.04.

```sh
git clone https://github.com/nuin/alignment-kit.git
cd alignment-kit
npm ci
npm run dev                                # demo at http://127.0.0.1:4173
npx playwright install chromium webkit     # only for browser tests
```

`npm run dev` first builds the guide pages, then starts Vite on port 4173 with `strictPort`. The React and Svelte examples are at `/examples/react/` and `/examples/svelte/`.

## Branches and pull requests

1. Create a branch from `master`. Name it by kind and topic, for example `fix/phylip-names` or `docs/quick-start`.
2. Keep each commit small. Write the subject as an imperative sentence, for example `Add PHYLIP strict name padding`.
3. Add or extend a test for every behavior change.
4. Update the reference page that covers the changed behavior. The pages are in [docs/reference](docs/reference/api.md).
5. Add a line to [CHANGELOG.md](CHANGELOG.md) when the change is visible to a user of the package.
6. Open a pull request. CI must pass before the merge.

A release is a separate step. [docs/RELEASE.md](docs/RELEASE.md) describes the version bump and the tag.

## Test layers

The filename suffix selects the runner. `tests/*.test.ts` runs under Vitest. `tests/*.spec.ts` runs under Playwright.

| Command | What it checks |
|---|---|
| `npm test` | Vitest: parsers, statistics, viewer lifecycle, SSR imports, worker protocol, documentation coverage |
| `npx vitest run tests/core.test.ts -t "name"` | One Vitest file or one test |
| `npm run check` | `tsc --noEmit` and `svelte-check` |
| `npm run build` | The library bundle and type declarations in `dist/` |
| `npm run test:browser` | Builds the library, then runs Playwright in Chromium and WebKit against `npm run dev` |
| `npx playwright test tests/viewer.spec.ts --project=chromium` | One browser spec; run `npm run build` first for the packed-consumer spec |
| `npm run check:package` | Packs the package, installs it into a temporary consumer, builds React and Svelte consumers, checks SSR |
| `npm run check:quality` | Knip analysis of the public entries and the Aislop CI gate |
| `npm run check:datasets` | Demo snapshots against the hashes and dimensions in `demo/public/alignments.json` |
| `npm run release:check` | Tests, type check, build, datasets, demo build and package check in one run |

Vitest tests pass `worker: false`, so the analysis functions run on the main thread. Set `AK_STATIC_PREVIEW` when a server already listens on port 4173. Playwright then skips starting its own server.

Name a test file after the behavior it covers, for example `tests/masking.test.ts`.

## Documentation

`tests/docs-api.test.ts` fails when the reference pages fall behind the code. It checks these rules:

- Every export of `src/index.ts`, `src/pavi.ts`, `src/react.tsx` and `src/svelte.ts` is named in a reference page.
- Every `ViewerOptions` key has one row in the options table of [api.md](docs/reference/api.md).
- Every public `AlignmentViewer` method has a row in the method table of api.md.
- Every default in `config/viewer-config.schema.json` equals the default in the `AlignmentViewer` constructor.
- Every relative link in the README and the reference pages points at an existing file.

A new reference page needs a row in the README table and no script change. `npm run build:guide` renders every page into `demo/public/guide/`. `npm run docs:api` writes the TypeDoc pages into `demo/public/guide/api/` and fails on a TypeDoc warning.

Read each documented name, default and signature from `src/` when writing it. The statistics definitions in [statistics.md](docs/reference/statistics.md) are asserted by tests. A change to a definition or a denominator is a scientific change and needs its own pull request.

## Demo data

`demo/public/` holds real Pfam and Rfam Stockholm snapshots. `demo/public/alignments.json` records the source URL, retrieval date, dimensions and SHA-256 hash of each snapshot. Run `npm run check:datasets` after any change to these files. Synthetic fixtures live in `demo/fixtures.ts`, and the demo labels them as synthetic.

## Source style

The code in `src/` is dense: short names, several statements per line and few comments. New code in `src/` follows the same style. A JSDoc comment on a public function or type states units, ranges and defaults, because TypeDoc and the reference pages read it.

Imports of the core, React and Svelte entries must stay safe on a server. No module may touch `document` or `window` while it loads.

A new package entry point needs two edits: the `exports` map in `package.json` and the `entryPoints` list in `scripts/build.mjs`.

## No copied implementation code

Do not copy implementation code from Nightingale, AlignmentViewer 2.0, React MSAViewer, BioJS MSA or PAVI. The palette data in `src/palettes.json` is the only intended reuse, and `THIRD_PARTY_NOTICES.md` attributes it. `npm run audit:similarity` runs the lexical comparison that [docs/source-similarity-audit.md](docs/source-similarity-audit.md) records. Run it after a large addition to `src/`.

## Scope

The library displays alignments that already exist. These tasks are out of scope: aligning sequences, gene retrieval, clinical interpretation, alignment editing, structure viewers and tree inference.

## Reporting a problem

Open an issue at <https://github.com/nuin/alignment-kit/issues>. State the package version, browser, operating system, alphabet and alignment dimensions. Attach a small alignment that shows the problem and holds no private data.
