# npm release preparation

The library is not published to npm. The repository remains private at `nuin/alignment-kit`. A public npm package would expose its distributed code and included documentation even if the GitHub repository stays private. This preparation does not change repository visibility.

## Decisions before publication

- Confirm the npm account/scope and final package name. The current development name is `@alignment-kit/viewer`; `@nuin/alignment-kit` is a proposal, not an assigned namespace. A registry 404 is not proof that an account can publish the name.
- Confirm the project license and copyright holder. MIT is proposed; third-party MIT and OFL notices must remain. No project license has been selected yet.
- Confirm public versus restricted npm access and the first version/tag. A preview such as `0.1.0-beta.1` under the `next` tag makes the initial status explicit.
- Complete outstanding browser acceptance checks before calling the library production-ready. Recorded local CPU benchmarks are not browser frame-rate measurements.

`package.json` retains `private: true` until the name/license/release decision is confirmed. This intentionally prevents accidental publication. No credentials are stored in the repository. Authentication must be checked through `npm whoami`, without copying tokens into source or documentation.

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

## Final publication, after approval

First update the confirmed name, license, version, package-lock metadata, examples and documentation together. Add the approved project LICENSE and remove `private: true` only for the approved release. Keep the file allowlist and third-party notices intact. Rebuild and rerun the checks against that exact version.

Check the intended account and inspect the archive before the irreversible registry step:

```sh
npm whoami --registry=https://registry.npmjs.org
npm pack --dry-run
```

For an approved **public scoped beta**, the publication command is:

```sh
npm publish --access public --tag next --registry=https://registry.npmjs.org
```

Use the authentication/2FA workflow required by npm. Do not place one-time codes or tokens in files or commit messages. Do not use the public-access command for an intended private package. After publication, verify the registry's name, version, access and tarball, install that exact registry version in clean JavaScript/React/Svelte consumers, and verify worker/CSS resolution. Record the published version and its source commit.

Official references: [publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), [package.json fields](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), and [package README guidance](https://docs.npmjs.com/about-package-readme-files/).
