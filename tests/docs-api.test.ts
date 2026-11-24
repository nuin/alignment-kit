import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import * as api from '../src/index';
import { defaultVisibility } from '../src/visibility';

const read=(file:string)=>readFileSync(file,'utf8');
const pages=readdirSync('docs/reference').filter(f=>f.endsWith('.md')).sort();
const reference=pages.map(f=>read(`docs/reference/${f}`)).join('\n');
const page=(name:string)=>read(`docs/reference/${name}.md`);
const source=(file:string)=>ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true);
const exported=(node:ts.Node)=>ts.canHaveModifiers(node)&&!!ts.getModifiers(node)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
/** Names a module exports: its own declarations plus every `export { a, b } from` list. */
function exportNames(file:string):{values:string[];types:string[];stars:string[]} {
  const values:string[]=[],types:string[]=[],stars:string[]=[];
  for(const s of source(file).statements){
    if(ts.isExportDeclaration(s)){
      const from=(s.moduleSpecifier as ts.StringLiteral|undefined)?.text;
      if(!s.exportClause&&from)stars.push(from);
      else if(s.exportClause&&ts.isNamedExports(s.exportClause))for(const e of s.exportClause.elements)(s.isTypeOnly||e.isTypeOnly?types:values).push(e.name.text);
    }else if(exported(s)){
      if(ts.isInterfaceDeclaration(s)||ts.isTypeAliasDeclaration(s))types.push(s.name.text);
      else if(ts.isFunctionDeclaration(s)||ts.isClassDeclaration(s))values.push(s.name!.text);
      else if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations)values.push((d.name as ts.Identifier).text);
    }
  }
  return {values,types,stars};
}
function members(file:string,name:string):string[] {
  const node=source(file).statements.find(s=>ts.isInterfaceDeclaration(s)&&s.name.text===name) as ts.InterfaceDeclaration|undefined;
  if(!node)throw new Error(`${name} not found in ${file}`);
  return node.members.map(m=>(m.name as ts.Identifier).text);
}
const isPrivate=(m:ts.ClassElement)=>ts.canHaveModifiers(m)&&!!ts.getModifiers(m)?.some(x=>x.kind===ts.SyntaxKind.PrivateKeyword);
function publicMethods(file:string,name:string):string[] {
  const node=source(file).statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text===name) as ts.ClassDeclaration;
  return node.members.filter(m=>ts.isMethodDeclaration(m)&&!isPrivate(m)).map(m=>(m.name as ts.Identifier).text);
}
/** A name counts as documented when it appears at the start of a code span, as in `name`, `name(args)` or `name.field`. */
const mentions=(text:string,name:string)=>new RegExp('`'+name.replace(/[$]/g,'\\$&')+'(?![A-Za-z0-9_$])').test(text);
/** Names in the first cell of every row of the table that follows a `## heading`. */
function tableKeys(text:string,heading:string):string[] {
  const at=text.indexOf(`## ${heading}\n`);if(at<0)throw new Error(`No "${heading}" section.`);
  const next=text.indexOf('\n## ',at+1),body=text.slice(at,next<0?undefined:next);
  return [...body.matchAll(/^\| `([A-Za-z$]+)[^`]*` \|/gm)].map(m=>m[1]);
}
const missing=(names:string[],text:string)=>names.filter(n=>!mentions(text,n));

describe('reference pages cover the public API',()=>{
  const index=exportNames('src/index.ts');
  it('reads the same value exports the module has at run time',()=>{
    expect([...index.values].sort()).toEqual(Object.keys(api).sort());
    expect(index.stars).toEqual(['./types']);
  });
  it('documents every value export of src/index.ts in functions.md or api.md',()=>{
    expect(missing(index.values,page('functions')+page('api'))).toEqual([]);
  });
  it('documents every type export of src/index.ts and src/types.ts',()=>{
    expect(missing([...index.types,...exportNames('src/types.ts').types],reference)).toEqual([]);
  });
  it('documents the ./pavi, ./react and ./svelte entry exports',()=>{
    const names=['src/pavi.ts','src/react.tsx','src/svelte.ts'].flatMap(f=>{const e=exportNames(f);return [...e.values,...e.types];});
    expect(names).toContain('fromPavi');
    expect(missing(names,reference)).toEqual([]);
    expect(page('functions')).toContain("from '@nuin/msa-canvas/pavi'");
  });
  it('has one options table row per ViewerOptions key, and no row for a key that does not exist',()=>{
    expect(tableKeys(page('api'),'Options').sort()).toEqual(members('src/types.ts','ViewerOptions').sort());
  });
  it('has one defaults table row per ViewerOptions key that JSON configuration accepts',()=>{
    const json=members('src/types.ts','ViewerOptions').filter(k=>k!=='alignment');
    expect(tableKeys(page('configuration'),'Option defaults').sort()).toEqual(json.sort());
  });
  it('lists every public AlignmentViewer method in the api.md method table',()=>{
    const methods=publicMethods('src/viewer.ts','AlignmentViewer'),table=page('api').split('## Standalone exports')[0];
    expect(methods).toContain('getVisibility');
    expect(methods.filter(m=>!new RegExp('`'+m+'\\(').test(table))).toEqual([]);
  });
  it('keeps standalone functions out of the method table',()=>{
    const methods=new Set(publicMethods('src/viewer.ts','AlignmentViewer')),table=page('api').split('## Standalone exports')[0].split('## Events')[0];
    const rows=[...table.matchAll(/^\| (.+?) \|/gm)].flatMap(m=>[...m[1].matchAll(/`([A-Za-z]+)\(/g)].map(x=>x[1]));
    expect(rows.length).toBeGreaterThan(60);
    expect(rows.filter(n=>!methods.has(n))).toEqual([]);
  });
  it('names every viewer event, visibility key and integration prop',()=>{
    expect(missing(members('src/types.ts','ViewerEvents'),page('api'))).toEqual([]);
    expect(missing(Object.keys(defaultVisibility),page('configuration'))).toEqual([]);
    expect(missing(members('src/integration.ts','IntegrationProps'),reference)).toEqual([]);
  });
});

describe('documented defaults match the code',()=>{
  const schema=JSON.parse(read('config/viewer-config.schema.json')).properties as Record<string,{default?:unknown;description?:string;properties?:Record<string,{default?:unknown;description?:string}>}>;
  // The constructor literal in src/viewer.ts is the source of the defaults.
  const literal=read('src/viewer.ts').match(/this\.options=\{(.*?),\.\.\.options,/)![1];
  const code=Object.fromEntries(literal.split(',').map(p=>{const [k,v]=p.split(':');return [k,JSON.parse(v.replace(/'/g,'"'))];})) as Record<string,unknown>;
  it('gives every schema property a description and a default equal to the constructor default',()=>{
    expect(Object.keys(code).length).toBeGreaterThan(20);
    for(const [key,prop] of Object.entries(schema)){
      expect(prop.description,key).toBeTruthy();
      if(key in code)expect(prop.default,key).toEqual(code[key]);
    }
    for(const key of Object.keys(code))expect(schema[key],key).toBeDefined();
  });
  it('gives every schema visibility flag a description and the default from defaultVisibility',()=>{
    for(const [key,value] of Object.entries(defaultVisibility)){
      const prop=schema.visibility.properties![key];
      expect(prop.default,key).toBe(value);expect(prop.description,key).toBeTruthy();
    }
  });
  it.each([['configuration','Option defaults'],['api','Options']])('states the constructor default in the %s.md "%s" table',(name,heading)=>{
    const text=page(name),at=text.indexOf(`## ${heading}\n`),next=text.indexOf('\n## ',at+1),body=text.slice(at,next<0?undefined:next);
    for(const [key,value] of Object.entries(code)){
      const row=body.match(new RegExp('^\\| `'+key+'` \\|.*$','m'))?.[0];
      expect(row,key).toBeDefined();
      expect(row!.split('|')[4].trim(),key).toBe('`'+(typeof value==='string'?`'${value}'`:String(value))+'`');
    }
  });
  it('pins no package version other than the current one',()=>{
    const version=JSON.parse(read('package.json')).version as string;
    expect(read('README.md')).not.toMatch(/nuin-msa-canvas-\d/);
    const pins=['README.md','docs/USER_GUIDE.md',...pages.map(f=>`docs/reference/${f}`)].flatMap(f=>[...read(f).matchAll(/@nuin\/msa-canvas@(\d+\.\d+\.\d+)/g)].map(m=>`${f}: ${m[1]}`));
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.filter(pin=>!pin.endsWith(`: ${version}`)),'update the pinned CDN version in the docs').toEqual([]);
    expect(read('CHANGELOG.md')).toContain(`## ${version} (`);
  });
});

describe('documentation links',()=>{
  const files=['README.md','CONTRIBUTING.md','CHANGELOG.md','docs/USER_GUIDE.md',...pages.map(f=>`docs/reference/${f}`)];
  it('point at files that exist',()=>{
    const broken:string[]=[];
    for(const file of files)for(const [,href] of read(file).matchAll(/\]\(([^)\s]+)\)/g)){
      if(/^(https?:|#|mailto:)/.test(href))continue;
      if(!existsSync(resolve(dirname(file),href.split('#')[0])))broken.push(`${file}: ${href}`);
    }
    expect(broken).toEqual([]);
  });
  it('lists every reference page in the README table',()=>{
    const readme=read('README.md');
    expect(pages.filter(f=>!readme.includes(`(docs/reference/${f})`))).toEqual([]);
  });
  it('render into a guide with no dead local link',()=>{
    const out=mkdtempSync(join(tmpdir(),'ak-guide-'));
    try{
      execFileSync(process.execPath,['scripts/build-guide.mjs'],{env:{...process.env,AK_GUIDE_OUT:out},stdio:'pipe'});
      const html=readdirSync(out).filter(f=>f.endsWith('.html'));
      for(const f of pages)expect(html,f).toContain(f.replace(/\.md$/,'.html'));
      for(const name of ['index','developer','contributing','changelog','release','performance','notices'])expect(html).toContain(`${name}.html`);
      const dead:string[]=[];
      for(const f of html)for(const [,href] of readFileSync(join(out,f),'utf8').matchAll(/href="([^"]+)"/g)){
        if(/^(https?:|mailto:)/.test(href))continue;
        // Root-absolute links are routes of the demo server that hosts the guide.
        if(href.startsWith('/')){if(!/^\/($|guide\/[a-z-]+\.html$)/.test(href))dead.push(`${f}: ${href}`);continue;}
        const [path,hash]=href.split('#'),target=path?join(out,path):join(out,f);
        if(!existsSync(target))dead.push(`${f}: ${href}`);
        else if(hash&&target.endsWith('.html')&&!readFileSync(target,'utf8').includes(`id="${hash}"`))dead.push(`${f}: ${href} (no such heading)`);
      }
      expect(dead).toEqual([]);
      expect(readFileSync(join(out,'developer.html'),'utf8')).not.toContain('Alignment Kit');
    }finally{rmSync(out,{recursive:true,force:true});}
  },60_000);
});
