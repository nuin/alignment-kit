import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type {AlignmentViewer} from '../src/viewer';

async function ready(page:Page){
  await page.goto('/');await expect(page.locator('.ak-row-label').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {viewer}=(window as unknown as {alignmentDemo:{viewer:AlignmentViewer}}).alignmentDemo;
    await viewer.load('>Alpha\nMKLAVRSTQW\n>Beta\nMKLAVKSTQW\n',{alphabet:'protein'});
    const rowId=viewer.getAlignment()!.rows[1].id;
    viewer.addVariants([{id:'first',rowId,hgvs:'p.Leu3Pro'},{id:'second',rowId,hgvs:'p.Lys6Glu'}]);
    viewer.addAnnotations([{id:'utr',rowId,label:'chr11:50 A>C',kind:'variant',mapping:'unmapped',consequence:['3_prime_UTR_variant'],metadata:{variant:{type:'other',consequenceClass:'other'},details:[{label:'Region',value:'Non-coding'},{label:'Impact',value:'MODIFIER'}]}}]);
  });
  await expect(page.locator('[data-variant-card]')).toHaveCount(3);
}
test('cards select variants, follow track and keyboard navigation, and retain unmapped context',async({page})=>{
  await ready(page);
  const first=page.locator('[data-variant-card="first"]'),second=page.locator('[data-variant-card="second"]'),utr=page.locator('[data-variant-card="utr"]');
  await first.focus();await page.keyboard.press('Enter');await expect(first).toHaveAttribute('aria-pressed','true');await expect(first).toBeFocused();
  await expect(page.locator('.ak-inspector')).toBeVisible();await expect(page.locator('.ak-variant-nav output')).toHaveText('1 / 2');
  await page.getByRole('button',{name:'Next variant',exact:true}).click();await expect(second).toHaveAttribute('aria-pressed','true');
  await page.locator('.ak-scroll').focus();await page.keyboard.press('[');await expect(first).toHaveAttribute('aria-pressed','true');
  await utr.click();await expect(page.locator('.ak-variant-details')).toContainText('Non-coding');
  const selection=await page.evaluate(()=>(window as unknown as {alignmentDemo:{viewer:AlignmentViewer}}).alignmentDemo.viewer.getState().selection);
  expect(selection).toMatchObject({start:3,end:3});
  await page.getByRole('button',{name:'Close details',exact:true}).click();await expect(utr).toBeFocused();await expect(page.locator('.ak-variant-details')).toBeHidden();
  await page.getByRole('button',{name:'Variants',exact:true}).click();await expect(page.locator('.ak-variant-cards-content')).toBeHidden();
});
test('card strip stays usable on narrow screens and has no accessibility violations in either theme',async({page})=>{
  await ready(page);await page.setViewportSize({width:580,height:1100});
  for(const theme of ['light','dark'] as const){
    await page.evaluate(theme=>(window as unknown as {alignmentDemo:{viewer:AlignmentViewer}}).alignmentDemo.viewer.setOptions({theme}),theme);
    const list=page.locator('.ak-variant-card-list');
    expect(await list.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
    const card=page.locator('[data-variant-card="utr"]');await card.focus();await page.keyboard.press('Space');await expect(card).toHaveAttribute('aria-pressed','true');
    expect((await new AxeBuilder({page}).include('.ak-variant-cards').analyze()).violations).toEqual([]);
    await page.getByRole('button',{name:'Close details',exact:true}).click();
  }
});

test('expanding cards reveals a variant selected while collapsed',async({page})=>{
  await ready(page);await page.setViewportSize({width:580,height:1100});
  await page.evaluate(()=>{
    const v=window.alignmentDemo.viewer,rowId=v.getAlignment()!.rows[1].id;
    v.addVariants(Array.from({length:10},(_,i)=>({id:`extra${i}`,rowId,position:8})));v.nextVariant();
  });
  const toggle=page.getByRole('button',{name:'Variants',exact:true});await toggle.click();
  await page.evaluate(()=>{for(let i=0;i<10;i++)window.alignmentDemo.viewer.nextVariant();});
  await toggle.click();
  const visible=await page.locator('[data-variant-card][aria-pressed="true"]').evaluate(el=>{
    const card=el.getBoundingClientRect(),list=el.parentElement!.getBoundingClientRect();return card.left>=list.left&&card.right<=list.right;
  });
  expect(visible).toBe(true);
});

for(const width of [1440,580])test(`expanded variant details keep the alignment scrollable at ${width}px`,async({page})=>{
  await ready(page);await page.setViewportSize({width,height:1000});
  await page.evaluate(async()=>{
    const v=window.alignmentDemo.viewer;
    await v.load(Array.from({length:20},(_,i)=>`>Sequence ${i+1}\n${'MKLAVRSTQW'.repeat(40)}`).join('\n'),{alphabet:'protein'});
    v.setOptions({height:560,showInspector:window.innerWidth>800,showLogo:true,visibility:{entropy:true,quality:true}});
    const rowId=v.getAlignment()!.rows[1].id;
    v.addVariants([{id:'mapped',rowId,position:3}]);
    v.setSelection({rowId,start:3,end:3});
    v.addAnnotations([{id:'utr',rowId,label:'Noncoding variant',mapping:'unmapped',metadata:{variant:{type:'other',consequenceClass:'other'},details:[{label:'Region',value:'Non-coding'}]}}]);
  });
  await page.locator('[data-variant-card="utr"]').click();
  const root=page.locator('.ak-viewer'),grid=page.locator('.ak-scroll');
  const geometry=await grid.evaluate(el=>({height:el.clientHeight,rows:el.scrollHeight,viewerOverflow:getComputedStyle(el.closest('.ak-viewer')!).overflowY}));
  expect(geometry.height,JSON.stringify(geometry)).toBeGreaterThanOrEqual(108);
  await page.locator('.ak-variant-cards-header').hover();await page.mouse.wheel(0,10000);
  await expect.poll(()=>root.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(()=>root.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)).toBeLessThanOrEqual(1);
  const bottom=await root.evaluate(el=>({viewer:el.getBoundingClientRect().bottom,status:el.querySelector('.ak-status')!.getBoundingClientRect().bottom}));
  expect(bottom.status).toBeLessThanOrEqual(bottom.viewer);
  const bounds=await root.evaluate(el=>{const box=el.getBoundingClientRect(),grid=el.querySelector('.ak-grid')!.getBoundingClientRect();return {top:box.top,bottom:box.bottom,gridTop:grid.top,gridBottom:grid.bottom};});
  expect(bounds.gridTop>=bounds.top&&bounds.gridBottom<=bounds.bottom,JSON.stringify(bounds)).toBe(true);
  await grid.hover();await page.mouse.wheel(0,10000);
  await expect(page.locator('.ak-row-name').last()).toHaveText('Sequence 20');
  await page.mouse.wheel(10000,0);
  await expect.poll(()=>page.evaluate(()=>window.alignmentDemo.viewer.getVisibleColumns().end)).toBe(400);
  await page.mouse.wheel(0,-10000);
  await expect.poll(()=>grid.evaluate(el=>el.scrollTop)).toBe(0);
  await page.mouse.wheel(0,-10000);
  await expect.poll(()=>root.evaluate(el=>el.scrollTop)).toBe(0);
  await page.evaluate(()=>window.alignmentDemo.viewer.setOptions({height:1500}));
  await expect.poll(()=>root.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
});
