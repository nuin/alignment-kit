import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { compile } from 'svelte/compiler';
import { resolve } from 'node:path';
const out=resolve('.preview');await mkdir(out,{recursive:true});
await import('./build-guide.mjs');
await cp('demo/public/guide',`${out}/guide`,{recursive:true});
for(const file of await readdir(`${out}/guide`)){
  if(!file.endsWith('.html'))continue;
  const path=`${out}/guide/${file}`;
  const html=(await readFile(path,'utf8')).replaceAll('href="/"','href="../index.html"').replaceAll('href="/guide/index.html"','href="./index.html"').replaceAll('href="/guide/developer.html"','href="./developer.html"');
  await writeFile(path,html);
}
const worker=await build({entryPoints:['src/worker.js'],bundle:true,format:'iife',write:false});
const workerCode=worker.outputFiles[0].text;
const catalog=JSON.parse(await readFile('demo/public/alignments.json','utf8'));
const datasets=Object.fromEntries(await Promise.all(catalog.map(async d=>[d.id,(await readFile('demo/public/'+d.file)).toString('base64')])));
const sveltePlugin={name:'svelte',setup(builder){builder.onLoad({filter:/\.svelte$/},async({path})=>({contents:compile(await readFile(path,'utf8'),{filename:path,generate:'client'}).js.code,loader:'js',resolveDir:resolve(path,'..')}));}};
for(const [name,entry,root] of [['index','demo/main.ts','app'],['react','examples/react/main.tsx','root'],['svelte','examples/svelte/main.ts','root']]) {
  const result=await build({entryPoints:[entry],bundle:true,format:'iife',outdir:out,write:false,loader:{'.woff2':'dataurl'},plugins:[sveltePlugin],define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  const css=result.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
  let js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
  js=js.replaceAll('/examples/react/',`file://${out}/react.html`).replaceAll('/examples/svelte/',`file://${out}/svelte.html`).replaceAll('href="/guide/index.html"','href="./guide/index.html"');
  const data=JSON.stringify({datasets:name==='index'?datasets:{}}).replaceAll('<','\\u003c');
  const setup=`window.__ALIGNMENT_PREVIEW__=${data};window.__ALIGNMENT_PREVIEW__.workerUrl=URL.createObjectURL(new Blob([${JSON.stringify(workerCode).replaceAll('<','\\u003c')}],{type:'application/javascript'}));`;
  await writeFile(`${out}/${name}.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alignment Kit · ${name}</title><style>${css}</style></head><body><div id="${root}"></div><script>${setup}</script><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`);
}
console.log(`Self-contained previews: ${out}/index.html, react.html, svelte.html`);
