// Pure helpers shared by scripts/build.mjs and scripts/check-size.mjs; tests/package-tools.test.ts covers them.
import { gzipSync } from 'node:zlib';
import { posix } from 'node:path';
const specifier=/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]*)\2/g;
/** Give relative specifiers of a declaration file the extension node16 resolution needs. `has(path)` reports whether a POSIX path, relative to the dist root, exists. */
export function addJsExtensions(text,file,has) {
  const dir=posix.dirname(file);
  return text.replace(specifier,(match,lead,quote,spec)=>{
    if(/\.(?:js|mjs|cjs|json|css|svelte)$/.test(spec))return match;
    const target=posix.join(dir,spec);
    const next=has(`${target}.d.ts`)?`${spec}.js`:has(`${target}/index.d.ts`)?`${spec.replace(/\/$/,'')}/index.js`:null;
    if(!next)throw new Error(`${file}: no declaration file for '${spec}'.`);
    return `${lead}${quote}${next}${quote}`;
  });
}
/** Replace each relative woff2 url() with a data URL. `read(path)` returns the font bytes. */
export function inlineFontUrls(css,read) {
  return css.replace(/url\((['"]?)(\.\/[^'")]+\.woff2)\1\)/g,(_,quote,path)=>`url(data:font/woff2;base64,${Buffer.from(read(path)).toString('base64')})`);
}
/** An entry file plus every chunk it imports statically, as esbuild writes them (`from"./chunk.js"`, `import"./chunk.js"`). */
function staticClosure(entry,read) {
  const seen=new Set(),queue=[entry];
  while(queue.length){
    const file=queue.pop();if(seen.has(file))continue;seen.add(file);
    if(!file.endsWith('.js'))continue;
    for(const match of read(file).toString().matchAll(/(?:\bfrom|\bimport)\s*["'](\.\/[^"']+\.js)["']/g))queue.push(posix.join(posix.dirname(file),match[1]));
  }
  return [...seen];
}
/** One row per budget entry: raw and gzip bytes of the entry and its static chunks, and the gzip limit. */
export function sizeRows(budget,read) {
  return Object.entries(budget).map(([entry,limit])=>{
    const files=staticClosure(entry,read),bytes=files.map(file=>read(file));
    return {entry,files:files.length,raw:bytes.reduce((sum,b)=>sum+b.length,0),gzip:bytes.reduce((sum,b)=>sum+gzipSync(b,{level:9}).length,0),limit};
  });
}
export const overBudget=rows=>rows.filter(row=>row.gzip>row.limit);
const kb=n=>(n/1024).toFixed(1).padStart(8)+' kB';
export function sizeTable(rows) {
  const width=Math.max(...rows.map(row=>row.entry.length),5);
  return ['entry'.padEnd(width)+'  files       raw      gzip    budget',...rows.map(row=>`${row.entry.padEnd(width)}  ${String(row.files).padStart(5)} ${kb(row.raw)} ${kb(row.gzip)} ${kb(row.limit)}${row.gzip>row.limit?'  OVER':''}`)].join('\n');
}
