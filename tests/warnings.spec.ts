import { test, expect } from '@playwright/test';

test('the status bar badge opens the parser warnings list',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await expect(page.locator('.ak-warnings')).toBeHidden();
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.load('>a\nAC?GTACGTACG\n>a\nACGGTACGTACG\n>b\nACGGTACGTACG'));
  await page.waitForFunction(()=>(window as any).alignmentDemo.viewer.getWarnings().length===2);
  const badge=page.locator('.ak-warnings');
  await expect(badge).toBeVisible();await expect(badge).toHaveText('2 warnings');
  await badge.click();
  await expect(page.locator('.ak-message li')).toHaveCount(2);
  await expect(page.locator('.ak-message')).toContainText('invalid-residue');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('.ak-message')).toBeHidden();
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({visibility:{warnings:false}}));
  await expect(badge).toBeHidden();
});

test('scroll accessors move the real viewport',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  const result=await page.evaluate(()=>{
    const v=(window as any).alignmentDemo.viewer,ids=v.getVisibleRows(),before=v.getVisibleColumns();
    const rowOk=v.scrollToRow(ids[10]),colOk=v.scrollToColumn(100),after=v.getVisibleColumns();
    return {rowOk,colOk,before,after,top:document.querySelector('.ak-scroll')!.scrollTop};
  });
  expect(result.rowOk).toBe(true);expect(result.colOk).toBe(true);
  expect(result.before.start).toBe(1);expect(result.after.start).toBe(100);expect(result.top).toBeGreaterThan(0);
});
