# Wire format, schemas, HTML template and CLI

Wire format 1 is the JSON document that carries an alignment into the viewer from any language. `toJson` writes it, `fromJson` reads it, and the Python package, the R package, the `msa-canvas` command and `dist/template.html` all use it.

## Document

```json
{
  "format": "msa-canvas",
  "version": 1,
  "alignment": {
    "id": "51827c4a-838-160-protein",
    "name": "CBS",
    "alphabet": "protein",
    "rows": [
      { "id": "seq-1", "name": "Q9WZH4_THEMA/366-421", "sequence": "V--K-SIMST", "metadata": { "start": 366 } },
      { "id": "seq-2", "name": "O26357_METTH/1-52", "sequence": "MKVKDVM-TP", "species": "Methanothermobacter" }
    ],
    "metadata": { "format": "stockholm" }
  },
  "annotations": [
    { "id": "v1", "rowId": "seq-1", "label": "p.Ser5Ala", "start": 6, "end": 6, "kind": "variant", "mapping": "mapped" }
  ],
  "tree": "(Q9WZH4_THEMA/366-421:0.1,O26357_METTH/1-52:0.2);",
  "config": { "height": 600, "theme": "dark" },
  "state": { "version": 1, "referenceId": "seq-1", "query": "", "sort": "input", "start": 1, "rowOffset": 0, "cellWidth": 14, "selection": null, "colorScheme": "soft", "colorMode": "all", "statisticsScope": "all", "annotationFilter": {} }
}
```

| Key | Required | Rule |
| --- | --- | --- |
| `format` | yes | The string `msa-canvas`. |
| `version` | yes | The number `1`. Any other value is rejected. |
| `alignment.rows` | yes | One or more rows. Every `sequence` has the same length. |
| `rows[].name` | yes | Display name. Names may repeat. |
| `rows[].sequence` | yes | One character per column: a letter, `*`, or a gap (`-` or `.`). The reader stores upper case and `-`. |
| `rows[].id` | no | Unique in the alignment. Default `seq-N`, N from 1. Annotations, state and selections refer to it. |
| `rows[].species`, `rows[].metadata` | no | `metadata.start` (a positive integer) is the number of the first residue. |
| `alignment.id` | no | Kept when not empty. Otherwise derived from residues, row ids and row names. |
| `alignment.name` | no | Default `Untitled alignment`. |
| `alignment.alphabet` | no | `protein`, `dna` or `rna`. Detected from the residues when omitted. |
| `alignment.metadata` | no | Free-form. The parsers put `format`, `warnings`, `source` and `stockholm` here. |
| `annotations` | no | The [annotation model](annotations.md). `start` and `end` are one-based inclusive alignment columns and are required when `mapping` is `mapped`. |
| `tree` | no | One Newick tree. Leaves match row names. |
| `config` | no | A [viewer configuration](configuration.md). Custom tracks with a `render` function exist in JavaScript only. |
| `state` | no | A view state, as returned by `getState()`. |

Keys outside this table are rejected at the top level, in `alignment`, in a row and in an annotation. `metadata` objects accept any JSON.

A `state` in a document applies to the alignment in that document. The reader sets `state.alignmentId` to the id of that alignment, so a producer in another language can omit it. Row ids and columns in the state are still checked against the alignment when the state is applied.

## JavaScript API

```ts
import { toJson, fromJson, parseAlignment, createViewer } from '@nuin/msa-canvas';

const doc = toJson(parseAlignment(text), { tree, config: { height: 600 }, state: viewer.getState() });
const json = JSON.stringify(doc);

const { alignment, tree, config, state } = fromJson(json);   // text or a parsed value
const next = createViewer(element, config);
await next.setAlignment(alignment);
if (tree) next.setTree(tree);
if (state) await next.setState(state);
```

| Export | Behavior |
| --- | --- |
| `toJson(alignment, extras?)` | Returns a `WireDocument` of plain JSON values. `extras` holds `annotations` (replaces those of the alignment), `tree`, `config` and `state`; each is validated. |
| `fromJson(input)` | Returns `{ alignment, tree?, config?, state? }`. Does not change `input`. |
| `fillTemplate(template, doc)` | Returns the template with its placeholder replaced by the escaped JSON of `doc`. |
| `escapeJson(json)` | Replaces every `<` with `<`. |
| `WIRE_FORMAT`, `WIRE_VERSION`, `WIRE_PLACEHOLDER` | `"msa-canvas"`, `1`, `"{{MSA_PAYLOAD_JSON}}"`. |
| Types | `WireDocument`, `WireRow`, `WireExtras`, `WireContent`. |

The script-tag bundle adds `MsaCanvas.mountWire(element, input, handlers?, defaults?)`. It runs the five steps above and returns `{ viewer, ready, update(input), setState(state), destroy() }`. `handlers` are `onSelection`, `onState`, `onReady` and `onError`. `defaults` is a configuration that the document `config` overrides. `setState` applies a state to the loaded alignment whatever its `alignmentId`.

Errors are `Error` objects whose message starts with `Invalid msa-canvas document:` and names the key, for example `alignment.rows[3].sequence must be a string.` Rows of unequal length, invalid residue symbols, unknown annotation rows, configuration errors and Newick errors keep the messages of `createAlignment`, `parseViewerConfig` and `parseNewick`.

