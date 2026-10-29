// Source similarity screening, not a proof of originality or a license audit.
// Usage: node scripts/similarity-audit.mjs corpus.json output.json [exact-min=20] [normalized-min=40]
// corpus.json: [{name, root, sourceDirs: ['src'], url}]
import ts from 'typescript';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const sha=text=>createHash('sha256').update(text).digest('hex');
const dictionary=new Map();
function intern(value){if(!dictionary.has(value))dictionary.set(value,dictionary.size+1);return dictionary.get(value);}
async function files(dir){
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(['node_modules','.git','dist','build','__snapshots__'].includes(entry.name))continue;
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())result.push(...await files(path));
    else if(/\.(?:[cm]?[jt]sx?|svelte|css|scss|sass)$/.test(path))result.push(path);
  }
  return result.sort();
}
function tokenize(text,path){
  const tokens=[];
  const push=(value,normalized,start,end)=>tokens.push({exact:intern(value),normalized:intern(normalized),start,end});
  if(/\.(?:css|scss|sass)$/.test(path)){
    const re=/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[-\w#.%]+|[^\s]/g;
    for(const m of text.matchAll(re))if(!m[0].startsWith('/*'))push('css:'+m[0],'css:'+m[0],m.index,m.index+m[0].length);
    return {language:'css',tokens};
  }
  let code=text;
  if(extname(path)==='.svelte'){
    const script=/<script\b[^>]*>([\s\S]*?)<\/script>/.exec(text);
    code=script?' '.repeat(script.index+script[0].indexOf('>')+1)+script[1]:'';
  }
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,code);
  for(let kind=scanner.scan();kind!==ts.SyntaxKind.EndOfFileToken;kind=scanner.scan()){
    const value=kind+':'+scanner.getTokenText();
    const normalized=kind===ts.SyntaxKind.Identifier?'ID':kind===ts.SyntaxKind.NumericLiteral?'NUMBER':kind===ts.SyntaxKind.StringLiteral?'STRING':value;
    push(value,normalized,scanner.getTokenPos(),scanner.getTextPos());
  }
  return {language:'js',tokens};
}
function* windows(tokens,mode,k){
  const base=16777619;let power=1,hash=0;
  for(let n=1;n<k;n++)power=Math.imul(power,base);
  for(let i=0;i<tokens.length;i++){
    if(i>=k)hash=(hash-Math.imul(tokens[i-k][mode],power))|0;
    hash=(Math.imul(hash,base)+tokens[i][mode])|0;
    if(i>=k-1)yield [hash,i-k+1];
  }
}
function matches(local,upstream,mode,k){
  const index=new Map(),result=[];
  for(let file=0;file<upstream.length;file++)for(const [hash,start] of windows(upstream[file].tokens,mode,k)){
    const key=upstream[file].language+':'+hash;if(!index.has(key))index.set(key,[]);index.get(key).push([file,start]);
  }
  for(let file=0;file<local.length;file++){
    const a=local[file];
    for(const [hash,start] of windows(a.tokens,mode,k))for(const [other,at] of index.get(a.language+':'+hash)??[]){
      const b=upstream[other];
      if(start>0&&at>0&&a.tokens[start-1][mode]===b.tokens[at-1][mode])continue;
      let count=0;while(start+count<a.tokens.length&&at+count<b.tokens.length&&a.tokens[start+count][mode]===b.tokens[at+count][mode])count++;
      // Rolling hashes are only candidate selectors: every token is compared.
      if(count>=k)result.push({file,other,start,at,count});
    }
  }
  return result.sort((a,b)=>b.count-a.count);
}
function span(file,start,count){
  const offset=file.tokens[start].start,end=file.tokens[start+count-1].end;
  return {path:file.path,startLine:file.text.slice(0,offset).split('\n').length,endLine:file.text.slice(0,end).split('\n').length,startOffset:offset,endOffset:end};
}
async function load(root,dirs){
  const paths=[...new Set((await Promise.all(dirs.map(dir=>files(resolve(root,dir))))).flat())];
  return Promise.all(paths.map(async path=>{const text=await readFile(path,'utf8');return {path:relative(root,path),text,sha256:sha(text),...tokenize(text,path)};}));
}

// Known positive controls ensure copied and consistently renamed snippets are detected.
const sample='function calculate(values) { let total = 0; for (const value of values) { total += value; } return total / values.length; }';
const control=s=>({language:'js',tokens:tokenize(s,'control.ts').tokens});
assert.equal(matches([control(sample)],[control(sample)],'exact',20).length,1);
assert.ok(matches([control('const a = true; '+sample)],[control('const b = false; const c = null; '+sample.replaceAll(';','; /* spacing */ '))],'exact',20).length>=1);
assert.equal(matches([control(sample)],[control(sample.replaceAll('calculate','mean').replaceAll('total','sum').replaceAll('values','items').replaceAll('value','item'))],'normalized',20).length,1);
assert.equal(matches([control('x + y')],[control('x - y')],'exact',3).length,0);

