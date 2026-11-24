#!/usr/bin/env node
// msa-canvas <file> -o view.html: parses an alignment with the package parsers and writes one self-contained HTML page, or the wire JSON with --json.
import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const usage=`Usage: msa-canvas <file> [-o view.html] [options]

Reads aligned FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF or PIR (gzip accepted)
and writes a self-contained HTML viewer. Without -o the result goes to standard output.

  -o, --output <path>  output file
      --config <path>  viewer configuration JSON (config/viewer-config.schema.json)
      --state <path>   view state JSON saved from the viewer (config/view-state.schema.json)
      --theme <name>   light or dark; overrides the configuration file
      --height <px>    viewer height, 360 to 2000; overrides the configuration file
      --name <text>    alignment name; default is the file name
      --json           write the wire format 1 JSON document in place of HTML
  -h, --help           show this text
  -v, --version        show the package version
`;
const options={output:{type:'string',short:'o'},config:{type:'string'},state:{type:'string'},theme:{type:'string'},height:{type:'string'},name:{type:'string'},json:{type:'boolean'},help:{type:'boolean',short:'h'},version:{type:'boolean',short:'v'}};
const json=async(path,what)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){throw new Error(`Cannot read ${what} ${path}: ${error.message}`);}};

/** Runs the command and returns what it would print; `argv` excludes node and the script path. */
export async function run(argv) {
  const {values,positionals}=parseArgs({args:argv,options,allowPositionals:true});
  if(values.help)return usage;
  if(values.version)return `${JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version}\n`;
  if(positionals.length!==1)throw new Error(`Expected one alignment file, got ${positionals.length}.\n\n${usage}`);
  const {parseAlignment,parseViewerConfig,toJson,fillTemplate}=await import('../dist/index.js').catch(()=>{throw new Error('dist/index.js is missing. Run "npm run build" first.');});
  const file=positionals[0],bytes=await readFile(file).catch(error=>{throw new Error(`Cannot read ${file}: ${error.message}`);});
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes);
  const alignment=parseAlignment(text,{name:values.name??basename(file).replace(/\.gz$/i,'')});
  const config={...(values.config?await json(values.config,'configuration'):{})};delete config.$schema;
  if(values.theme!==undefined)config.theme=values.theme;
  if(values.height!==undefined)config.height=Number(values.height);
  const doc=toJson(alignment,{...(Object.keys(config).length?{config:parseViewerConfig(config)}:{}),...(values.state?{state:await json(values.state,'view state')}:{})});
  const out=values.json?`${JSON.stringify(doc)}\n`:fillTemplate(await readFile(new URL('../dist/template.html',import.meta.url),'utf8'),doc);
  for(const warning of alignment.metadata.warnings??[])console.error(`warning: ${warning.message}`);
  if(!values.output)return out;
  await writeFile(values.output,out);
  return '';
}
// npm links the command, so compare real paths.
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  process.stdout.on('error',error=>{if(error.code!=='EPIPE')throw error;});
  run(process.argv.slice(2)).then(out=>process.stdout.write(out),error=>{console.error(`msa-canvas: ${error.message}`);process.exitCode=1;});
}
