import { test, expect } from '@playwright/test';

const ready=async(page:import('@playwright/test').Page)=>{
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).alignmentDemo?.viewer.getStatistics()?.total===838);
};

test('Alt-click marks a column with an outline box that follows scrolling and masking',async({page})=>{
  await ready(page);
  const scroll=page.locator('.ak-scroll');
  await scroll.click({position:{x:246,y:60},modifiers:['Alt']});
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getColumnMarks())).toEqual([{start:2,end:2,color:'#7b2cbf'}]);
  const purple=()=>page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const c=document.querySelector<HTMLCanvasElement>('.ak-body-canvas')!,t=document.querySelector<HTMLCanvasElement>('.ak-tracks canvas')!;
    const count=(canvas:HTMLCanvasElement)=>{const d=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-123)<6&&Math.abs(d[i+1]-44)<6&&Math.abs(d[i+2]-191)<6)n++;return n;};
    return {body:count(c),ruler:count(t)};
  });
  const marked=await purple();
  expect(marked.body).toBeGreaterThan(200);expect(marked.ruler).toBeGreaterThan(40);
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.hideColumns(5,8));
  expect((await purple()).body).toBeGreaterThan(200);
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.hideColumns(1,3));
  expect(await purple()).toEqual({body:0,ruler:0});
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getColumnMarks().length)).toBe(1);
  await page.evaluate(()=>{(window as any).alignmentDemo.viewer.showColumns();document.querySelector(".ak-scroll")!.scrollLeft=0;});
  expect((await purple()).body).toBeGreaterThan(200);
  await scroll.click({position:{x:246,y:60},modifiers:['Alt']});
  expect(await purple()).toEqual({body:0,ruler:0});
});

test('the Mark column button in the Position tab toggles the selected column',async({page})=>{
  await ready(page);
  await page.locator('.ak-scroll').click({position:{x:262,y:60}});
  const button=page.getByRole('button',{name:'Mark column',exact:true});
  await button.click();
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getViewLink())).toContain('marks=3');
  await expect(page.getByRole('button',{name:'Unmark column',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Unmark column',exact:true}).click();
  await expect(button).toBeVisible();
  expect(await page.evaluate(()=>(window as any).alignmentDemo.viewer.getColumnMarks())).toEqual([]);
});

test('colorblind-safe and high-contrast schemes show a legend in the Colors tab',async({page})=>{
  await ready(page);
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({colorScheme:'cvd-protein'}));
  await page.locator('[data-tab=legend]').click();
  await expect(page.locator('.ak-class-legend li')).toHaveCount(7);
  await expect(page.locator('.ak-inspector')).toContainText('Colorblind-safe');
  await page.evaluate(()=>(window as any).alignmentDemo.viewer.setOptions({colorScheme:'hc-protein'}));
  await expect(page.locator('.ak-inspector')).toContainText('High contrast');
  await page.getByRole('combobox',{name:'Color scheme',exact:true}).click();
  await expect(page.getByRole('option',{name:'Residue classes · colorblind-safe'})).toBeVisible();
  await expect(page.getByRole('option',{name:'Nucleotide · Okabe-Ito'})).toHaveCount(0);
});