const [configPath,outputPath]=process.argv.slice(2);
if(!configPath||!outputPath)throw Error('Usage: node scripts/similarity-audit.mjs corpus.json output.json');
const exactMinimumTokens=Number(process.argv[4]??20),normalizedMinimumTokens=Number(process.argv[5]??40);
for(const threshold of [exactMinimumTokens,normalizedMinimumTokens])assert.ok(Number.isInteger(threshold)&&threshold>=3);
const config=JSON.parse(await readFile(configPath,'utf8'));
const local=await load(process.cwd(),['src']);
const report={date:new Date().toISOString(),method:{exactMinimumTokens,normalizedMinimumTokens,normalization:'Remove whitespace/comments; replace identifiers and string/number literals for normalized JS comparison. Preserve operators and keyword/token kinds. CSS comparison is literal-token only. Svelte script only; markup excluded. JSON palettes assessed separately.',positiveControls:'Exact copy and renamed identifiers detected; negative control rejected.',limitations:'Contiguous lexical matches only, not AST/semantic similarity. No template-string interpolation parsing. No claim of global originality or legal clearance.'},local:{files:local.length,tokens:local.reduce((n,f)=>n+f.tokens.length,0),inventory:local.map(({path,sha256,tokens})=>({path,sha256,tokens:tokens.length}))},corpora:[]};
for(const corpus of config){
  const upstream=await load(corpus.root,corpus.sourceDirs);
  const revision=execFileSync('git',['-C',corpus.root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const output={name:corpus.name,url:corpus.url,revision,sourceDirs:corpus.sourceDirs,files:upstream.length,tokens:upstream.reduce((n,f)=>n+f.tokens.length,0),inventory:upstream.map(({path,sha256,tokens})=>({path,sha256,tokens:tokens.length})),byteIdenticalFiles:[],exact:[],normalized:[]};
  for(const a of local)for(const b of upstream)if(a.sha256===b.sha256)output.byteIdenticalFiles.push({local:a.path,upstream:b.path});
  for(const [mode,k] of [['exact',exactMinimumTokens],['normalized',normalizedMinimumTokens]]){
    output[mode]=matches(local,upstream,mode,k).map(m=>({tokens:m.count,local:span(local[m.file],m.start,m.count),upstream:span(upstream[m.other],m.at,m.count)}));
    console.log(corpus.name,mode,output[mode].length,'matches; longest',output[mode][0]?.tokens??0);
  }
  report.corpora.push(output);
}
const nightingale=config.find(c=>c.url==='https://github.com/ebi-webcomponents/nightingale');
if(nightingale){
  const localPalettes=JSON.parse(await readFile('src/palettes.json','utf8')),notices=await readFile('THIRD_PARTY_NOTICES.md','utf8');
  const named={grey:'#808080',gray:'#808080',yellow:'#ffff00',red:'#ff0000',magenta:'#ff00ff',brown:'#a52a2a',blue:'#0000ff',green:'#008000',orange:'#ffa500',cyan:'#00ffff',white:'#ffffff',black:'#000000'};
  const canonical=color=>{let v=color.trim().toLowerCase();v=named[v]??v;if(/^#[0-9a-f]{3}$/.test(v))v='#'+Array.from(v.slice(1),x=>x+x).join('');assert.match(v,/^#[0-9a-f]{6}$/);return v;};
  report.palettes=[];
  for(const [name,colors] of Object.entries(localPalettes)){
    const path=resolve(nightingale.root,'packages/nightingale-msa/src/colorschemes',name+'.ts'),bytes=await readFile(path);
    const parsed=ts.createSourceFile(path,bytes.toString(),ts.ScriptTarget.Latest,true);
    const expression=parsed.statements.find(ts.isExportAssignment)?.expression;assert.ok(expression&&ts.isObjectLiteralExpression(expression));
    const entries=Object.fromEntries(expression.properties.map(p=>{assert.ok(ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer));return [p.name.text==='Gap'?'-':p.name.text,canonical(p.initializer.text)];}));
    const differences=[...new Set([...Object.keys(colors),...Object.keys(entries)])].filter(k=>colors[k]===undefined||entries[k]===undefined||canonical(colors[k])!==entries[k]);
    const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    const recorded=notices.match(new RegExp('- '+name+'\\.ts: ([a-f0-9]{40})'))?.[1];
    report.palettes.push({palette:name,entries:Object.keys(entries).length,differences,currentBlob:blob,recordedBlob:recorded,matchesRecordedBlob:blob===recorded});
  }
  console.log('Palettes:',report.palettes.length,'checked;',report.palettes.filter(p=>p.differences.length||!p.matchesRecordedBlob).length,'differences');
}
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');
console.log('Report:',outputPath);
