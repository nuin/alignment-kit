import {test,expect} from '@playwright/test';
import type {AlignmentViewer} from '../src/viewer';
type W={alignmentDemo:{viewer:AlignmentViewer}};
// NJ roots this tree at a three-way node (h1+h2 clade, m1, m2), so the only two-leaf clade is h1+h2.
// h1 is the pinned reference and a clade click skips it, so the selection is h2 alone.
test('the tree view selects a clade by branch click and closes on Escape',async({page})=>{
  await page.goto('/');await expect(page.locator('.ak-row-label').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {viewer}=(window as unknown as W).alignmentDemo;
    await viewer.load('>h1\nAAAAAAAAAA\n>m1\nGGGGGAAAAA\n>h2\nAAAAAAAAAC\n>m2\nGGGGGAAAAT\n',{alphabet:'dna'});
  });
  await page.locator('[data-action="tree"]').click();
  await expect(page.locator('.ak-tree-canvas')).toBeVisible();
  const open=page.locator('[data-action="tree-view"]');
  await open.click();
  const overlay=page.locator('.ak-tree-view');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('aria-label','Tree view');
  const pos=await page.evaluate(()=>{
    const v=(window as unknown as W).alignmentDemo.viewer as any,{layout,leafRow}=v.tree,{geometry}=v.treeView,rows=v.a.rows as {name:string}[];
    const leaves=(n:number):string[]=>layout.kids[n].length?layout.kids[n].flatMap(leaves):[rows[leafRow[n]].name];
    const node=layout.nodes.findIndex((_:unknown,k:number)=>{const l=leaves(k).sort();return layout.kids[k].length&&l.length===2&&l[0]==='h1'&&l[1]==='h2';});
    const s=document.querySelector('.ak-tree-view-scroll') as HTMLElement,r=document.querySelector('.ak-tree-view canvas')!.getBoundingClientRect();
    return {node,x:r.left+8+layout.x[node]*Math.max(1,s.clientWidth-260-16),y:r.top+geometry.y[node]-s.scrollTop};
  });
  expect(pos.node).toBeGreaterThanOrEqual(0);
  await page.mouse.click(pos.x,pos.y);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as W).alignmentDemo.viewer.getSelectedRowIds().length)).toBe(1);
  const ids=await page.evaluate(()=>{const v=(window as unknown as W).alignmentDemo.viewer;const sel=new Set(v.getSelectedRowIds());return v.getAlignment()!.rows.filter(r=>sel.has(r.id)).map(r=>r.name).sort();});
  expect(ids).toEqual(['h2']);
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await expect(open).toBeFocused();
});
