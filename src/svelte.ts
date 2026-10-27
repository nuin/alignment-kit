import type { Action } from 'svelte/action';
import { mountViewer, type IntegrationProps } from './integration';
/** Svelte 5 (also compatible with Svelte 4 action syntax). */
export const alignmentViewer:Action<HTMLElement,IntegrationProps|undefined>=(element,props={})=>{
  const controller=mountViewer(element,props);
  return {update(next){controller.update(next??{});},destroy(){controller.destroy();}};
};
export type { IntegrationProps } from './integration';
