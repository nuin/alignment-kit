import { test, expect } from '@playwright/test';

const ready=async(page:any)=>{await page.goto('/');await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);};

test('threshold sliders and filters change the view',async({page})=>{
  await ready(page);
  for(const label of ['Consensus threshold','Color threshold','Minimum identity to reference','Minimum coverage'])await expect(page.getByLabel(label,{exact:true})).toBeVisible();
  await expect(page.getByLabel('Color threshold',{exact:true})).toBeDisabled();
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({colorScheme:'percent-identity'}));
  const slider=page.getByLabel('Color threshold',{exact:true});
  await expect(slider).toBeEnabled();
  await slider.fill('60');
  await expect(slider.locator('xpath=following-sibling::output')).toHaveText('60%');
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().colorThreshold)).toBeCloseTo(0.6);
  await page.getByLabel('Consensus threshold',{exact:true}).fill('50');
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().consensusThreshold)).toBeCloseTo(0.5);
  const total=await page.evaluate(()=>(window as any).alignmentDemo.viewer.getAlignment().rows.length);
  await page.getByLabel('Minimum coverage',{exact:true}).fill('99');
  await page.getByLabel('Minimum coverage',{exact:true}).blur();
  await expect(page.locator('.ak-status-main')).toContainText(' filtered');
  await expect(page.locator('.ak-status-main')).not.toContainText(`${total.toLocaleString()} filtered`);
});

test('the order menu offers the new sort keys',async({page})=>{
  await ready(page);
  await page.evaluate(async()=>{const v=(window as any).alignmentDemo.viewer;await v.setSort('gaps');});
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().sort)).toBe('gaps');
  const options=await page.locator('select[aria-label="Sequence order"] option').evaluateAll((list:any[])=>list.map(o=>o.value));
  expect(options).toEqual(expect.arrayContaining(['gaps','length','residue','annotations']));
  await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer;v.setSelection({start:5,end:5});return v.setSort('residue');});
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().sortColumn)).toBe(5);
  const order=await page.evaluate(()=>(window as any).alignmentDemo.viewer.setRowOrderFromNames([(window as any).alignmentDemo.viewer.getAlignment().rows[7].name]));
  expect(order).toEqual([]);
  expect(await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer;return v.getRowOrder()[0]===v.getAlignment().rows[7].id;})).toBe(true);
});
