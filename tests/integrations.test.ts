import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AlignmentViewer } from '../src/react';
import { alignmentViewer } from '../src/svelte';
import { parseAlignment } from '../src/parsers';
it('React renders a stable empty host on the server without browser globals',()=>{
  const html=renderToString(createElement(AlignmentViewer,{alignment:parseAlignment('>a\nACGT'),className:'embedded'}));
  expect(html).toContain('embedded');expect(html).not.toContain('canvas');
});
it('Svelte action can be imported without mounting or accessing browser globals',()=>{
  expect(typeof alignmentViewer).toBe('function');
});
