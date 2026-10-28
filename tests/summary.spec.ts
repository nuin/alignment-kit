import { test, expect } from '@playwright/test';

test('Summary tab shows alignment counts, then the selected block, and pages variable columns',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await page.locator('[data-tab=summary]').click();
  await expect(page.locator('.ak-inspector-content')).toContainText('All columns');
  await expect(page.locator('.ak-inspector-content')).toContainText('Variable columns');
  await expect(page.locator('.ak-variants tbody tr')).toHaveCount(20);
  await page.locator('[data-action=summary-next]').click();
  await expect(page.locator('.ak-inspector-actions span')).toContainText('2 /');
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setSelection({start:3,end:12}));
  await expect(page.locator('[data-tab=summary]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.ak-inspector-content')).toContainText('Selected columns 3–12');
  await expect(page.locator('.ak-inspector-content')).toContainText('Identity to');
  const block=await page.evaluate(()=>(window as any).alignmentDemo.viewer.getSummary({start:3,end:12}));
  expect(block.columns).toBe(10);
  expect(block.conserved+block.constantWithGaps+block.variable+block.gapOnly).toBe(10);
});
