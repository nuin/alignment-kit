"""Fill the msa-canvas HTML template: one page, no network requests when it is viewed."""

from __future__ import annotations

import json
import os
from importlib import resources
from typing import Any

from .wire import to_wire

PLACEHOLDER = "{{MSA_PAYLOAD_JSON}}"


def static_text(name: str) -> str:
    """Text of a file copied into ``msa_canvas/static`` by ``scripts/sync-bindings.mjs``."""
    try:
        return (
            resources.files(__package__)
            .joinpath("static", name)
            .read_text(encoding="utf-8")
        )
    except FileNotFoundError:
        raise FileNotFoundError(
            f'msa_canvas/static/{name} is missing. In a checkout, run "npm run build" and "npm run sync:bindings" first.'
        ) from None


def escape_json(text: str) -> str:
    """Make JSON text safe inside a script element: every ``<`` becomes ``\\u003c``.

    ``</script>`` and ``<!--`` then cannot occur. ``<`` only occurs inside JSON strings, so
    the result parses to the same value.
    """
    return text.replace("<", "\\u003c")


def fill_template(template: str, doc: Any) -> str:
    """Replace the single placeholder of ``template`` with ``doc`` as escaped JSON."""
    if template.count(PLACEHOLDER) != 1:
        raise ValueError(f"The template must contain {PLACEHOLDER} exactly once.")
    return template.replace(
        PLACEHOLDER,
        escape_json(
            json.dumps(doc, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        ),
    )


def to_html(
    source: Any,
    *,
    path: str | os.PathLike[str] | None = None,
    theme: str | None = None,
    height: int | None = None,
    template: str | None = None,
    **parts: Any,
) -> str:
    """Return a self-contained HTML page that shows ``source``.

    ``source`` and the keyword arguments ``name``, ``alphabet``, ``annotations``, ``tree``,
    ``config`` and ``state`` are those of :func:`to_wire`. ``theme`` (``"light"`` or
    ``"dark"``) and ``height`` (360 to 2000 pixels) override the same keys of ``config``.
    ``path`` also writes the page to a file. ``template`` replaces the bundled template.
    """
    doc = to_wire(source, **parts)
    config = dict(doc.get("config") or {})
    if theme is not None:
        config["theme"] = theme
    if height is not None:
        config["height"] = height
    if config:
        doc["config"] = config
    html = fill_template(
        static_text("template.html") if template is None else template, doc
    )
    if path is not None:
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(html)
    return html
