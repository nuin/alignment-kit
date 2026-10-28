import { test, expect } from '@playwright/test';

test('reverse complement view redraws the grid, ruler label and status',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.load('>r\nAAAACCCC\n>s\nAAAACCCC\n>t\nAAAACCCC\n',{name:'dna'}));
  await page.waitForFunction(()=>{const v=(window as any).alignmentDemo.viewer;return v.getAlignment()?.width===8&&v.getStatistics()?.width===8;});
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const pixel=()=>page.evaluate(()=>{
    const canvas=document.querySelector<HTMLCanvasElement>('.ak-body-canvas')!,root=document.querySelector<HTMLElement>('.ak-viewer')!,dpr=Math.min(window.devicePixelRatio||1,3);
    const gutter=parseFloat(getComputedStyle(root).getPropertyValue('--ak-gutter')),d=canvas.getContext('2d')!.getImageData(Math.round((gutter+4)*dpr),Math.round(4*dpr),1,1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  });
  const box=page.getByLabel('Reverse complement',{exact:true});
  await expect(box).toBeEnabled();
  await frame();const forward=await pixel();
  await box.check();await frame();
  await expect(page.locator('.ak-status-detail')).toContainText('8–1');
  await expect(page.locator('.ak-status-detail')).toContainText('reverse complement');
  await expect(page.locator('.ak-track-labels span').first()).toContainText('reverse complement');
  const reversed=await pixel();
  expect(reversed).not.toBe(forward);
  await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer;v.setReverseComplement(false);v.setRowStrand('seq-2','-');});await frame();
  const flagged=await pixel();
  expect(flagged).not.toBe(forward);expect(flagged).not.toBe(reversed);
  const button=page.locator('[data-strand="seq-2"]');
  await expect(button).toHaveAttribute('aria-pressed','true');
  await button.click();await frame();
  expect(await pixel()).toBe(forward);
  await box.check();await box.uncheck();await frame();
  expect(await pixel()).toBe(forward);
});

test('reverse complement is disabled for protein alignments',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await expect(page.getByLabel('Reverse complement',{exact:true})).toBeDisabled();
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setReverseComplement(true));
  await expect(page.locator('.ak-message')).toContainText('DNA or RNA alignment');
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getReverseComplement())).toBe(false);
});
