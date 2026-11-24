import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8')),buildScript=readFileSync('scripts/build.mjs','utf8'),knip=JSON.parse(readFileSync('knip.json','utf8')),deno=JSON.parse(readFileSync('deno.json','utf8')),budget=JSON.parse(readFileSync('scripts/size-budget.json','utf8'));
const entries=Object.entries(pkg.exports as Record<string,any>).filter(([,target])=>typeof target==='object'&&/\.js$/.test(target.default));
const built=buildScript.match(/entryPoints:\[([^\]]+)\]/)![1].split(',').map(s=>s.replace(/['\s]/g,''));
it('gives every JavaScript entry a types condition first and a default condition, with no import-only entry',()=>{
  expect(entries.map(([name])=>name)).toEqual(['.','./react','./svelte','./vue','./element','./pavi']);
  for(const [name,target] of entries){expect(Object.keys(target),name).toEqual(['types','default']);expect(target.types).toBe(target.default.replace(/\.js$/,'.d.ts'));}
  expect(JSON.stringify(pkg.exports)).not.toContain('"import"');
});
it('declares main, types and the CDN fields',()=>{
  expect(pkg.main).toBe('./dist/index.js');expect(pkg.types).toBe('./dist/index.d.ts');
  expect(pkg.unpkg).toBe('./dist/msa-canvas.global.js');expect(pkg.jsdelivr).toBe(pkg.unpkg);expect(pkg.exports['./msa-canvas.global.js']).toBe(pkg.unpkg);
  expect(pkg.exports['./style.inline.css']).toBe('./dist/style.inline.css');expect(pkg.exports['./worker.js']).toBe('./dist/worker.js');
});
it('builds, lints and budgets every exported entry',()=>{
  for(const [,target] of entries){
    const name=target.default.slice('./dist/'.length,-3),source=built.find(file=>file.replace(/\.tsx?$/,'')===`src/${name}`);
    expect(source,`${name} missing from esbuild entryPoints`).toBeDefined();expect(knip.entry).toContain(source);expect(budget[`${name}.js`]).toBeGreaterThan(0);
  }
  expect(buildScript).toContain("entryPoints:['src/global.ts'],outfile:'dist/msa-canvas.global.js'");expect(knip.entry).toContain('src/global.ts');
  expect(Object.keys(budget)).toEqual(expect.arrayContaining(['worker.js','msa-canvas.global.js','msa-canvas.worker.js','style.css','style.inline.css']));
});
it('keeps the element registration and the global bundle out of tree shaking',()=>{
  expect(pkg.sideEffects).toEqual(expect.arrayContaining(['**/*.css','./dist/element.js','./dist/msa-canvas.global.js']));
});
it('marks every framework peer optional and keeps framework entries out of the JSR build',()=>{
  expect(Object.keys(pkg.peerDependencies).sort()).toEqual(['react','svelte','vue']);
  for(const peer of Object.keys(pkg.peerDependencies))expect(pkg.peerDependenciesMeta[peer]).toEqual({optional:true});
  expect(deno.publish.exclude).toEqual(expect.arrayContaining(['src/element.ts','src/vue.ts','src/global.ts','src/integration.ts']));
});
