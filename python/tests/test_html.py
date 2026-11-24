import json
import re
from html.parser import HTMLParser

import pytest

from msa_canvas import PLACEHOLDER, escape_json, fill_template, to_html
from msa_canvas.html import static_text

TEMPLATE = f'<!doctype html><title>t</title><div id="msa"></div><script type="application/json" id="msa-payload">{PLACEHOLDER}</script><script>boot()</script>'
HOSTILE = [("</script><script>alert(1)</script>", "ACGT"), ("<!-- <script> b</SCRIPT >", "AC-T")]


class Scripts(HTMLParser):
    """Collects the text of each script element the way a browser tokenizer delimits it."""

    def __init__(self):
        super().__init__()
        self.scripts, self.other, self.open = [], [], None

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.open = dict(attrs)
            self.scripts.append([self.open, ""])
        else:
            self.other.append(tag)

    def handle_endtag(self, tag):
        if tag == "script":
            self.open = None

    def handle_data(self, data):
        if self.open is not None:
            self.scripts[-1][1] += data


def scripts(html):
    parser = Scripts()
    parser.feed(html)
    parser.close()
    return parser


def test_escape_rule():
    assert escape_json('"a<b"') == '"a\\u003cb"'
    text = json.dumps({"name": "</script><!--", "n": 1})
    assert "<" not in escape_json(text) and json.loads(escape_json(text)) == json.loads(text)


def test_payload_with_script_end_tag_and_comment_opener_stays_inside_its_element():
    html = to_html(HOSTILE, name="<!-- x -->", template=TEMPLATE)
    assert html.count("</script") == 2 and "<!--" not in html and PLACEHOLDER not in html
    parsed = scripts(html)
    assert len(parsed.scripts) == 2 and parsed.other == ["title", "div"]
    attrs, body = parsed.scripts[0]
    assert attrs == {"type": "application/json", "id": "msa-payload"}
    doc = json.loads(body)
    assert [row["name"] for row in doc["alignment"]["rows"]] == [name for name, _ in HOSTILE] and doc["alignment"]["name"] == "<!-- x -->"


def test_theme_height_and_parts_reach_the_payload():
    html = to_html([("a", "AC")], template=TEMPLATE, theme="dark", height=480, config={"height": 700, "cellWidth": 12}, tree="(a);")
    doc = json.loads(scripts(html).scripts[0][1])
    assert doc["config"] == {"height": 480, "cellWidth": 12, "theme": "dark"} and doc["tree"] == "(a);"
    assert "config" not in json.loads(scripts(to_html([("a", "AC")], template=TEMPLATE)).scripts[0][1])


def test_non_ascii_names_and_backslash_sequences_survive():
    names = ["Señor λ \\u003c \\1 \\g<0>", "日本語"]
    doc = json.loads(scripts(to_html([(names[0], "AC"), (names[1], "AC")], template=TEMPLATE)).scripts[0][1])
    assert [row["name"] for row in doc["alignment"]["rows"]] == names


def test_template_needs_exactly_one_placeholder():
    for template in ("no marker", PLACEHOLDER * 2):
        with pytest.raises(ValueError, match="exactly once"):
            fill_template(template, {})
    with pytest.raises(ValueError):
        fill_template(TEMPLATE, {"x": float("nan")})


def test_bundled_template_is_self_contained(tmp_path, demo):
    try:
        template = static_text("template.html")
    except FileNotFoundError:
        pytest.skip("run npm run build and npm run sync:bindings to copy the template")
    assert template.count(PLACEHOLDER) == 1
    out = tmp_path / "view.html"
    html = to_html(demo / "kinase-seed.sto.gz", path=out, height=500)
    assert out.read_text(encoding="utf-8") == html and PLACEHOLDER not in html
    parsed = scripts(html)
    assert len(parsed.scripts) == 3 and all("src" not in attrs for attrs, _ in parsed.scripts) and "link" not in parsed.other
    doc = json.loads(parsed.scripts[0][1])
    assert len(doc["alignment"]["rows"]) == 37 and doc["alignment"]["name"] == "Pkinase" and doc["config"] == {"height": 500}
    assert "MsaCanvas.mountWire(" in parsed.scripts[2][1]
    assert not re.search(r"<script[^>]*\ssrc=|<link\b|@import|url\(\s*[\"']?(?:https?:)?//", html, re.I)
