# msa-canvas for Python

Python binding of the [msa-canvas](https://github.com/nuin/alignment-kit) alignment viewer.

- `to_wire(source)` builds a wire format 1 document from records or a FASTA or Stockholm path. Pure Python, no dependencies.
- `to_html(source)` returns one self-contained HTML page. Use it in an iframe in Streamlit or Dash.
- `MSAWidget(source)` is an [anywidget](https://anywidget.dev) widget for Jupyter, marimo and VS Code. Install it with `pip install "msa-canvas[widget]"`.

The viewer bundle, CSS and HTML template are build outputs of the JavaScript package. From a checkout, copy them in before installing:

```sh
npm ci && npm run build && npm run sync:bindings
python3 -m venv python/.venv
python/.venv/bin/pip install -e "python[test]"
python/.venv/bin/pytest python/tests
```

The page and the widget load no file from the network. See `docs/reference/languages.md` and `docs/reference/wire-format.md` in the repository.
