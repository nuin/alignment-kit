import {it,expect,beforeAll} from 'vitest';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error jsdom ships no type declarations
import {JSDOM} from 'jsdom';
import {fromJson,parseAlignment,toJson,WIRE_PLACEHOLDER} from '../src/index';
const cli=(...args:string[])=>spawnSync('node',['bin/msa-canvas.mjs',...args],{encoding:'utf8',maxBuffer:64*1024*1024});
const dir=mkdtempSync(join(tmpdir(),'msa-canvas-cli-')),source='demo/public/kinase-seed.sto.gz',expected=parseAlignment(gunzipSync(readFileSync(source)).toString('utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
// release:check runs the tests before the build, so build here when dist is absent.
beforeAll(()=>{if(!existsSync('dist/template.html')||!existsSync('dist/index.js'))execFileSync('node',['scripts/build.mjs'],{stdio:'ignore'});return ()=>rmSync(dir,{recursive:true,force:true});},180_000);
const payload=(html:string)=>new JSDOM(html).window.document.getElementById('msa-payload')!.textContent!;
it('registers the command and ships it with the template',()=>{
  expect(pkg.bin).toEqual({'msa-canvas':'./bin/msa-canvas.mjs'});expect(pkg.files).toEqual(expect.arrayContaining(['bin','dist']));expect(pkg.exports['./template.html']).toBe('./dist/template.html');
  expect(readFileSync('bin/msa-canvas.mjs','utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
  expect(pkg.files.some((entry:string)=>/^(python|r)(\/|$)/.test(entry))).toBe(false);
});
it('writes a self-contained page for a gzipped Stockholm file in demo/public',()=>{
  const out=join(dir,'view.html'),config=join(dir,'config.json');writeFileSync(config,JSON.stringify({$schema:'./viewer-config.schema.json',height:700,cellWidth:12,theme:'light'}));
  const result=cli(source,'-o',out,'--config',config,'--theme','dark','--height','480');expect(result.stderr).toContain('warning: Unknown #=GF tag');expect(result.status).toBe(0);expect(result.stdout).toBe('');
  const html=readFileSync(out,'utf8'),doc=fromJson(payload(html));
  expect(doc.alignment.id).toBe(expected.id);expect(doc.alignment.name).toBe('kinase-seed.sto');expect(doc.alignment.rows.length).toBe(expected.rows.length);expect(Buffer.compare(Buffer.from(doc.alignment.codes),Buffer.from(expected.codes))).toBe(0);
  expect(doc.config).toEqual({height:480,cellWidth:12,theme:'dark'});
  expect(html).not.toContain(WIRE_PLACEHOLDER);expect(html.match(/<script/g)).toHaveLength(3);expect(html.match(/<\/script>/g)).toHaveLength(3);
  expect(html).not.toMatch(/<script[^>]*\ssrc=|<link\b|@import|url\(\s*["']?(?:https?:)?\/\//i);expect(html).toContain('url(data:font/woff2;base64,');
});
it('boots the written page without a network request',async()=>{
  const out=join(dir,'boot.html'),config=join(dir,'worker-off.json'),requests:string[]=[];writeFileSync(config,JSON.stringify({worker:false}));
  expect(cli('demo/public/cbs-seed.sto','-o',out,'--config',config,'--name','CBS <seed>').status).toBe(0);
  const dom=new JSDOM(readFileSync(out,'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window:any){
    Object.assign(window,{ResizeObserver:class{observe(){}disconnect(){}},fetch:(url:string)=>{requests.push(String(url));return Promise.reject(new Error('offline'));}});
    window.XMLHttpRequest.prototype.open=function(_method:string,url:string){requests.push(String(url));throw new Error('offline');};
    window.HTMLCanvasElement.prototype.getContext=(()=>null) as never;
  }});
  const view=(dom.window as any).msaCanvasView;expect(dom.window.document.getElementById('msa-error')).toBeNull();expect(view).toBeDefined();
  await view.ready;expect(view.viewer.getAlignment().rows.length).toBe(838);expect(dom.window.document.title).toBe('CBS <seed>');expect(dom.window.document.querySelector('#msa .ak-viewer, #msa.ak-viewer')).not.toBeNull();
  expect(requests).toEqual([]);view.destroy();dom.window.close();
},60_000);
it('writes wire JSON to standard output with --json and applies a state file',()=>{
  const plain=cli('demo/public/cbs-seed.sto','--json');expect(plain.status).toBe(0);
  const doc=JSON.parse(plain.stdout);expect(doc).toEqual(JSON.parse(JSON.stringify(toJson(parseAlignment(readFileSync('demo/public/cbs-seed.sto','utf8'),{name:'cbs-seed.sto'})))));
  const state=join(dir,'state.json');writeFileSync(state,JSON.stringify({version:1,alignmentId:'other',referenceId:null,query:'',sort:'name',start:10,rowOffset:0,cellWidth:14,selection:null,colorScheme:'soft',colorMode:'all',statisticsScope:'all',annotationFilter:{}}));
  const withState=JSON.parse(cli('demo/public/cbs-seed.sto','--json','--state',state).stdout);expect(withState.state).toMatchObject({sort:'name',start:10,alignmentId:doc.alignment.id});
});
it('exits with 1 and one clear line on bad input',()=>{
  const bad=join(dir,'bad.json');writeFileSync(bad,'{"height":');
  for(const [args,message] of [[['README.md'],'Unrecognized alignment format'],[['missing.sto'],'Cannot read missing.sto'],[[],'Expected one alignment file, got 0'],[[source,'--height','5'],'height must be a number between 360 and 2000'],[[source,'--theme','blue'],'Invalid theme'],[[source,'--config',bad],`Cannot read configuration ${bad}`],[[source,'--state',bad],`Cannot read view state ${bad}`],[[source,'--bogus'],"Unknown option '--bogus'"]] as [string[],string][]){
    const result=cli(...args);expect(result.status,args.join(' ')).toBe(1);expect(result.stderr).toContain(`msa-canvas: ${message}`);expect(result.stdout).toBe('');
  }
  expect(cli('--help').stdout).toContain('Usage: msa-canvas <file>');expect(cli('--version').stdout.trim()).toBe(pkg.version);
});
