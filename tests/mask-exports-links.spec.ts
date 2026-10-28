import { test, expect } from '@playwright/test';

const ready=(page:import('@playwright/test').Page)=>page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);

test('Visible columns only collapses hidden columns in the SVG export',async({page})=>{
  await page.goto('/');await ready(page);
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({hideGapColumns:0.9}));
  const box=page.getByLabel('Visible columns only');
  await expect(box).toBeVisible();await box.check();
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getSelectionText().length)).toBeGreaterThan(0);
  const download=async()=>{
    const [file]=await Promise.all([page.waitForEvent('download'),(async()=>{await page.getByRole('combobox',{name:'Export alignment',exact:true}).click();await page.getByRole('option',{name:'Selection · SVG'}).click();})()]);
    return (await import('node:fs')).readFileSync((await file.path())!,'utf8');
  };
  const masked=await download();
  expect(masked).toContain('hidden column');expect(masked).toContain('<line ');
  await box.uncheck();
  expect(await download()).not.toContain('<line ');
});

test('a link with find reruns the motif search after load',async({page})=>{
  await page.goto('/#find=GG&findmode=literal');await ready(page);
  await page.waitForFunction(()=>(window as any).alignmentDemo.viewer.getState().find==='GG');
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().findMode)).toBe('literal');
  await expect(page.getByLabel('Find motif')).toHaveValue('GG');
  await expect.poll(()=>page.evaluate(()=>location.hash)).toContain('find=GG');
});
