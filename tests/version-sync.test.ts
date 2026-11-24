import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const json=(name:string)=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
it('keeps package.json, package-lock.json and deno.json on one version',()=>{
  const pkg=json('package.json'),lock=json('package-lock.json'),deno=json('deno.json');
  expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  expect({lock:lock.version,lockRoot:lock.packages[''].version,deno:deno.version}).toEqual({lock:pkg.version,lockRoot:pkg.version,deno:pkg.version});
  expect([lock.name,deno.name]).toEqual([pkg.name,pkg.name]);
});
