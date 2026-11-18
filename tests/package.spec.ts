import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { preview } from 'vite';

test('packed React and Svelte consumers load workers and styles',async({browser},testInfo)=>{
  test.setTimeout(60000);
  const reportPath=testInfo.outputPath('package.json');await mkdir(dirname(reportPath),{recursive:true});
  await promisify(execFile)(process.execPath,['scripts/check-package.mjs'],{env:{...process.env,MSA_PACKAGE_REPORT:reportPath}});
  const {directory}=JSON.parse(await readFile(reportPath,'utf8'));
  const server=await preview({configFile:false,root:directory,build:{outDir:'build'},preview:{host:'127.0.0.1',port:0}});
  const address=server.httpServer.address();if(!address||typeof address==='string')throw new Error('Package preview has no TCP address');
  try {
    for(const path of ['index.html','svelte.html']) {
      const page=await browser.newPage(),errors:string[]=[],workers:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker.url()));
      await page.goto(`http://127.0.0.1:${address.port}/${path}`);
      await expect(page.locator('.ak-status')).toContainText('2 sequences');
      await expect(page.locator('.ak-status-detail')).toContainText('all rows');
      expect(workers.length).toBeGreaterThan(0);
      await expect(page.locator('.ak-viewer')).toHaveCSS('display','flex');
      await page.getByLabel('Go to alignment column',{exact:true}).fill('2');
      await page.getByLabel('Go to alignment column',{exact:true}).press('Enter');
      await expect(page.locator('.ak-inspector')).toContainText('Column 2');
      expect(errors).toEqual([]);await page.close();
    }
  } finally {await new Promise<void>((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
});
