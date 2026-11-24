import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AlignmentViewer } from '../src/react';
import { alignmentViewer } from '../src/svelte';
import { parseAlignment } from '../src/parsers';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { AlignmentViewer as VueAlignmentViewer } from '../src/vue';
import { MsaCanvasElement } from '../src/element';
it('React renders a stable empty host on the server without browser globals',()=>{
  const html=renderToString(createElement(AlignmentViewer,{alignment:parseAlignment('>a\nACGT'),className:'embedded'}));
  expect(html).toContain('embedded');expect(html).not.toContain('canvas');
});
it('Svelte action can be imported without mounting or accessing browser globals',()=>{
  expect(typeof alignmentViewer).toBe('function');
});
it('Vue renders an empty host on the server without browser globals',async()=>{
  const html=await renderVue(createSSRApp(()=>h(VueAlignmentViewer,{alignment:parseAlignment('>a\nACGT'),class:'embedded'})));
  expect(html).toBe('<div class="embedded"></div>');
});
it('the custom element module imports on the server and defines nothing',()=>{
  expect(typeof HTMLElement).toBe('undefined');expect(typeof customElements).toBe('undefined');
  expect(typeof MsaCanvasElement).toBe('function');expect(Object.getOwnPropertyNames(MsaCanvasElement.prototype)).toEqual(expect.arrayContaining(['alignment','options','source','connectedCallback','disconnectedCallback']));
});
