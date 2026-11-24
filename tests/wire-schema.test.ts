// @vitest-environment jsdom
import {it,expect,beforeAll,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import {toJson,parseAlignment,createAlignment,parseViewerConfig,createViewer} from '../src/index';
const read=(name:string)=>JSON.parse(readFileSync(`config/${name}`,'utf8')),names=['viewer-config.schema.json','view-state.schema.json','wire.schema.json'],schemas=names.map(read);
const ajv=new Ajv2020({allErrors:true,strict:false});for(const schema of schemas)ajv.addSchema(schema);
const check=(name:string,value:unknown)=>{const validate=ajv.getSchema(`https://bioinformat.org/msa-canvas/schema/${name}`)!,ok=validate(value);return ok?[]:validate.errors!.map(e=>`${e.instancePath} ${e.message}`);};
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
const pkg=read('../package.json');
it('gives each schema an $id that ends in its file name, a version and a package export',()=>{
  schemas.forEach((schema,i)=>{expect(schema.$id).toBe(`https://bioinformat.org/msa-canvas/schema/${names[i]}`);expect(schema['x-version']).toBe(1);expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');});
  expect(pkg.exports['./wire.schema.json']).toBe('./config/wire.schema.json');expect(pkg.exports['./view-state.schema.json']).toBe('./config/view-state.schema.json');expect(pkg.exports['./config.schema.json']).toBe('./config/viewer-config.schema.json');
  expect(pkg.files).toContain('config');
});
it('accepts the state of a live viewer and the toJson output that carries it',async()=>{
  const el=document.createElement('div');document.body.append(el);
  const viewer=createViewer(el,{worker:false}),a=createAlignment([{id:'r1',name:'one',sequence:'A-CG',species:'Homo sapiens',metadata:{start:5}},{id:'r2',name:'two',sequence:'ATCG'}],{annotations:[{id:'v',rowId:'r2',label:'x',start:2,end:3,kind:'variant',consequence:['missense_variant'],disease:true,phenotype:false,color:'#c00',mapping:'mapped',metadata:{a:1}},{id:'u',label:'y',mapping:'unmapped'}]});
  await viewer.setAlignment(a);viewer.setSelection({start:2,end:3,rowId:'r1'});viewer.hideColumns(4,4);viewer.markColumns([[1,2]],'#ffcc00');await viewer.search('AT');
  const state=viewer.getState();expect(check('view-state.schema.json',JSON.parse(JSON.stringify(state)))).toEqual([]);expect(state.hiddenColumns).toEqual([[4,4]]);expect(state.find).toBe('AT');
  const doc=JSON.parse(JSON.stringify(toJson(a,{state,tree:'(one,two);',config:read('viewer-config.example.json')})));viewer.destroy();
  expect(check('wire.schema.json',doc)).toEqual([]);expect(doc.state.alignmentId).toBe(a.id);
});
it('accepts toJson output for a Stockholm snapshot and a minimal document',()=>{
  expect(check('wire.schema.json',JSON.parse(JSON.stringify(toJson(parseAlignment(readFileSync('demo/public/cbs-seed.sto','utf8'))))))).toEqual([]);
  expect(check('wire.schema.json',{format:'msa-canvas',version:1,alignment:{rows:[{name:'a',sequence:'AC'}]}})).toEqual([]);
});
it('rejects what fromJson rejects',()=>{
  const row={name:'a',sequence:'ACGT'},base={format:'msa-canvas',version:1,alignment:{rows:[row]}};
  for(const doc of [{...base,version:2},{...base,format:'msa'},{...base,extra:1},{...base,alignment:{rows:[]}},{...base,alignment:{rows:[{name:'a',sequence:'AC1'}]}},{...base,alignment:{rows:[{...row,seq:'x'}]}},{...base,annotations:[{id:'x',label:'x'}]},{...base,annotations:[{id:'x',label:'x',mapping:'mapped'}]},{...base,config:{height:10}},{...base,state:{version:2}},{...base,tree:5}])expect(check('wire.schema.json',doc),JSON.stringify(doc)).not.toEqual([]);
});
it('lists no configuration key that parseViewerConfig does not know',()=>{
  const config=schemas[0];
  for(const key of Object.keys(config.properties)){let message='';try{parseViewerConfig({[key]:Symbol('bad')});}catch(error){message=(error as Error).message;}expect(message,key).not.toContain('Unknown viewer configuration option');}
  expect(check('viewer-config.schema.json',read('viewer-config.example.json'))).toEqual([]);expect(parseViewerConfig(read('viewer-config.example.json'))).toBeTruthy();
});
