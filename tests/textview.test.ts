// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {formatTextView} from '../src/textview';
import {createAlignment} from '../src/model';
import {createViewer} from '../src/viewer';
import {parseViewerConfig} from '../src/config';
import {syncText} from '../src/viewer/textview';
import type {Core} from '../src/viewer/core';
const dna=()=>createAlignment([{id:'a',name:'Alpha',sequence:'ACGT-ACGTA',metadata:{start:101}},{id:'b',name:'Beta',sequence:'AC--TACGTT'}],{alphabet:'dna'});

it('writes blocks with column ruler, padded names and the last residue number per line',()=>{
  const t=formatTextView(dna(),{block:10});
  expect(t.text).toBe(['       1       10','Alpha  ACGT-ACGTA 109','Beta   AC--TACGTT 8',''].join('\n'));
  expect(t).toMatchObject({rows:2,omitted:0});
});

it('wraps at the block width and leaves the number off a block of gaps',()=>{
  const a=createAlignment([{id:'a',name:'A',sequence:'ACGTACGTAC----------'},{id:'b',name:'B',sequence:'ACGTACGTACACGTACGTAC'}],{alphabet:'dna'});
  const lines=formatTextView(a,{block:10}).text.split('\n');
  expect(lines[0]).toBe('   1       10');expect(lines[4]).toBe('   11      20');expect(lines[5]).toBe('A  ----------');expect(lines[6]).toBe('B  ACGTACGTAC 20');
});

it('follows row order, column order and strands, and drops rows past the limit',()=>{
  const a=dna(),t=formatTextView(a,{rows:[1,0],columns:[9,8,7,6,5,4,3,2,1,0],reverse:true,flagged:new Set([1]),block:10});
  const lines=t.text.split('\n');
  expect(lines[0]).toBe('       10       1');
  expect(lines[1]).toBe('Beta   TTGCAT--CA 1');
  expect(lines[2]).toBe('Alpha  TACGT-ACGT 101');
  expect(formatTextView(a,{limit:10})).toMatchObject({rows:1,omitted:1});
  expect(formatTextView(a,{columns:[]})).toEqual({text:'',rows:0,omitted:2});
});

it('cuts long names',()=>{
  const a=createAlignment([{id:'a',name:'N'.repeat(40),sequence:'MK'}],{alphabet:'protein'});
  expect(formatTextView(a).text.split('\n')[1].startsWith('N'.repeat(29)+'…  MK')).toBe(true);
});

const disposers:(()=>void)[]=[];
beforeAll(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});

it('toggles the text panel from the toolbar and follows hidden rows',async()=>{
  const el=document.createElement('div');document.body.append(el);const viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(dna());const core=(viewer as unknown as {core:Core}).core,pre=el.querySelector<HTMLPreElement>('.ak-text')!,button=el.querySelector<HTMLButtonElement>('[data-action="text-view"]')!;
  syncText(core);expect(pre.hidden).toBe(true);
  button.click();await Promise.resolve();syncText(core);
  expect(pre.hidden).toBe(false);expect(button.getAttribute('aria-pressed')).toBe('true');expect(pre.textContent).toContain('Beta');
  viewer.hideRows(['b']);syncText(core);expect(pre.textContent).not.toContain('Beta');
  viewer.setOptions({textView:false});syncText(core);expect(pre.hidden).toBe(true);
});

it('accepts textView in configuration and the visibility key',()=>{
  expect(parseViewerConfig({textView:true,visibility:{textView:false}})).toMatchObject({textView:true,visibility:{textView:false}});
  expect(()=>parseViewerConfig({textView:'yes'})).toThrow(/boolean/);
});
