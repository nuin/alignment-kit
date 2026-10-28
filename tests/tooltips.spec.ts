import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

test('hover card, pinned annotation card and no card while panning',async({page})=>{
  await page.goto(process.env.AK_STATIC_PREVIEW?'file://'+resolve('.preview/index.html'):'/');
  await expect(page.locator('.ak-row-label').first()).toBeVisible();
  await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer;v.addAnnotations([{id:'t1',label:'Spec note',kind:'variant',disease:true,start:1,end:v.getAlignment().width,mapping:'mapped',metadata:{pubmed:'12345',source:'Spec'}}]);});
  const box=(await page.locator('.ak-scroll').boundingBox())!,gutter=await page.evaluate(()=>(window as any).alignmentDemo.viewer.gutter as number);
  const x=box.x+gutter+60,y=box.y+18;
  await page.mouse.move(x,y);await page.mouse.move(x+1,y+1);
  const tip=page.locator('.ak-tooltip');
  await expect(tip).toBeVisible();await expect(tip).toContainText('Column');await expect(tip).toContainText('Spec note');await expect(tip).toHaveAttribute('data-pinned','false');
  await page.mouse.move(box.x+5,box.y-30);await expect(tip).toHaveCount(0);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-40,y-10,{steps:4});await page.waitForTimeout(450);await expect(tip).toHaveCount(0);await page.mouse.up();
  await page.mouse.move(x+30,y+1);await page.mouse.click(x+30,y+1);await expect(tip).toHaveAttribute('data-pinned','true');
  await page.mouse.move(box.x+5,box.y-30);await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');await expect(tip).toHaveCount(0);
});
