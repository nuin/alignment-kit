# npm release preparation

The package is published to npm as `@nuin/msa-canvas`. The GitHub repository `nuin/alignment-kit` stays private; the npm package exposes its distributed code, source maps and included documentation.

## Release decisions

- Name: `@nuin/msa-canvas`, under the npm user scope `nuin`.
- License: MIT, copyright Bioinformat. Third-party MIT and OFL notices remain in `THIRD_PARTY_NOTICES.md`.
- First version: `0.1.0`, public, on the `latest` tag.
- Browser acceptance checks are still outstanding. Recorded local CPU benchmarks are not browser frame-rate measurements.

Authentication is checked with `npm whoami`. No credentials are stored in the repository.

## Reproduce the release candidate

Use Node 22 or later and the committed lockfile:

```sh
npm ci
npm run release:check
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

The package allowlist includes the distributable modules, declarations, module worker, CSS, fonts and their license; the README; user guide, screenshots and JSON configuration/schema; validation notes; and third-party notices. Synthetic/real demo alignments, benchmark scripts, audit source inventories, tests and development dependencies are not distributed as runtime assets.

Core has no runtime package dependencies. React and Svelte are optional peers. A consumer imports only the integration it uses. Source maps include implementation source; publishing the package is not a way to keep that implementation secret.

The packed-consumer check extracts the actual npm archive into a separate directory and builds React and Svelte consumers against locally installed framework peers. It checks SSR imports and validates required archive contents. It does not prove registry authentication, permission to publish, fresh-install behavior under every package manager or browser execution.

## Publishing a version

Bump the version in `package.json` and `package-lock.json` together. Keep the file allowlist and third-party notices intact. Rebuild and rerun the checks against that exact version.

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
