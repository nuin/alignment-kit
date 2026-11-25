import {test,expect} from '@playwright/test';
import type {AlignmentViewer} from '../src/viewer';

test('inspector shows variant context, protein descriptions and live column rows',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.ak-row-label').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {viewer}=(window as unknown as {alignmentDemo:{viewer:AlignmentViewer}}).alignmentDemo;
    await viewer.load('>Alpha\nAR-K\n>Beta\nAKDQ\n>Gamma\nAQ-R\n',{alphabet:'protein'});
    const a=viewer.getAlignment()!;
    viewer.addVariants([{rowId:a.rows[0].id,position:2,hgvs:'p.Arg2Trp',metadata:{details:[{label:'Impact',value:'MODERATE'},{label:'Genomic location',value:'chr2:101'},{label:'Genomic change',value:'C → T'}]}}]);
    viewer.addAnnotations([{id:'noncoding',label:'Intron variant',mapping:'unmapped',metadata:{details:[{label:'Region',value:'Non-coding'}]}}]);
    viewer.setSelection({rowId:a.rows[0].id,start:2,end:2});
  });
  await expect(page.locator('.ak-residue-description')).toHaveText('Arginine · Basic');
  await expect(page.locator('.ak-annotation-details')).toContainText('MODERATE');
  await expect(page.locator('.ak-annotation-details')).toContainText('chr2:101');
  const rows=page.locator('.ak-column-residues tbody tr');await expect(rows).toHaveCount(3);
  await page.getByRole('searchbox',{name:'Filter sequences',exact:true}).fill('Beta');
  await expect(rows).toHaveCount(2);await expect(rows.nth(1)).toContainText('Beta');
  await page.getByRole('tab',{name:'Features',exact:true}).click();
  await expect(page.locator('.ak-annotation-details').last()).toContainText('Non-coding');
  await page.getByRole('button',{name:'Intron variant',exact:false}).click();
  await expect(page.locator('.ak-annotation-details').last()).toContainText('Non-coding');
  await page.getByRole('tab',{name:'Position',exact:true}).click();
  await expect(page.locator('.ak-residue-description')).toHaveText('Arginine · Basic');
});

test('column sequence pages stay usable in desktop and narrow inspectors',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.ak-row-label').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {viewer}=(window as unknown as {alignmentDemo:{viewer:AlignmentViewer}}).alignmentDemo;
    await viewer.load(Array.from({length:61},(_,i)=>`>Sequence ${i+1}\nAR-K`).join('\n'),{alphabet:'protein'});
    viewer.setSelection({rowId:viewer.getAlignment()!.rows[0].id,start:2,end:2});
  });
  for(const width of [1440,820]){
    await page.setViewportSize({width,height:1000});
    const table=page.locator('.ak-column-residues');
    await expect(table.locator('tbody tr')).toHaveCount(25);
    await page.getByRole('button',{name:'Next column sequences',exact:true}).click();
    await expect(table).toContainText('26–50 of 61');
    await page.getByRole('button',{name:'Next column sequences',exact:true}).click();
    await expect(table.locator('tbody tr')).toHaveCount(11);
    await expect(table.locator('tbody tr').last()).toContainText('Sequence 61');
    await expect(page.getByRole('button',{name:'Next column sequences',exact:true})).toBeDisabled();
    const fits=await table.evaluate(el=>el.scrollWidth<=el.clientWidth+1);
    expect(fits).toBe(true);
    await page.getByRole('button',{name:'Previous column sequences',exact:true}).click();
    await page.getByRole('button',{name:'Previous column sequences',exact:true}).click();
  }
});
