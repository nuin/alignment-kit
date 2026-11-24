import pytest

pytest.importorskip("anywidget")

from msa_canvas.html import static_text  # noqa: E402


def widget_class():
    try:
        static_text("msa-canvas.global.js")
    except FileNotFoundError:
        pytest.skip("run npm run build and npm run sync:bindings to copy the bundle")
    from msa_canvas import MSAWidget

    return MSAWidget


def test_traits_and_front_end_text():
    MSAWidget = widget_class()
    widget = MSAWidget([("a", "AC-T"), ("b", "ACGT")], name="Pair", config={"height": 500}, tree="(a,b);")
    assert widget.alignment["alignment"] == {"rows": [{"name": "a", "sequence": "AC-T"}, {"name": "b", "sequence": "ACGT"}], "name": "Pair"}
    assert widget.alignment["tree"] == "(a,b);" and "config" not in widget.alignment
    assert widget.config == {"height": 500} and widget.state is None and widget.selection is None and widget.error == ""
    for name in ("alignment", "config", "state", "selection", "error"):
        assert widget.traits()[name].metadata["sync"] is True
    esm = str(MSAWidget._esm)
    assert esm.startswith('"use strict";var MsaCanvas=') and esm.rstrip().endswith("export default { render };")
    assert "url(data:font/woff2;base64," in str(MSAWidget._css)


def test_load_replaces_the_alignment_and_drops_the_state():
    widget = widget_class()([("a", "AC")], state={"version": 1})
    widget.selection = {"start": 1, "end": 1}
    widget.load([("x", "MKV"), ("y", "MKI")], name="Next")
    assert widget.alignment["alignment"]["name"] == "Next" and widget.state is None and widget.selection is None
    assert widget_class()().alignment is None
