import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseViewerConfig} from '../src/config';

const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const block=(start:string)=>{const a=css.indexOf(start);expect(a,start).toBeGreaterThanOrEqual(0);return css.slice(a,css.indexOf('}',a));};
const names=(text:string)=>[...text.matchAll(/(--ak-[a-z-]+):/g)].map(m=>m[1]);
const colorTokens=['--ak-bg','--ak-panel','--ak-ink','--ak-muted','--ak-line','--ak-accent','--ak-hover','--ak-line-strong','--ak-accent-soft','--ak-danger','--ak-danger-bg','--ak-warn','--ak-feature','--ak-scrollbar','--ak-shadow','--ak-shadow-sm'];

it('keeps the original tokens and the accent hue, and adds size, radius, mono and state tokens',()=>{
  const light=block('.ak-viewer{'),defined=names(light);
  for(const token of [...colorTokens,'--ak-gutter','--ak-row-height','--ak-text-xs','--ak-text-sm','--ak-text-md','--ak-text-lg','--ak-text-xl','--ak-radius-sm','--ak-radius','--ak-radius-lg','--ak-mono','--ak-control'])expect(defined,token).toContain(token);
  expect(light).toContain('--ak-accent:#2463a6');expect(light).toContain('--ak-text-xs:11px');
});
it('defines every color token again for the dark theme and for auto under prefers-color-scheme',()=>{
  const dark=block('.ak-viewer[data-theme=dark]{'),auto=block('@media(prefers-color-scheme:dark){.ak-viewer[data-theme=auto]{');
  for(const token of colorTokens){expect(names(dark),token).toContain(token);expect(names(auto),token).toContain(token);}
  expect(auto.slice(auto.indexOf('--ak-bg'))).toBe(dark.slice(dark.indexOf('--ak-bg')));
  expect(dark).toContain('color-scheme:dark');
});
it('accepts the auto theme in a viewer configuration',()=>{
  expect(parseViewerConfig({theme:'auto'})).toEqual({theme:'auto'});
  expect(()=>parseViewerConfig({theme:'system'})).toThrow(/theme/);
  const schema=JSON.parse(readFileSync(new URL('../config/viewer-config.schema.json',import.meta.url),'utf8'));
  expect(schema.properties.theme.enum).toEqual(['light','dark','auto']);
});
it('uses tokens for text sizes, with nothing below 11px and no literal theme colors in rules',()=>{
  const rules=css.slice(css.indexOf('/* Base controls. */'));
  const sizes=[...rules.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1]));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  // Icon glyph sizes (pin, hide, strand, close) are the only literal font sizes left.
  expect([...new Set(sizes)].sort((a,b)=>a-b)).toEqual([14,15,16]);
  // One literal remains: the white inner edge of the overview window, which sits on residue colors in both themes.
  expect([...rules.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m=>m[0])).toEqual(['#ffffffb0']);
  expect(rules).not.toMatch(/ui-monospace/);
});
it('covers forced colors, reduced motion, coarse pointers and narrow viewers',()=>{
  const forced=css.slice(css.indexOf('@media(forced-colors:active)'));
  for(const selector of ['[role=tab][aria-selected=true]','button[aria-pressed=true]','.ak-select-option[data-active=true]'])expect(forced).toContain(selector);
  expect(forced).toContain('Highlight');
  const motion=css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'),css.indexOf('@media(forced-colors:active)'));
  expect(motion).toContain('transition:none!important');expect(motion).toContain('animation:none!important');
  const coarse=css.slice(css.indexOf('@media(pointer:coarse)'),css.indexOf('@media(prefers-reduced-motion:reduce)'));
  expect(coarse).toContain('--ak-control:44px');expect(coarse).not.toContain('--ak-row-height');
  for(const width of ['480px','700px','800px'])expect(css).toContain(`@container ak (max-width:${width})`);
  expect(css).toMatch(/\.ak-viewer :is\([^)]*\.ak-scroll[^)]*\.ak-reference-label[^)]*\):focus-visible\{outline-offset:-2px\}/);
});
