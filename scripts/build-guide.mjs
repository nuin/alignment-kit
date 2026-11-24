// Render only our checked-in Markdown, never alignment data or user-authored HTML.
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { marked } from 'marked';
import { build } from 'esbuild';
const bundled=await build({entryPoints:['src/colors.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const {colorSchemes,residueColor,textColor}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const escape=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const rows=colorSchemes('dna').filter(s=>s.id!=='conservation').map(s=>`<tr><th scope="row">${escape(s.label)}<small>${escape(s.id)}</small></th><td><div class="swatches">${[...'ACGTUNRSWY'].map(base=>{const color=residueColor(base,s);return `<span style="background:${color};color:${textColor(color)}">${base}</span>`;}).join('')}</div></td></tr>`).join('');
const palettes=`<div class="table-wrap"><table><caption>Nucleotide palette preview; letters retain their identities</caption><thead><tr><th>Scheme</th><th>Base and ambiguity colors</th></tr></thead><tbody>${rows}</tbody></table></div>`;
// AK_GUIDE_OUT redirects the output, so tests can render into a temporary directory.
const out=process.env.AK_GUIDE_OUT||'demo/public/guide',repo='https://github.com/nuin/alignment-kit/blob/master/';
const reference=(await readdir('docs/reference')).filter(f=>f.endsWith('.md')).sort();
const targets={'README.md':'developer.html','docs/USER_GUIDE.md':'index.html','docs/RELEASE.md':'release.html','docs/performance.md':'performance.html','THIRD_PARTY_NOTICES.md':'notices.html','CONTRIBUTING.md':'contributing.html','CHANGELOG.md':'changelog.html','LICENSE':'LICENSE.txt','CITATION.cff':'CITATION.cff','docs/benchmark-results.json':'benchmark-results.json','docs/browser-benchmark-results.json':'browser-benchmark-results.json',...Object.fromEntries(reference.map(f=>[`docs/reference/${f}`,f.replace(/\.md$/,'.html')]))};
// A relative link is resolved to its repository path, then to the page or file the guide holds for it. Anything the guide does not hold links to the repository.
const local=(file,url)=>{
  if(/^([a-z]+:|#|\/)/i.test(url))return url;
  const [path,hash='']=url.split(/(?=#)/),target=posix.normalize(posix.join(posix.dirname(file),path));
  if(targets[target])return `./${targets[target]}${hash}`;
  for(const [dir,to] of [['config/','config/'],['docs/screenshots/','screenshots/']])if(target.startsWith(dir))return `./${to}${target.slice(dir.length)}`;
  return repo+target+hash;
};
const slug=title=>title.replace(/<[^>]*>/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const render=async(file,text)=>(await marked.parse(text)).replace(/<h([23])>(.*?)<\/h\1>/g,(_,level,title)=>`<h${level} id="${slug(title)}">${title}</h${level}>`).replace(/(href|src)="([^"]+)"/g,(_,attr,url)=>`${attr}="${escape(local(file,url.replaceAll('&amp;','&')))}"`);
let body=await render('docs/USER_GUIDE.md',(await readFile('docs/USER_GUIDE.md','utf8')).replace('<!-- nucleotide-palette-preview -->',palettes));
const toc=[...body.matchAll(/<h2 id="([^"]*)">(.*?)<\/h2>/g)].map(([,id,title])=>`<li><a href="#${id}">${title}</a></li>`);
body=body.replace(/<table>/g,'<div class="table-scroll"><table>').replace(/<\/table>/g,'</table></div>');
const css=`:root{color-scheme:light;--bg:#fff;--ink:#243447;--muted:#596f85;--line:#d7e0e7;--panel:#f6f8fb;--accent:#2463a6}*{box-sizing:border-box}html{scroll-padding-top:24px}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 system-ui,sans-serif}a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}a:focus-visible{outline:2px solid var(--accent);outline-offset:4px}header{padding:18px 32px;border-bottom:1px solid var(--line);display:flex;gap:24px;align-items:center}header strong{margin-right:auto;font-size:18px}.layout{display:grid;grid-template-columns:240px minmax(0,900px);gap:48px;max-width:1280px;margin:0 auto;padding:32px}nav{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow:auto;font-size:12px}nav ul{padding-left:0;list-style:none}nav li{margin:0 0 8px}nav a{text-decoration:none;color:var(--muted)}h1{font-size:34px;line-height:1.2;letter-spacing:-.8px;margin-top:0}h2{font-size:23px;line-height:1.3;margin-top:44px;padding-top:18px;border-top:1px solid var(--line)}h3{font-size:18px;margin-top:28px}p{margin:14px 0}li{margin:7px 0}img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:7px;margin:22px 0}pre{background:var(--panel);padding:18px;border-radius:6px;overflow:auto;border:1px solid var(--line)}code{font-size:12px;font-family:ui-monospace,monospace;overflow-wrap:anywhere}.table-scroll{overflow:auto;margin:20px 0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid var(--line)}thead{background:var(--panel)}caption{text-align:left;font-weight:600;margin-bottom:8px}.swatches{display:flex;gap:3px;min-width:270px}.swatches span{display:grid;place-items:center;width:24px;height:30px;font:600 13px ui-monospace,monospace;border-radius:3px}small{display:block;font:11px ui-monospace,monospace;color:var(--muted);margin-top:5px}footer{border-top:1px solid var(--line);padding:24px 32px;color:var(--muted);font-size:12px}@media(max-width:850px){.layout{display:block;padding:22px}nav{position:static;max-height:none;border-bottom:1px solid var(--line);margin-bottom:28px}nav ul{columns:2}header{padding:16px 22px}h1{font-size:28px}}@media(max-width:480px){nav ul{columns:1}header{gap:12px;font-size:12px}th,td{padding:8px}}@media print{header,nav,footer{display:none}.layout{display:block;padding:0;font-size:11pt}h2{break-after:avoid}pre,table{break-inside:avoid}a{color:inherit}}`;
const shell=(title,content,navigation='')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · MSA Canvas</title><style>${css}</style></head><body><header><strong>MSA Canvas</strong><a href="/">Explorer</a><a href="/guide/index.html">User guide</a><a href="/guide/developer.html">Developer API</a></header><div class="layout"><nav aria-label="Guide sections">${navigation}</nav><main>${content}</main></div><footer>MSA Canvas · Documentation for the local development version · Use your browser's Print command to save a PDF.</footer></body></html>`;
await mkdir(out,{recursive:true});
await writeFile(`${out}/index.html`,shell('User guide',body,`<strong>In this guide</strong><ul>${toc.join('')}</ul>`));
const referencePages=await Promise.all(reference.map(async f=>[`docs/reference/${f}`,f.slice(0,-3),(await readFile(`docs/reference/${f}`,'utf8')).match(/^# (.+)$/m)[1]]));
// `npm run docs:api` writes the TypeDoc pages into api/; the side navigation links to them once they exist.
const typedoc=existsSync(`${out}/api/index.html`)?'<li><a href="./api/index.html">Generated API (TypeDoc)</a></li>':'';
const side=`<a href="/guide/index.html">User guide</a><ul><li><a href="./developer.html">Developer README</a></li>${referencePages.map(([,name,title])=>`<li><a href="./${name}.html">${escape(title)}</a></li>`).join('')}${typedoc}<li><a href="./contributing.html">Contributing</a></li><li><a href="./changelog.html">Changelog</a></li></ul>`;
for(const [file,name,title]of [['README.md','developer','Developer API'],...referencePages,['CONTRIBUTING.md','contributing','Contributing'],['CHANGELOG.md','changelog','Changelog'],['docs/RELEASE.md','release','Release preparation'],['docs/performance.md','performance','Validation and performance'],['THIRD_PARTY_NOTICES.md','notices','Third-party notices']]){
  const html=(await render(file,await readFile(file,'utf8'))).replace(/<table>/g,'<div class="table-scroll"><table>').replace(/<\/table>/g,'</table></div>');
  await writeFile(`${out}/${name}.html`,shell(title,html,side));
}
await cp('docs/screenshots',`${out}/screenshots`,{recursive:true});
await cp('config',`${out}/config`,{recursive:true});
await cp('LICENSE',`${out}/LICENSE.txt`);await cp('CITATION.cff',`${out}/CITATION.cff`);
for(const file of ['benchmark-results.json','browser-benchmark-results.json'])await writeFile(`${out}/${file}`,await readFile(`docs/${file}`));
console.log(`Built user guide (${toc.length} topics), palette previews, developer API (${reference.length} reference pages) and release pages in ${out}.`);
