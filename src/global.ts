/** Entry of dist/msa-canvas.global.js: the core API, fromPavi, mountViewer and the <msa-canvas> element on one `MsaCanvas` global. */
export * from './index';
export { fromPavi } from './pavi';
export { mountViewer, mountWire } from './integration';
export type { WireHandlers } from './integration';
export { MsaCanvasElement } from './element';
