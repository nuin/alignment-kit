# Python, R and other languages

Every binding sends [wire format 1](wire-format.md) to the same script-tag bundle. The bundle, the worker, the CSS and the fonts travel inside the package or the page, so a widget or a page makes no network request when it is viewed.

| Host | Path | Status |
| --- | --- | --- |
| Python script | `to_wire`, `to_html` | pytest, 28 tests, Python 3.15 |
| Jupyter, marimo, VS Code notebooks | `MSAWidget` (anywidget) | traits tested in pytest; front end run in jsdom; not run in a notebook |
| Streamlit, Dash | `to_html` in an iframe | page run in jsdom; not run in Streamlit or Dash |
| Shiny, R Markdown, Quarto (R) | `msacanvas()` (htmlwidgets) | front end run in jsdom; R code never run, R was not installed |
| Quarto (Python, OJS), Observable | embeds below | not run |
| Rust, Julia, any language | HTML template | contract tested in JavaScript and Python |

Neither package is published to PyPI or CRAN. Install both from a checkout, after the JavaScript build has been copied in:

```sh
npm ci && npm run build && npm run sync:bindings
```

`sync:bindings` copies `msa-canvas.global.js`, `style.inline.css` and `template.html` from `dist/` into `python/msa_canvas/static/`, `r/msacanvas/inst/htmlwidgets/lib/msa-canvas/` and `r/msacanvas/inst/template/`. The copies are git-ignored. The script stops when the version in `package.json` differs from the Python or R package version.

## Python

```sh
python3 -m venv python/.venv
python/.venv/bin/pip install -e "python[widget,test]"
python/.venv/bin/pytest python/tests
```

The base package has no dependencies. The `widget` extra adds anywidget.

```python
from msa_canvas import to_wire, to_html

doc = to_wire("family.sto.gz")                       # FASTA or Stockholm path, gzip accepted
doc = to_wire([("human", "MKV-LE"), ("mouse", "MKVQLE")], name="Pair", alphabet="protein")
doc = to_wire(alignment)                             # Biopython MultipleSeqAlignment or any records with id and seq
doc = to_wire(doc, tree="(human,mouse);", config={"height": 600})

html = to_html("family.sto.gz", path="view.html", theme="dark", height=600)
```

