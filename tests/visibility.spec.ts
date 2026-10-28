import { test, expect } from '@playwright/test';

test('visibility changes collapse layout, close menus, and preserve the alignment',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await page.getByRole('combobox',{name:'Color scheme',exact:true}).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.evaluate(()=>{const viewer=(window as any).alignmentDemo.viewer;viewer.setSelection({start:3,end:5});viewer.setOptions({visibility:{colorScheme:false,labels:false,tracks:false,overview:false,positionTab:false}});});
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.locator('.ak-scheme-label')).toBeHidden();
  await expect(page.locator('.ak-tracks')).toBeHidden();
  await expect(page.locator('.ak-overview-wrap')).toBeHidden();
  await expect(page.locator('[data-tab=annotations]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>({gutter:getComputedStyle(document.querySelector('.ak-viewer')!).getPropertyValue('--ak-gutter'),rows:(window as any).alignmentDemo.viewer.getStatistics().total,selection:(window as any).alignmentDemo.viewer.getState().selection}))).toEqual({gutter:'0px',rows:838,selection:{start:3,end:5}});
  await page.evaluate(()=>{const viewer=(window as any).alignmentDemo.viewer;viewer.setOptions({visibility:Object.fromEntries(Object.keys(viewer.getVisibility()).map(k=>[k,false]))});});
  for(const selector of ['.ak-toolbar','.ak-tools','.ak-inspector','.ak-status','.ak-grid'])await expect(page.locator(selector)).toBeHidden();
  await page.getByText('Customize viewer',{exact:true}).click();
  await page.getByRole('button',{name:'Restore default view'}).click();
  await expect(page.locator('.ak-scroll')).toBeVisible();await expect(page.locator('.ak-labels')).toBeVisible();
  await expect(page.locator('.ak-tracks')).toHaveCSS('height','170px');
  await page.locator('.ak-scroll').click({position:{x:246,y:18}});
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().selection.start)).toBe(2);
});

test('individual hidden controls and inspector tabs stay hidden after rerenders',async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer;v.setOptions({visibility:{positionTab:false,featureType:false,featurePagination:false,rowSelection:false,rowPinning:false,alphabet:false,export:false}});v.setFilter('Q');v.setSelection({start:1,end:1});});
  await expect(page.locator('[data-tab=annotations]')).toHaveAttribute('aria-pressed','true');
  for(const selector of ['.ak-feature-pagination','[data-select-row]','[data-pin]','[role=combobox][aria-label="Sequence alphabet"]','[role=combobox][aria-label="Export alignment"]','[role=combobox][aria-label="Feature type"]'])await expect(page.locator(selector).first()).toBeHidden();
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({visibility:{positionTab:false,featuresTab:false,compareTab:false,colorsTab:false,hitsTab:false,summaryTab:false}}));
  await expect(page.locator('.ak-inspector')).toBeHidden();
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({visibility:{colorsTab:true}}));
  await expect(page.locator('.ak-inspector')).toBeVisible();await expect(page.locator('[data-tab=legend]')).toHaveAttribute('aria-pressed','true');
});
