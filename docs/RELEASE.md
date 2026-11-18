# Release preparation

The package is published to npm and JSR as `@nuin/msa-canvas`. The GitHub repository `nuin/alignment-kit` is public. Each release has a `v<version>` git tag and a GitHub release.

## Release decisions

- Name: `@nuin/msa-canvas`, under the npm user scope `nuin` and the JSR scope `@nuin`.
- License: MIT, copyright Bioinformat. Third-party MIT and OFL notices remain in `THIRD_PARTY_NOTICES.md`.
- Versions: `0.1.0` (commit `0e1b6ef`, tag `v0.1.0`), then `0.2.0`, `0.3.0`, `0.4.0` and `0.5.0`, public, on the `latest` tag. The `v0.5.1` source tag was preserved after its release job was cancelled before registry publication; `0.5.2` includes those changes and the mirror fix below.
- JSR publishes the core TypeScript source (`deno.json`). React, Svelte, PAVI and CSS stay npm-only.

## Automated release

`.github/workflows/release.yml` runs when a `v*` tag is pushed. It checks that the tag matches the version in `package.json` and `deno.json`. It runs `release:check`, Knip/Aislop and the Chromium/WebKit suite before `npm publish` (trusted publishing, with provenance), `deno publish` and `gh release create --generate-notes`. Pull-request CI runs the same package, quality and browser checks plus `deno publish --dry-run`, and retains browser reports, failure screenshots and traces for 14 days.

Both workflows use Ubuntu 24.04, which is supported by the locked Playwright version. Update the runner image and browser tooling together; the Ubuntu 26.04 image behind `ubuntu-latest` cannot install this version's browser dependencies.

Before installing browser dependencies, both workflows select Ubuntu's official HTTPS archive and security mirror in the runner's APT mirror list. The runner's regional AWS mirror repeatedly downloaded packages at only tens of kilobytes per second during the 0.5.1 release. This override follows the [runner image's APT mirror configuration](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh) and retains signed-package verification.

One-time setup:

- On npmjs.com, open `@nuin/msa-canvas` > Settings > Trusted publishing and add GitHub Actions: owner `nuin`, repository `alignment-kit`, workflow `release.yml`. npm then accepts the workflow's OIDC token, so no npm token is stored.
- Create the `@nuin/msa-canvas` package on jsr.io and link it to `nuin/alignment-kit` in its settings. JSR then accepts the workflow's GitHub OIDC token, so no JSR secret is stored.

To release: bump `version` in `package.json`, `package-lock.json` and `deno.json` together, add notes to `CHANGELOG.md`, merge to master after CI passes, then create and push the matching annotated tag on that merge commit (for example, `git tag -a v0.5.2 -m v0.5.2` followed by `git push origin v0.5.2`).
- Review the current [browser performance and accessibility evidence](performance.md) before tagging. Timing results are hardware-specific; native screen-reader testing has a separate status.

Authentication is checked with `npm whoami`. No credentials are stored in the repository.

## Reproduce the release candidate

Use Node 22.20 or later and the committed lockfile:

```sh
npm ci
npm run release:check
npm run check:quality
npx playwright install chromium webkit
npm run test:browser
deno publish --dry-run --allow-dirty
npm pack --dry-run
npm pack
```

`release:check` runs unit/lifecycle/SSR/worker tests, TypeScript and Svelte checks, the distributable build, real-dataset verification, demo/guide build, and packed React/Svelte consumer builds. Browser interaction tests run separately:

```sh
npx playwright install chromium webkit
npm run test:browser
```

Review menus in both themes, keyboard navigation, narrow layouts, protein/DNA/RNA switching, all palette legends, data replacement, mount/unmount, real large-alignment scrolling and figure exports. Confirm workers load from the packed package in supported browsers. See [performance and validation](performance.md).

## Package contents

The package allowlist includes the distributable modules, declarations, module worker, CSS, fonts and their license; the README; developer reference pages (`docs/reference`); user guide, screenshots and JSON configuration/schema; validation notes; and third-party notices. Synthetic/real demo alignments, benchmark scripts, audit source inventories, tests and development dependencies are not distributed as runtime assets.

Core has no runtime package dependencies. React and Svelte are optional peers. A consumer imports only the integration it uses. Source maps include implementation source; publishing the package is not a way to keep that implementation secret.

The packed-consumer check extracts the actual npm archive into a separate directory and builds React and Svelte consumers against locally installed framework peers. It checks SSR imports and validates required archive contents. The browser suite opens these built consumers and checks worker execution, styles and coordinate navigation in Chromium and WebKit. These checks do not prove registry authentication, permission to publish or fresh-install behavior under every package manager.

## Publishing a version

Bump the version in `package.json`, `package-lock.json` and `deno.json` together. Keep the file allowlist and third-party notices intact. Rebuild and rerun the checks against that exact version.

Check the intended account and inspect the archive before the irreversible registry step:

```sh
npm whoami --registry=https://registry.npmjs.org
npm pack --dry-run
```

Publish to the `latest` tag (use `--tag next` for a prerelease):

```sh
npm publish --access public --registry=https://registry.npmjs.org
```

Use the authentication/2FA workflow required by npm. Do not place one-time codes or tokens in files or commit messages. Do not use the public-access command for an intended private package. After publication, verify the registry's name, version, access and tarball, install that exact registry version in clean JavaScript/React/Svelte consumers, and verify worker/CSS resolution. Record the published version and its source commit.

Official references: [publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), [package.json fields](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), and [package README guidance](https://docs.npmjs.com/about-package-readme-files/).
