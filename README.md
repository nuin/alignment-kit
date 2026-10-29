# MSA Canvas

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23752287.svg)](https://doi.org/10.5281/zenodo.23752287)

An embeddable multiple sequence alignment viewer for JavaScript, React and Svelte. It combines a virtualized residue matrix with a pinned reference, annotation tracks and exact column statistics. Nightingale residue palettes are included with attribution.

```sh
npm install @nuin/msa-canvas
```

Browser validation is not yet complete; see [validation and performance](docs/performance.md). Project page: <https://bioinformat.org/msa-canvas>.

Start with the [full user guide](docs/USER_GUIDE.md) for walkthroughs, palette meanings, statistical definitions, annotation workflows, exports, keyboard shortcuts and troubleshooting. The Explorer's **User guide** link opens a browsable version with palette previews at `/guide/index.html`. This README covers installation and a first example; the [developer reference](#developer-reference) covers the rest.

## Screenshots

Actual browser captures from the bundled real alignments. Click an image to inspect it at full size.

**Protein exploration:** CBS domain seed, 838 sequences, with reference, tracks and position inspector.

![Protein alignment with column statistics and position inspector](https://bioinformat.org/images/msa-canvas/protein-explorer.png)

**DNA/RNA coloring:** shown with the 954-sequence tRNA seed, a nucleotide palette, frequency logo and color legend.

![RNA alignment with the blue-orange nucleotide palette and legend](https://bioinformat.org/images/msa-canvas/rna-colors.png)

**Minimal embedding:** the same alignment with toolbars, overview, inspector and selected tracks hidden.

![Minimal alignment viewer with only sequence labels and selected tracks](https://bioinformat.org/images/msa-canvas/minimal-embed.png)

## Try it

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:4173**. The default dataset is the real Pfam CBS seed (838 sequences × 160 columns). The dataset buttons also provide clearly labeled synthetic stress fixtures and a synthetic annotated example. React and Svelte examples are linked in the header.

The **Real alignments** buttons load complete downloaded alignments locally, with no external API request during exploration:

| Alignment | Source | Sequences | Columns |
|---|---|---:|---:|
| CBS domain seed | [Pfam PF00571.34](https://www.ebi.ac.uk/interpro/entry/pfam/PF00571/) | 838 | 160 |
| Protein kinase seed | [Pfam PF00069.32](https://www.ebi.ac.uk/interpro/entry/pfam/PF00069/) | 37 | 419 |
| Globin full family | [Pfam PF00042.29](https://www.ebi.ac.uk/interpro/entry/pfam/PF00042/) | 20,705 | 672 |
| Transfer RNA seed | [Rfam RF00005](https://rfam.org/family/RF00005) | 954 | 118 |

These snapshots preserve all downloaded rows and columns, including gaps and Stockholm metadata. They are domain/family alignments, not necessarily full-length proteins. The tRNA secondary-structure metadata is retained but not rendered as a structure. Source URLs, retrieval dates, dimensions and SHA-256 hashes of decompressed Stockholm bytes are in `demo/public/alignments.json`. The demo provides source and alignment-download links. The full globin file is bundled as approximately 2.9 MB gzip. Run `npm run check:datasets` to verify all snapshots against their hashes, dimensions and the library parser.

If local servers are unavailable, `npm run preview:files` generates self-contained HTML files in `.preview/`. Open `.preview/index.html`, `.preview/react.html` or `.preview/svelte.html` in a browser. These include the alignment, styles, fonts and a blob worker, and require no network. The normal package uses an external module worker.

## Package locally

```sh
npm run build
npm pack
# In a consuming application:
npm install /path/to/nuin-msa-canvas-0.3.0.tgz
```

The core has no framework runtime dependency. React and Svelte are optional peers, imported only through their respective entry points. Build output includes module code, type declarations, a worker, CSS, fonts and the Svelte component source.

## JavaScript

```ts
import { createViewer, parseAlignment } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

const viewer = createViewer(document.querySelector('#alignment'), {
  height: 740,
  colorScheme: 'soft',
  showInspector: true,
});

await viewer.load('>reference\nAC-G\n>sample\nACTG', { alphabet: 'dna' });
const off = viewer.on('selection', selection => console.log(selection));

// Other input forms:
await viewer.load(file);            // File, Blob or ArrayBuffer; gzip detected by bytes
await viewer.loadUrl(alignmentUrl); // Server must allow CORS
await viewer.setAlignment(parseAlignment(alignedText, { alphabet: 'protein' }));

// On disposal:
off();
viewer.destroy();
```

`parseAlignment` reads aligned FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF and PIR/NBRF. See [input formats](docs/reference/formats.md).

## Developer reference

| Page | Contents |
|---|---|
| [React, Svelte, workers and Deno](docs/reference/frameworks.md) | React component, Svelte 5 component and action, callbacks, worker bundling, CSP, SSR, Deno and JSR |
| [Input formats and parser warnings](docs/reference/formats.md) | Supported alignment formats, A3M handling, warning codes and repairs |
| [Configuration, colors and themes](docs/reference/configuration.md) | `visibility` switches, JSON configuration and schema, palettes, colorblind-safe schemes, CSS properties |
| [API, events and controls](docs/reference/api.md) | Viewer methods, events, options, mouse and keyboard controls, alphabet guard, tooltips |
| [Annotations](docs/reference/annotations.md) | Annotation model, GFF3/BED/GenBank/EMBL/UniProt import, annotation export |
| [Coordinates and statistics](docs/reference/statistics.md) | Coordinate rules, row offsets, statistic definitions, column summary, consensus |
| [Columns, rows and tracks](docs/reference/display.md) | Hidden columns, reverse complement, column marks, match dots, row hiding, groups, trees, tracks |
| [Motif search](docs/reference/search.md) | IUPAC, PROSITE and regex search, strands, limits and timeouts |
| [Export and shareable links](docs/reference/export.md) | FASTA, CLUSTAL, Stockholm, PHYLIP, NEXUS, SVG, PNG, copy and paste, view links |

## Deno and JSR

```sh
deno add jsr:@nuin/msa-canvas
```

JSR publishes the core API without CSS, React, Svelte or PAVI entries. See [React, Svelte, workers and Deno](docs/reference/frameworks.md#deno-and-jsr).

## Development and validation

```sh
npm test                # scientific, parser, lifecycle, SSR and worker protocol tests
npm run check           # TypeScript + Svelte diagnostics
npm run build           # distributable library
npm run build:demo      # standalone + React + Svelte demo builds
npm run check:package   # extract package archive, build consumers using local peers; SSR checks
npm run test:browser    # Chromium and WebKit interaction tests
npm run benchmark      # Node model/statistics/index baseline (not browser FPS)
npm run preview:files  # self-contained local HTML demos
npm run build:guide    # browsable user guide and palette previews
npm run screenshots    # capture docs images from a running local demo
npm run release:check  # package preparation checks; does not publish
```

Targeted Chromium interaction checks and actual UI screenshots are available. The full CLI browser suite, WebKit and comprehensive accessibility/performance acceptance remain outstanding. See [performance report](docs/performance.md) for measured results and the exact outstanding acceptance checks. Aligning sequences, gene retrieval, clinical interpretation, editing alignments, structure viewers and tree inference are outside this library's scope.

## Citation

If you use MSA Canvas in your work, please cite the software using its [Zenodo DOI](https://doi.org/10.5281/zenodo.23752287). To cite the specific 0.3.0 release, use [10.5281/zenodo.23752288](https://doi.org/10.5281/zenodo.23752288). Citation metadata is also available in [CITATION.cff](CITATION.cff).

## License

MIT. See [LICENSE](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
