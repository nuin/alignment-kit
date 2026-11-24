import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { addJsExtensions, inlineFontUrls, sizeRows, sizeTable } from './package-tools.mjs';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
await build({entryPoints:['src/index.ts','src/react.tsx','src/svelte.ts','src/pavi.ts','src/element.ts','src/vue.ts','src/worker.js'],outdir:'dist',bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',external:['react','react/jsx-runtime','svelte','svelte/*','vue'],sourcemap:true,logLevel:'info'});
// Single-file hosts: a classic worker with no chunks, and one IIFE that starts that worker from a blob URL when workerUrl is unset.
// The define makes the import.meta.url branch of spawnWorker dead code, so its empty-import-meta warning is silenced.
const worker=await build({entryPoints:['src/worker.js'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false});
await writeFile('dist/msa-canvas.worker.js',worker.outputFiles[0].text);
await build({entryPoints:['src/global.ts'],outfile:'dist/msa-canvas.global.js',bundle:true,format:'iife',globalName:'MsaCanvas',platform:'browser',target:'es2022',minify:true,define:{__MSA_CANVAS_WORKER__:JSON.stringify(worker.outputFiles[0].text)},logOverride:{'empty-import-meta':'silent'},logLevel:'info'});
execFileSync('node',['node_modules/typescript/bin/tsc','--project','tsconfig.build.json'],{stdio:'inherit'});
await cp('src/svelte','dist/svelte',{recursive:true});await cp('src/fonts','dist/fonts',{recursive:true});
// node16 and nodenext resolve declaration imports like ESM: every relative specifier needs its .js extension.
for(const file of await readdir('dist',{recursive:true})){
  if(!file.endsWith('.d.ts'))continue;
  const name=file.replaceAll('\\','/'),text=await readFile(`dist/${name}`,'utf8'),next=addJsExtensions(text,name,path=>existsSync(`dist/${path}`));
  if(next!==text)await writeFile(`dist/${name}`,next);
}
const fonts=await readFile('src/fonts.css','utf8'),style=await readFile('src/style.css','utf8');
await writeFile('dist/style.css',fonts+'\n'+style);
await writeFile('dist/style.inline.css',inlineFontUrls(fonts,path=>readFileSync(`src/${path}`))+'\n'+style);
await cp('THIRD_PARTY_NOTICES.md','dist/THIRD_PARTY_NOTICES.md');
console.log('Built core, worker, React, Svelte action/component, Vue, custom element, global bundle, declarations, styles and fonts.');
console.log(sizeTable(sizeRows(JSON.parse(await readFile('scripts/size-budget.json','utf8')),path=>readFileSync(`dist/${path}`))));
