import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Capture the actual browser-rendered viewer with bundled, provenance-tracked datasets. */
export async function captureDocumentation(page,baseURL='http://127.0.0.1:4173') {
  const directory=fileURLToPath(new URL('../docs/screenshots/',import.meta.url));
  await mkdir(directory,{recursive:true});
  await page.setViewportSize({width:1540,height:1100});
  await page.goto(baseURL);
  await page.waitForFunction(()=>window.alignmentDemo?.viewer.getStatistics()?.total===838);
  await page.evaluate(async()=>{await document.fonts.ready;const v=window.alignmentDemo.viewer;v.setOptions({height:700});v.setSelection({start:118,end:118,rowId:v.getAlignment().rows[1].id});});
  const capture=async name=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.locator('.ak-viewer').screenshot({path:resolve(directory,name),animations:'disabled',scale:'css'});
  };
  await capture('protein-explorer.png');
  await page.getByRole('button',{name:'Transfer RNA',exact:true}).click();
  await page.waitForFunction(()=>window.alignmentDemo.viewer.getAlignment()?.alphabet==='rna'&&window.alignmentDemo.viewer.getStatistics()?.total===954);
  await page.evaluate(()=>{const v=window.alignmentDemo.viewer;v.setOptions({colorScheme:'nucleotide-blue-orange',showLogo:true,cellWidth:18});v.setSelection({start:1,end:1});v.setSelection(null);});
  await page.locator('[data-tab=legend]').click();
  await capture('rna-colors.png');
  await page.evaluate(()=>window.alignmentDemo.viewer.setOptions({height:470,colorScheme:'soft-nucleotide',visibility:{toolbar:false,tools:false,overview:false,inspector:false,status:false,modalFrequency:false,gapFraction:false,logo:false,rowSelection:false,rowPinning:false}}));
  await capture('minimal-embed.png');
  await writeFile(resolve(directory,'README.md'),`# Documentation screenshots\n\nActual Chromium captures of Alignment Kit. Reproduce with \`npm run dev\`, then \`npm run screenshots\` in another terminal.\n\n- \`protein-explorer.png\`: Pfam PF00571.34 CBS seed, 838 sequences, 160 columns; selected alignment column 118.\n- \`rna-colors.png\`: Rfam RF00005 tRNA seed, 954 sequences, 118 columns; blue/orange nucleotide palette and frequency logo. This is RNA, not DNA; the same palette supports DNA with T replacing U.\n- \`minimal-embed.png\`: the same tRNA dataset with controls, overview, inspector, status, selected tracks and row actions hidden through the public visibility API.\n\nDataset snapshots and hashes: \`demo/public/alignments.json\`. Images show the actual UI; no mockups or compositing.\n`);
  return directory;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch();
  try{console.log(await captureDocumentation(await browser.newPage()));}finally{await browser.close();}
}
