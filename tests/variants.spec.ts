import { test, expect, type Page } from '@playwright/test';

const frame=(page:Page)=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const ready=async(page:Page)=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
  await page.evaluate(async()=>{
    const v=(window as any).alignmentDemo.viewer;
    await v.load('>alpha\nMKLAVRSTQW\n>beta\nMKLAVKSTQW\n>gamma\nMRL-VRSTQW\n',{name:'Variant test',alphabet:'protein'});
  });
  await page.waitForFunction(()=>(window as any).alignmentDemo.viewer.getStatistics()?.total===3);
};
/** Pixels of the variant track whose color is within 8 of the given RGB. */
const count=(page:Page,rgb:[number,number,number])=>page.evaluate(([r,g,b])=>{
  const c=document.querySelector<HTMLCanvasElement>('.ak-tracks canvas')!,d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let n=0;
  for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-r)<8&&Math.abs(d[i+1]-g)<8&&Math.abs(d[i+2]-b)<8)n++;return n;
},rgb);

test('draws variant markers in consequence colors and steps through them',async({page})=>{
  await ready(page);
  const result=await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer,ids=v.getAlignment().rows.map((r:any)=>r.id);
    return v.addVariants([{rowId:ids[0],hgvs:'p.Val5Gly'},{rowId:ids[2],hgvs:'p.Arg2Ter'},{rowId:ids[1],hgvs:'p.Lys6Glu'}]);});
  expect(result.warnings).toEqual([]);expect(result.annotations).toHaveLength(3);
  await frame(page);
  await expect(page.locator('.ak-variant-label')).toBeVisible();
  await expect(page.locator('.ak-variant-nav output')).toHaveText('– / 3');
  // Missense blue #0072B2 and nonsense vermillion #D55E00 in the track canvas.
  expect(await count(page,[0,114,178])).toBeGreaterThan(20);
  expect(await count(page,[213,94,0])).toBeGreaterThan(20);
  await page.getByRole('button',{name:'Next variant'}).click();
  const sel=await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer;return {s:v.getState().selection,name:v.getAlignment().rows.find((r:any)=>r.id===v.getState().selection.rowId).name};});
  expect(sel.s).toMatchObject({start:2,end:2});expect(sel.name).toBe('gamma');
  await expect(page.locator('.ak-variant-nav output')).toHaveText('1 / 3');
  await page.locator('.ak-scroll').focus();await page.keyboard.press(']');
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().selection)).toMatchObject({start:5,end:5});
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({visibility:{variantTrack:false}}));await frame(page);
  expect(await count(page,[213,94,0])).toBe(0);
  await expect(page.locator('.ak-variant-label')).toBeHidden();
});

test('clicking a variant marker selects it and pins its card',async({page})=>{
  await ready(page);
  await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer,ids=v.getAlignment().rows.map((r:any)=>r.id);v.addVariants([{rowId:ids[1],hgvs:'p.Leu3Pro'}]);});
  await frame(page);
  const box=await page.evaluate(()=>{const v=(window as any).alignmentDemo.viewer,label=document.querySelector<HTMLElement>('.ak-variant-label')!,tracks=document.querySelector('.ak-tracks')!.getBoundingClientRect(),gutter=parseFloat(getComputedStyle(document.querySelector('.ak-viewer')!).getPropertyValue('--ak-gutter'));
    return {x:tracks.left+gutter+2*16+8-document.querySelector('.ak-scroll')!.scrollLeft,y:tracks.top+label.offsetTop-3+9,cw:v.getState().cellWidth};});
  expect(box.cw).toBe(16);
  await page.mouse.click(box.x,box.y);
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getState().selection)).toMatchObject({start:3,end:3});
  const card=page.locator('.ak-tooltip[data-pinned="true"]');await expect(card).toBeVisible();await expect(card).toContainText('p.Leu3Pro');await expect(card).toContainText('Missense');
});
