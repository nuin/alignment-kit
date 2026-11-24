import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import type { AlignmentViewer } from '../src/viewer';
declare global {interface Window {alignmentDemo:{viewer:AlignmentViewer}}}

async function audit(page:Page) {
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
}

for(const theme of ['light','dark'])test(`accessible controls, contrast and open menus in ${theme} theme`,async({page})=>{
  await page.goto('/');
  await expect(page.locator('.ak-status')).toContainText('838 sequences');
  if(theme==='dark')await page.getByRole('button',{name:'Dark theme'}).click();
  await audit(page);
  const menu=page.getByRole('combobox',{name:'Color scheme',exact:true});
  await menu.focus();await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded','true');
  await audit(page);
  await page.keyboard.press('Escape');await expect(menu).toBeFocused();
  await page.getByRole('tab',{name:'Colors',exact:true}).click();await audit(page);
  await page.getByRole('button',{name:'Text',exact:true}).click();
  await expect(page.getByLabel('Alignment as text',{exact:true})).toBeVisible();
  await audit(page);
});

test('keyboard selection exposes the current residue and text alternative',async({page})=>{
  await page.goto('/');await expect(page.locator('.ak-status')).toContainText('838 sequences');
  await page.evaluate(async()=>{
    await window.alignmentDemo.viewer.load('>reference\nAC-G\n>sample\nATGG',{alphabet:'dna'});
  });
  const grid=page.getByRole('grid');
  await grid.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');
  await expect(page.locator('.ak-live')).toContainText('Column 2');
  await expect(grid.getByRole('gridcell')).toHaveCount(1);
  await expect(grid.getByRole('gridcell')).toHaveAttribute('aria-colindex','2');
  const cellId=await grid.getByRole('gridcell').getAttribute('id');
  expect(cellId).toBeTruthy();await expect(grid).toHaveAttribute('aria-activedescendant',cellId!);
  await expect(grid.getByRole('gridcell')).toHaveAccessibleName(/Column 2.*residue/i);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.ak-live')).toContainText('Column 2 through 3');
  await page.getByRole('button',{name:'Text',exact:true}).focus();await page.keyboard.press('Enter');
  const text=page.getByLabel('Alignment as text',{exact:true});
  await expect(text).toBeVisible();
  await expect(grid).toBeHidden();
  await text.focus();await expect(text).toBeFocused();
  expect(await text.ariaSnapshot()).toContain('Alignment as text');
});

test('all inspector tabs fit inside the pane at desktop and narrow widths',async({page})=>{
  await page.goto('/');await expect(page.locator('.ak-status')).toContainText('838 sequences');
  for(const width of [1440,700]) {
    await page.setViewportSize({width,height:1000});
    const pane=await page.locator('.ak-inspector').boundingBox();expect(pane).toBeTruthy();
    for(const tab of await page.locator('.ak-tabs button').all()) {
      const box=await tab.boundingBox();expect(box).toBeTruthy();
      expect(box!.x+box!.width).toBeLessThanOrEqual(pane!.x+pane!.width);
      await tab.focus();await page.keyboard.press('Enter');await expect(tab).toHaveAttribute('aria-selected','true');
    }
  }
});
