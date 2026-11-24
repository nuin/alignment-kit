/* global MsaCanvas */
// anywidget front end. widget.py puts this text after msa-canvas.global.js in one module, so `MsaCanvas` is in scope and nothing is imported.
function render({ model, el }) {
  const host = document.createElement('div');
  el.appendChild(host);
  let view = null, sent = '', timer = 0;
  const push = (key, value) => { model.set(key, value); model.save_changes(); };
  const fail = error => push('error', String((error && error.message) || error));
  const handlers = {
    onSelection: value => push('selection', value),
    // State changes arrive in bursts; send the last one after 200 ms.
    onState: value => { clearTimeout(timer); timer = setTimeout(() => { sent = JSON.stringify(value); push('state', value); }, 200); },
    onReady: () => push('error', ''),
    onError: fail,
  };
  const doc = () => ({ ...model.get('alignment'), config: model.get('config') || {}, ...(model.get('state') ? { state: model.get('state') } : {}) });
  const show = () => {
    try {
      if (!model.get('alignment')) { if (view) view.destroy(); view = null; host.replaceChildren(); return; }
      if (view) view.update(doc()); else view = MsaCanvas.mountWire(host, doc(), handlers);
    } catch (error) { fail(error); }
  };
  // setOptions does not report a state change, so send the state that the new options produce.
  const onConfig = () => {
    try {
      if (!view) return;
      view.viewer.setOptions(MsaCanvas.parseViewerConfig(model.get('config') || {}));
      if (view.viewer.getAlignment()) handlers.onState(view.viewer.getState());
    } catch (error) { fail(error); }
  };
  const onState = () => {
    const state = model.get('state');
    if (view && state && JSON.stringify(state) !== sent) view.ready.then(() => view.setState(state)).catch(fail);
  };
  model.on('change:alignment', show);
  model.on('change:config', onConfig);
  model.on('change:state', onState);
  show();
  return () => {
    clearTimeout(timer);
    model.off('change:alignment', show); model.off('change:config', onConfig); model.off('change:state', onState);
    if (view) view.destroy();
  };
}
export default { render };