| Function | Behavior |
| --- | --- |
| `to_wire(source, *, name, alphabet, annotations, tree, config, state)` | Returns a wire document as dicts and lists. `source` is a path, alignment text, `(name, sequence)` pairs, mappings, objects with `id` and `seq`, a name-to-sequence mapping or a wire document. Raises `ValueError` for unequal lengths, invalid symbols and duplicate ids. |
| `to_html(source, *, path, theme, height, template, **parts)` | Returns the filled template as a string and writes it when `path` is given. |
| `fill_template(template, doc)`, `escape_json(text)` | The template contract of the [wire format page](wire-format.md#html-template). |
| `MSAWidget(source, *, config, state, **parts)` | Notebook widget. |

The Python reader handles aligned FASTA and Stockholm only. It keeps Stockholm row names, `name/start-end` offsets and the `#=GF ID` name, and drops other Stockholm markup. For the other five formats, or to keep the markup, convert with the command: `msa-canvas family.aln --json > family.json`, then `to_wire(json.load(open("family.json")))`. `config`, `state`, `tree` and `annotations` are validated in the browser.

### Jupyter, marimo and VS Code

```python
from msa_canvas import MSAWidget

widget = MSAWidget("family.sto.gz", config={"height": 600})
widget                      # show it
widget.selection            # {"start": 12, "end": 20, "rowId": "seq-3"} or None, set by the browser
widget.state                # the view state, updated about 200 ms after a change
widget.config = {**widget.config, "theme": "dark"}
widget.state = saved_state  # restore a view
widget.load("other.fasta")  # replace the alignment and drop the old state
widget.error                # last message from the browser, "" when none
```

| Trait | Direction | Content |
| --- | --- | --- |
| `alignment` | Python to browser | Wire document, or `None` for an empty output. |
| `config` | Python to browser | Viewer configuration. |
| `state` | both | View state. |
| `selection` | browser to Python | Selected column range, or `None`. |
| `error` | browser to Python | Validation or load error text. |

The front end is the bundle followed by `static/widget.js`, sent as one ES module string with the CSS. It imports nothing. In marimo, wrap it: `mo.ui.anywidget(MSAWidget(...))`. The analysis worker starts from a blob URL. A host whose content security policy forbids blob workers needs `config={"worker": False}`, which runs the same analysis on the main thread.

### Streamlit and Dash

```python
import streamlit as st
from msa_canvas import to_html

st.components.v1.html(to_html("family.sto.gz", height=600), height=620)
```

```python
from dash import Dash, html
from msa_canvas import to_html

app = Dash(__name__)
app.layout = html.Iframe(srcDoc=to_html("family.sto.gz", height=600), style={"width": "100%", "height": "620px", "border": 0})
```

The page fills the iframe when `height` is omitted. It posts `selection` and `state` messages to the parent window; see the [message table](wire-format.md#html-template). `st.components.v1.html` has no return channel, so Streamlit shows the alignment one way. A Dash clientside callback or a custom Streamlit component can listen for the messages. No such component is included.

## R

```sh
R CMD build r/msacanvas
R CMD INSTALL msacanvas_0.6.0.tar.gz
```

The package imports htmlwidgets and jsonlite. `DESCRIPTION` has no maintainer e-mail yet, which `R CMD check` requires.

```r
library(msacanvas)

msacanvas("family.sto.gz")
msacanvas(c(human = "MKV-LE", mouse = "MKVQLE"), name = "Pair", config = list(height = 600, theme = "dark"))
msa_html("family.sto.gz", file = "view.html")
```

| Function | Behavior |
| --- | --- |
| `msacanvas(x, config, state, tree, annotations, name, alphabet, width, height, elementId)` | The widget. `x` is a FASTA or Stockholm path, a named character vector, a list of rows or a wire document. |
| `msacanvasOutput(outputId, width, height)`, `renderMsacanvas(expr)` | Shiny output and render functions. |
| `msa_wire(x, ...)` | The wire document as a list. |
| `msa_html(x, file, ...)` | The filled HTML template, without htmlwidgets. |

R sends the document as JSON text written by `jsonlite::toJSON(auto_unbox = TRUE)`. An R vector of length one becomes a JSON scalar, so pass `config` and `state` as JSON strings when they hold one-element arrays or empty objects. `annotations[[i]]$consequence` is always written as an array.

### Shiny

```r
library(shiny)
library(msacanvas)

ui <- fluidPage(msacanvasOutput("aln", height = "650px"), verbatimTextOutput("picked"))
server <- function(input, output, session) {
  output$aln <- renderMsacanvas(msacanvas("family.sto.gz"))
  output$picked <- renderPrint(input$aln_selection)
}
shinyApp(ui, server)
```

| Input | Content |
| --- | --- |
| `input$<id>_selection` | `list(start, end, rowId)` or `NULL`. |
| `input$<id>_state` | The view state as a JSON string. Pass it back unchanged: `msacanvas(x, state = isolate(input$aln_state))`. |
| `input$<id>_error` | Error text from the browser. |

There is no proxy function: a new state reaches the browser by rendering the widget again.

### R Markdown and Quarto with R

A chunk that returns `msacanvas(...)` shows the widget. The widget height is the chunk output height unless `config$height` is set. With `self_contained: true` (R Markdown) or `embed-resources: true` (Quarto) the bundle and CSS are written into the document.

## Quarto with Python or OJS

With the Jupyter engine, `MSAWidget(...)` as the last expression of a cell renders through the notebook widget state. An iframe needs no widget support:

````markdown
```{python}
#| output: asis
from msa_canvas import to_html
to_html("family.sto.gz", path="alignment.html", height=600)
print('<iframe src="alignment.html" title="Alignment" style="width:100%;height:620px;border:0"></iframe>')
```
````

For OJS, copy `dist/msa-canvas.global.js` and `dist/style.inline.css` next to the document, load them in the header, and hand the wire document over with `ojs_define`:

````markdown
---
format:
  html:
    include-in-header:
      text: |
        <link rel="stylesheet" href="style.inline.css">
        <script src="msa-canvas.global.js"></script>
---

```{python}
from msa_canvas import to_wire
ojs_define(aln = to_wire("family.sto.gz"))
```

```{ojs}
viewer = {
  const el = document.createElement("div");
  const view = window.MsaCanvas.mountWire(el, aln, {}, { height: 600 });
  invalidation.then(() => view.destroy());
  return el;
}
```
````

## Observable

Observable Framework resolves `npm:` imports at build time and serves them from the site. Observable notebooks fetch them from a CDN when the notebook is viewed, so the no-network rule of the template does not hold there.

```js
import { createViewer, fromJson } from "npm:@nuin/msa-canvas";
```

```js
const { alignment, config } = fromJson(await FileAttachment("family.json").json());
const el = display(document.createElement("div"));
const viewer = createViewer(el, { ...config, height: 600 });
await viewer.setAlignment(alignment);
invalidation.then(() => viewer.destroy());
```

Add `<link rel="stylesheet" href="npm:@nuin/msa-canvas/style.inline.css">` to the page. `fromJson` is in releases after 0.5.2.

## Rust, Julia and any other language

A language needs a JSON library and string replacement. Take `template.html` from the npm package (`node_modules/@nuin/msa-canvas/dist/template.html`) at build time and follow the five steps of the [template contract](wire-format.md#html-template).

```rust
let template = std::fs::read_to_string("template.html")?;
let doc = serde_json::json!({
    "format": "msa-canvas", "version": 1,
    "alignment": { "name": "Pair", "rows": [
        { "name": "human", "sequence": "MKV-LE" },
        { "name": "mouse", "sequence": "MKVQLE" }
    ]}
});
let json = serde_json::to_string(&doc)?.replace('<', "\\u003c");
std::fs::write("view.html", template.replacen("{{MSA_PAYLOAD_JSON}}", &json, 1))?;
```

```julia
using JSON3
doc = (format = "msa-canvas", version = 1, alignment = (name = "Pair", rows = [(name = "human", sequence = "MKV-LE"), (name = "mouse", sequence = "MKVQLE")]))
json = replace(JSON3.write(doc), "<" => "\\u003c")
write("view.html", replace(read("template.html", String), "{{MSA_PAYLOAD_JSON}}" => json; count = 1))
```

Validate the document against [wire.schema.json](../../config/wire.schema.json) in the producing language, or open the page: an invalid document is shown as an error message in place of the viewer.

## What was run

Run:

- `python/.venv/bin/pytest python/tests`: 28 tests on Python 3.15 with anywidget 0.11.0. They cover `to_wire` on records, FASTA, Stockholm and gzip, `to_html` with `</script>` and `<!--` in the payload, the widget traits, and a check that `fromJson` of the npm build derives the same alignment id from `to_wire` output as from the JavaScript parser for the three Stockholm snapshots in `demo/public`.
- A wheel built with hatchling holds the three copied files and `widget.js`.
- `python/msa_canvas/static/widget.js` and `r/msacanvas/inst/htmlwidgets/msacanvas.js` in Vitest under jsdom, against the source of the bundle, with a stand-in anywidget model, a stand-in `HTMLWidgets` and a stand-in `Shiny`.
- `scripts/sync-bindings.mjs` into a temporary directory.

Not run:

- `MSAWidget` in JupyterLab, Jupyter Notebook, marimo, VS Code or Colab.
- Any R code: `R CMD build`, `R CMD check`, `msacanvas()`, `msa_wire()`, `msa_html()`, the FASTA and Stockholm readers, Shiny, R Markdown and Quarto. R was not installed on the machine that wrote the package.
- The Streamlit, Dash, Quarto, Observable, Rust and Julia snippets.
- Any binding in a real browser.
