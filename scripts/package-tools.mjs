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
/** The marker a language binding replaces with its JSON payload; src/wire.ts holds the same text as WIRE_PLACEHOLDER. */
export const PAYLOAD_PLACEHOLDER='{{MSA_PAYLOAD_JSON}}';
// Runs after the bundle in the page. Posts selection, state, ready and error to an embedding frame and accepts state and selection from it.
const boot=`(function(){
var post=function(type,value){if(window.parent!==window)window.parent.postMessage({source:'msa-canvas',type:type,value:value},'*');};
var show=function(error){var text=String(error&&error.message||error),box=document.createElement('pre');box.id='msa-error';box.setAttribute('role','alert');box.textContent=text;document.body.appendChild(box);post('error',text);};
try{
var view=MsaCanvas.mountWire(document.getElementById('msa'),document.getElementById('msa-payload').textContent,{
onSelection:function(value){post('selection',value);},onState:function(value){post('state',value);},
onReady:function(a){document.title=a.name;post('ready',{id:a.id,name:a.name,rows:a.rows.length,width:a.width});},
onError:function(error){post('error',String(error&&error.message||error));}
},{height:Math.max(360,Math.min(2000,window.innerHeight||650))});
window.msaCanvasView=view;
window.addEventListener('message',function(event){
var data=event.data;if(event.source!==window.parent||!data||data.target!=='msa-canvas')return;
try{if(data.type==='state')view.setState(data.value).catch(show);else if(data.type==='selection')view.viewer.setSelection(data.value);}catch(error){show(error);}
});
}catch(error){show(error);}
})();`;
/** dist/template.html: one page with the global bundle and the inline-font CSS in it, and one placeholder inside the payload script element. Throws when the inlined text could end its element early or repeat the placeholder. */
export function buildTemplate(js,css,version) {
  const script=js.replace(/<\/script/gi,'<\\/script');
  if(/<!--/.test(script))throw new Error('The bundle contains "<!--", which is unsafe inside a script element.');
  if(/<\/style/i.test(css))throw new Error('The CSS contains "</style".');
  const html=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="msa-canvas ${version}, wire format 1">
<title>Alignment</title>
<style>${css}</style>
<style>html,body{margin:0}#msa-error{margin:16px;padding:12px;border:1px solid #b42318;color:#b42318;font:13px/1.4 ui-monospace,monospace;white-space:pre-wrap}</style>
</head>
<body>
<div id="msa"></div>
<script type="application/json" id="msa-payload">${PAYLOAD_PLACEHOLDER}</script>
<script>${script}</script>
<script>${boot}</script>
</body>
</html>
`;
  if(html.split(PAYLOAD_PLACEHOLDER).length!==2)throw new Error(`The template must contain ${PAYLOAD_PLACEHOLDER} exactly once.`);
  return html;
}
