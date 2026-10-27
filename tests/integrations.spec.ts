import { resolve } from 'node:path';
import {test,expect} from '@playwright/test';
for(const framework of ['react','svelte'])test(`${framework}: reactive data, current callbacks and cleanup`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.AK_STATIC_PREVIEW?'file://'+resolve(`.preview/${framework}.html`):`/examples/${framework}/`);
  await expect(page.locator('.ak-status')).toContainText('4 sequences');
  await page.getByRole('button',{name:'Change dataset'}).click();
  await expect(page.locator('.ak-status')).toContainText('6 sequences');
  await page.getByRole('button',{name:'Change theme'}).click();
  await expect(page.locator('.ak-viewer')).toHaveAttribute('data-theme','dark');
  await page.getByLabel('Go to alignment column').fill('5');await page.getByLabel('Go to alignment column').press('Enter');
  await expect(page.getByTestId('selection')).toContainText('5');
  await page.getByRole('button',{name:'Unmount viewer'}).click();await expect(page.locator('.ak-viewer')).toHaveCount(0);
  await page.getByRole('button',{name:'Mount viewer'}).click();await expect(page.locator('.ak-viewer')).toHaveCount(1);
  await expect(page.locator('.ak-status')).toContainText('6 sequences');
  expect(errors).toEqual([]);
});
