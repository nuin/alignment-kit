// Copies the built bundle, CSS and template into the Python and R packages. Run after `npm run build`.
// Usage: node scripts/sync-bindings.mjs [destination root, default "."]. The copies are git-ignored build outputs.
import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const root=process.argv[2]??'.',read=path=>readFile(path,'utf8');
const targets={
  'python/msa_canvas/static':['msa-canvas.global.js','style.inline.css','template.html'],
  'r/msacanvas/inst/htmlwidgets/lib/msa-canvas':['msa-canvas.global.js','style.inline.css'],
  'r/msacanvas/inst/template':['template.html'],
};
// The three packages are released together, so their versions must agree with package.json.
const version=JSON.parse(await read('package.json')).version;
const stated={
  'python/pyproject.toml':(await read('python/pyproject.toml')).match(/^version = "([^"]+)"/m)?.[1],
  'python/msa_canvas/__init__.py':(await read('python/msa_canvas/__init__.py')).match(/^__version__ = "([^"]+)"/m)?.[1],
  'r/msacanvas/DESCRIPTION':(await read('r/msacanvas/DESCRIPTION')).match(/^Version: (\S+)/m)?.[1],
  'r/msacanvas/inst/htmlwidgets/msacanvas.yaml':(await read('r/msacanvas/inst/htmlwidgets/msacanvas.yaml')).match(/^\s+version: (\S+)/m)?.[1],
};
const stale=Object.entries(stated).filter(([,found])=>found!==version);
if(stale.length){console.error(`Version ${version} of package.json differs in: ${stale.map(([file,found])=>`${file} (${found??'none'})`).join(', ')}. Set all four to ${version} (docs/RELEASE.md).`);process.exit(1);}
let count=0;
for(const [dir,files] of Object.entries(targets)){
  await mkdir(join(root,dir),{recursive:true});
  for(const file of files){
    await cp(`dist/${file}`,join(root,dir,file)).catch(()=>{console.error(`dist/${file} is missing. Run "npm run build" first.`);process.exit(1);});
    count++;
  }
}
console.log(`Copied ${count} files of version ${version} into ${Object.keys(targets).map(dir=>join(root,dir)).join(', ')}.`);
