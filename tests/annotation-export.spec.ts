import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('Export menu downloads visible annotations as GFF3, TSV and JSON',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Annotated example',exact:true}).click();
  await expect(page.locator('.dataset-description')).toContainText('features',{timeout:30000});
  for(const [label,check] of [['Annotations · GFF3',(t:string)=>expect(t.startsWith('##gff-version 3')).toBe(true)],['Annotations · TSV',(t:string)=>expect(t.split('\n')[0]).toContain('seq_start')],['Annotations · JSON',(t:string)=>expect(JSON.parse(t).annotations.length).toBeGreaterThan(0)]] as const){
    await page.getByRole('combobox',{name:'Export alignment'}).click();
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('option',{name:label}).click()]);
    check(await readFile((await download.path())!,'utf8'));
  }
  await expect(page.locator('.ak-message')).toContainText('visible annotations');
});
