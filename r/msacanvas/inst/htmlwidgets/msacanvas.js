/* global HTMLWidgets, MsaCanvas, Shiny */
// htmlwidgets binding. x.wire is wire format 1 JSON text written by msacanvas() in R; MsaCanvas is the global bundle listed in msacanvas.yaml.
HTMLWidgets.widget({
  name: 'msacanvas',
  type: 'output',
  factory: function (el, width, height) {
    var view = null, timer = 0, fixed = false;
    var clamp = function (value) { return Math.max(360, Math.min(2000, Math.round(value) || 650)); };
    // Shiny inputs: <id>_selection (object or null), <id>_state (JSON text, so that R hands it back unchanged) and <id>_error.
    var send = function (key, value) { if (HTMLWidgets.shinyMode && window.Shiny && Shiny.setInputValue && el.id) Shiny.setInputValue(el.id + '_' + key, value); };
    var fail = function (error) { send('error', String((error && error.message) || error)); };
    var handlers = {
      onSelection: function (value) { send('selection', value); },
      onState: function (value) { clearTimeout(timer); timer = setTimeout(function () { send('state', JSON.stringify(value)); }, 200); },
      onError: fail
    };
    return {
      renderValue: function (x) {
        if (view) { view.destroy(); view = null; }
        el.textContent = '';
        try {
          var doc = JSON.parse(x.wire);
          // A height in the configuration wins over the widget size.
          fixed = !!(doc.config && doc.config.height != null);
          view = MsaCanvas.mountWire(el, doc, handlers, { height: clamp(height || el.offsetHeight) });
        } catch (error) {
          var box = document.createElement('pre');
          box.setAttribute('role', 'alert');
          box.textContent = String((error && error.message) || error);
          el.appendChild(box);
          fail(error);
        }
      },
      resize: function (newWidth, newHeight) {
        height = newHeight;
        if (view && !fixed) view.viewer.setOptions({ height: clamp(newHeight) });
      },
      getView: function () { return view; }
    };
  }
});
