"""anywidget front end for Jupyter, marimo and VS Code. Needs the ``widget`` extra."""

from __future__ import annotations

from typing import Any

try:
    import anywidget
    import traitlets
except ImportError as error:  # pragma: no cover
    raise ImportError('MSAWidget needs anywidget. Install it with: pip install "msa-canvas[widget]"') from error

from .html import static_text
from .wire import to_wire


class MSAWidget(anywidget.AnyWidget):
    """Alignment viewer widget.

    ``alignment`` is a wire format 1 document, ``config`` a viewer configuration, ``state``
    the view state (sent to the browser and updated from it) and ``selection`` the selected
    column range (``{"start", "end", "rowId"?}`` or ``None``, set by the browser). ``error``
    holds the last message from the browser. The front end is the global bundle followed by
    ``static/widget.js``; both are sent as text, so the browser loads nothing else.
    """

    # The bundle declares `var MsaCanvas`; inside one module the widget code below it sees that binding.
    _esm = static_text("msa-canvas.global.js") + "\n" + static_text("widget.js")
    _css = static_text("style.inline.css")

    alignment = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)
    config = traitlets.Dict().tag(sync=True)
    state = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)
    selection = traitlets.Dict(allow_none=True, default_value=None).tag(sync=True)
    error = traitlets.Unicode("").tag(sync=True)

    def __init__(self, source: Any = None, *, config: dict[str, Any] | None = None, state: dict[str, Any] | None = None, **parts: Any) -> None:
        """``source`` and ``parts`` (``name``, ``alphabet``, ``annotations``, ``tree``) are those of ``to_wire``."""
        doc = None if source is None else to_wire(source, **parts)
        if doc is not None:
            config = {**doc.pop("config", {}), **(config or {})}
            state = state if state is not None else doc.pop("state", None)
        super().__init__(alignment=doc, config=config or {}, state=state)

    def load(self, source: Any, **parts: Any) -> None:
        """Show another alignment. The view state of the previous one is dropped."""
        with self.hold_sync():
            self.state = None
            self.selection = None
            self.alignment = to_wire(source, **parts)
