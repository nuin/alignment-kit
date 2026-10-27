import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

test('real protein and RNA alignments retain their dimensions and sources',async({page})=>{
  await page.goto(process.env.AK_STATIC_PREVIEW?'file://'+resolve('.preview/index.html'):'/');
  for(const [label,rows,width,alphabet] of [['Protein kinase',37,419,'protein'],['Globin · 20,705',20705,672,'protein'],['Transfer RNA',954,118,'rna']] as const){
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.locator('.ak-status')).toContainText(`${rows.toLocaleString()} sequences`,{timeout:30000});
    await expect(page.locator('.dataset-description')).toContainText(`${width} columns`);
    await expect(page.getByLabel('Sequence alphabet')).toHaveValue(alphabet);
    await expect(page.getByRole('link',{name:'View source'})).toBeVisible();
    expect(await page.locator('.ak-row-label').count()).toBeLessThan(60);
  }
});

test('real CBS alignment: navigation, statistics and bounded labels',async({page})=>{
  await page.goto(process.env.AK_STATIC_PREVIEW?'file://'+resolve('.preview/index.html'):'/');
  await expect(page.getByText('838 sequences', {exact:false}).first()).toBeVisible();
  await expect(page.locator('.ak-row-label').first()).toBeVisible();
  expect(await page.locator('.ak-row-label').count()).toBeLessThan(60);
  await page.getByLabel('Go to alignment column').fill('50');
  await page.getByLabel('Go to alignment column').press('Enter');
  await expect(page.locator('.ak-inspector')).toContainText('Column 50');
  await page.locator('.ak-scroll').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ak-inspector')).toContainText('Column 51');
  await page.screenshot({path:'test-results/viewer-desktop.png',fullPage:true});
});
test('large synthetic alignment keeps DOM bounded and reference pinned',async({page})=>{
  await page.goto(process.env.AK_STATIC_PREVIEW?'file://'+resolve('.preview/index.html'):'/');
  await page.getByRole('button',{name:'10,000 sequences',exact:true}).click();
  await expect(page.locator('.ak-status')).toContainText('10,000 sequences',{timeout:20000});
  const label=await page.locator('.ak-reference-label').innerText();
  await page.locator('.ak-scroll').evaluate(el=>{el.scrollTop=100000;el.dispatchEvent(new Event('scroll'));});
  await expect(page.locator('.ak-reference-label')).toHaveText(label);
  expect(await page.locator('.ak-row-label').count()).toBeLessThan(60);
  expect(await page.locator('.ak-viewer *').count()).toBeLessThan(450);
});
test('filter and theme are usable at narrow widths',async({page})=>{
  await page.setViewportSize({width:700,height:900});
  await page.goto(process.env.AK_STATIC_PREVIEW?'file://'+resolve('.preview/index.html'):'/');
  await expect(page.locator('.ak-status')).toContainText('838 sequences');
  await page.getByLabel('Filter sequences').fill('no-such-sequence');
  await expect(page.locator('.ak-status')).toContainText('0 filtered');
  await page.getByLabel('Filter sequences').fill('');
  await page.getByRole('button',{name:'Toggle theme'}).click();
  await expect(page.locator('.ak-viewer')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:'test-results/viewer-narrow.png',fullPage:true});
});
