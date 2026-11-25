import {test,expect} from '@playwright/test';
import type {AlignmentViewer} from '../src/viewer';

test('the NJ tree button builds a tree in the worker and sorts rows by it',async({page})=>{
  await page.goto('/');await expect(page.locator('.ak-row-label').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {viewer}=(window as unknown as {alignmentDemo:{viewer:AlignmentViewer}}).alignmentDemo;
    await viewer.load('>h1\nAAAAAAAAAA\n>m1\nGGGGGAAAAA\n>h2\nAAAAAAAAAC\n>m2\nGGGGGAAAAT\n',{alphabet:'dna'});
  });
  const button=page.locator('[data-action="build-tree"]');
  await button.click();
  await expect(page.locator('.ak-tree-canvas')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {alignmentDemo:{viewer:AlignmentViewer}}).alignmentDemo.viewer.getState().sort)).toBe('tree');
  const names=(await page.locator('.ak-row-label').allTextContents()).map(t=>t.trim());
  const at=(n:string)=>names.findIndex(t=>t.startsWith(n));
  expect(Math.abs(at('m1')-at('m2'))).toBe(1);
});