## Schemas

| File | Package export | `$id` |
| --- | --- | --- |
| [wire.schema.json](../../config/wire.schema.json) | `@nuin/msa-canvas/wire.schema.json` | `https://bioinformat.org/msa-canvas/schema/wire.schema.json` |
| [view-state.schema.json](../../config/view-state.schema.json) | `@nuin/msa-canvas/view-state.schema.json` | `https://bioinformat.org/msa-canvas/schema/view-state.schema.json` |
| [viewer-config.schema.json](../../config/viewer-config.schema.json) | `@nuin/msa-canvas/config.schema.json` | `https://bioinformat.org/msa-canvas/schema/viewer-config.schema.json` |

All three are JSON Schema draft 2020-12 and carry `"x-version": 1`. The `$id` values are identifiers; nothing is published at those addresses. `wire.schema.json` refers to the other two by relative `$ref`, so a validator needs all three files registered. The schemas check structure. Equal row lengths, unique row ids and annotation rows are checked by `fromJson`.

`view-state.schema.json` does not require `alignmentId`, because the wire reader fills it in. `setState` on the viewer still requires it.

## HTML template

`npm run build` writes `dist/template.html` (export `@nuin/msa-canvas/template.html`, 453 kB, 221 kB gzip). It is one page with the script-tag bundle, the inline worker and the CSS with fonts as data URLs inside. It holds no `src`, `href` or `@import` that points at another file, so it opens from `file:` and inside a sandboxed iframe with no network access.

The contract for any language:

1. Read the template as UTF-8 text.
2. Serialize a wire document as JSON.
3. In that JSON, replace every `<` with the six characters `<`.
4. Replace the single occurrence of `{{MSA_PAYLOAD_JSON}}` with the result, as a literal string and not as a regular expression replacement.
5. Write the page as UTF-8.

The placeholder sits inside `<script type="application/json" id="msa-payload">`. Step 3 is the whole escape rule. `<` occurs in JSON only inside strings, where `<` means the same character, so the value does not change. After the replacement the payload cannot contain `</script>` or `<!--`, the two sequences that end or corrupt a script element. Do not HTML-escape the JSON (`&lt;` would reach the viewer as four characters).

The page then:

- Calls `MsaCanvas.mountWire` on `<div id="msa">` with the payload. Without `config.height` the viewer takes the window height, held between 360 and 2000 px.
- Sets the document title to the alignment name.
- Shows a document that fails validation as text in `<pre id="msa-error" role="alert">`.
- Exposes the mount result as `window.msaCanvasView`.

Inside an iframe the page talks to its parent with `postMessage`:

| Direction | Message |
| --- | --- |
| page to parent | `{ source: 'msa-canvas', type: 'ready', value: { id, name, rows, width } }` |
| page to parent | `{ source: 'msa-canvas', type: 'selection', value: Selection \| null }` |
| page to parent | `{ source: 'msa-canvas', type: 'state', value: ViewState }` |
| page to parent | `{ source: 'msa-canvas', type: 'error', value: string }` |
| parent to page | `{ target: 'msa-canvas', type: 'state', value: ViewState }` |
| parent to page | `{ target: 'msa-canvas', type: 'selection', value: Selection \| null }` |

Outgoing messages use target origin `*`, because a page opened from `srcdoc` or `file:` cannot name its parent origin. They hold the alignment name, row ids, column numbers, the row filter and the search pattern, and no sequences. Incoming messages are accepted from the parent window only.

## Command line

```sh
npx @nuin/msa-canvas family.sto -o view.html
msa-canvas family.sto.gz -o view.html --config config.json --state state.json --theme dark --height 600
msa-canvas family.fasta --json > family.json
```

| Argument | Meaning |
| --- | --- |
| `<file>` | Aligned FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF or PIR; gzip is detected by its first two bytes. |
| `-o`, `--output` | Output file. Without it the result goes to standard output. |
| `--config` | Viewer configuration JSON, validated by `parseViewerConfig`. |
| `--state` | View state JSON saved from the viewer. |
| `--theme`, `--height` | Override the same keys of the configuration file. |
| `--name` | Alignment name. Default: the file name without `.gz`. |
| `--json` | Write the wire document in place of the page. |
| `-h`, `-v` | Help and version. |

Parser warnings go to standard error as `warning: ...`. A failure prints one line starting with `msa-canvas:` and exits with status 1. The command needs Node 22 and makes no network request.

## What was run

Run in Vitest (`npm test`):

- Round trips of `toJson` and `fromJson`, including a gzipped Pfam Stockholm snapshot, and every rejection listed above.
- The three schemas against `toJson` output and against the state of a live viewer, with Ajv 8 in 2020-12 mode.
- The template boot script in jsdom with a payload that holds `</script>` and `<!--`.
- The command on `demo/public/kinase-seed.sto.gz` and `demo/public/cbs-seed.sto`. The page it writes boots in jsdom, loads 838 rows and makes no `fetch` or `XMLHttpRequest` call.

Not run: the template in Chromium, WebKit or Firefox; the blob worker inside the template (the jsdom run uses `worker: false`); the `postMessage` bridge inside a real iframe.
