import { expect, test } from 'vitest';
import { registerColorScheme } from '../src/colors';

test('legend classes reject non-hex colors and non-string text', () => {
  const base = { label: 'X', description: '', colors: { A: '#ffffff' } };
  expect(() => registerColorScheme({ ...base, id: 'bad-class-color', classes: [{ label: 'a', residues: 'A', color: 'red;background:url(x)"><img src=x onerror=alert(1)>' }] })).toThrow(/hex color/);
  expect(() => registerColorScheme({ ...base, id: 'bad-class-label', classes: [{ label: 1 as unknown as string, residues: 'A', color: '#fff' }] })).toThrow(/label/);
  expect(() => registerColorScheme({ ...base, id: 'good-classes', classes: [{ label: 'a', residues: 'A', color: '#abcdef' }] })).not.toThrow();
});
