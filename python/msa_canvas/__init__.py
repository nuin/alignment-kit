"""Python binding of the msa-canvas alignment viewer."""

from .html import PLACEHOLDER, escape_json, fill_template, to_html
from .wire import WIRE_FORMAT, WIRE_VERSION, read_alignment, to_wire

__version__ = "0.6.0"
__all__ = [
    "PLACEHOLDER",
    "WIRE_FORMAT",
    "WIRE_VERSION",
    "MSAWidget",
    "escape_json",
    "fill_template",
    "read_alignment",
    "to_html",
    "to_wire",
]


def __getattr__(name):
    # anywidget is an optional extra, so the widget module loads on first use.
    if name == "MSAWidget":
        from .widget import MSAWidget

        return MSAWidget
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
