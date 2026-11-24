import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const {version}=JSON.parse(readFileSync('package.json','utf8')) as {version:string};

test('track area has no inner scroll and keeps the reference row last above the body',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await expect(page.locator('.site-header .version')).toHaveText(version);
  const geometry=()=>page.evaluate(()=>{
    const tracks=document.querySelector<HTMLElement>('.ak-tracks')!,ref=document.querySelector<HTMLElement>('.ak-reference-label')!,labels=[...document.querySelectorAll<HTMLElement>('.ak-custom-label')];
    return {overflow:getComputedStyle(tracks).overflowY,scrollTop:tracks.scrollTop,height:parseFloat(tracks.style.height),refTop:parseFloat(ref.style.top),refHeight:ref.offsetHeight,lastLabel:Math.max(-1,...labels.map(l=>parseFloat(l.style.top))),labels:labels.map(l=>l.textContent)};
  });
  let g=await geometry();
  expect(g.overflow).toBe('hidden');expect(g.refTop+g.refHeight).toBe(g.height);expect(g.lastLabel).toBeLessThan(g.refTop);
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({visibility:{entropy:true,quality:true,logo:true}}));
  g=await geometry();
  expect(g.scrollTop).toBe(0);expect(g.refTop+g.refHeight).toBe(g.height);expect(g.lastLabel).toBeLessThan(g.refTop);
  await expect(page.locator('.ak-reference-label')).toBeInViewport();
  for(const label of g.labels)await expect(page.locator('.ak-custom-label',{hasText:label!}).first()).toBeInViewport();
});
