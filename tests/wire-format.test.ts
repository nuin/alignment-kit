import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {toJson,fromJson,fillTemplate,escapeJson,WIRE_PLACEHOLDER,parseAlignment,createAlignment,exportAnnotationsJson,type ViewState,type Annotation} from '../src/index';
const annotations:Annotation[]=[{id:'v1',rowId:'r2',label:'p.Thr2Ala',start:2,end:2,kind:'variant',consequence:['missense_variant'],disease:true,mapping:'mapped',metadata:{source:'test'}},{id:'n1',label:'note',mapping:'unmapped'}];
const sample=()=>createAlignment([{id:'r1',name:'one',sequence:'A-CG',species:'Homo sapiens',metadata:{start:5}},{id:'r2',name:'two',sequence:'ATCG'},{id:'r3',name:'three',sequence:'at.g'}],{name:'Sample',alphabet:'dna',annotations,metadata:{format:'fasta'}});
const state=(alignmentId:string):ViewState=>({version:1,alignmentId,referenceId:'r2',query:'',sort:'input',start:1,rowOffset:0,cellWidth:14,selection:{start:2,end:3,rowId:'r1'},colorScheme:'soft-nucleotide',colorMode:'all',statisticsScope:'all',annotationFilter:{}});
it('writes a version 1 document with one sequence string per row',()=>{
  const a=sample(),doc=toJson(a);
  expect(doc).toMatchObject({format:'msa-canvas',version:1,alignment:{id:a.id,name:'Sample',alphabet:'dna',metadata:{format:'fasta'}}});
  expect(doc.alignment.rows).toEqual([{id:'r1',name:'one',sequence:'A-CG',species:'Homo sapiens',metadata:{start:5}},{id:'r2',name:'two',sequence:'ATCG'},{id:'r3',name:'three',sequence:'AT-G'}]);
  expect(doc.annotations).toEqual(annotations);expect(Object.keys(doc)).toEqual(['format','version','alignment','annotations']);
  expect(Object.keys(toJson(parseAlignment('>a\nAC')))).toEqual(['format','version','alignment']);
});
it('round-trips alignment, annotations, tree, config and state through JSON text',()=>{
  const a=sample(),tree='((one:1,two:1):1,three:2);',config={height:500,theme:'dark' as const,visibility:{overview:false}};
  const back=fromJson(JSON.stringify(toJson(a,{tree,config,state:state(a.id)})));
  expect(back.alignment.id).toBe(a.id);expect(back.alignment.name).toBe(a.name);expect(back.alignment.alphabet).toBe('dna');expect(back.alignment.width).toBe(4);
  expect([...back.alignment.codes]).toEqual([...a.codes]);expect(back.alignment.rows.map(r=>[r.id,r.name,r.species,r.metadata])).toEqual(a.rows.map(r=>[r.id,r.name,r.species,r.metadata]));
  expect(back.alignment.annotations).toEqual(a.annotations);expect(back.alignment.metadata.format).toBe('fasta');
  expect(back.tree).toBe(tree);expect(back.config).toEqual(config);expect(back.state).toEqual(state(a.id));
  expect(toJson(back.alignment,{tree:back.tree,config:back.config,state:back.state})).toEqual(toJson(a,{tree,config,state:state(a.id)}));
  expect(JSON.parse(exportAnnotationsJson(back.alignment))).toEqual(JSON.parse(exportAnnotationsJson(a)));
});
it('round-trips a Pfam Stockholm snapshot with its metadata',()=>{
  const a=parseAlignment(gunzipSync(readFileSync('demo/public/kinase-seed.sto.gz')).toString('utf8')),back=fromJson(JSON.stringify(toJson(a))).alignment;
  expect(back.id).toBe(a.id);expect(back.rows.length).toBe(a.rows.length);expect(Buffer.compare(Buffer.from(back.codes),Buffer.from(a.codes))).toBe(0);
  expect(back.metadata.stockholm?.GF).toEqual(a.metadata.stockholm?.GF);expect(back.rows.map(r=>[r.id,r.name,r.metadata])).toEqual(a.rows.map(r=>[r.id,r.name,r.metadata]));
});
it('reads a minimal document written by another language',()=>{
  const {alignment,state:s}=fromJson({format:'msa-canvas',version:1,alignment:{rows:[{name:'a',sequence:'MKVLE'},{name:'b',sequence:'M-VLE'}]},state:{...state('made-elsewhere'),referenceId:null,selection:null}});
  expect(alignment.rows.map(r=>r.id)).toEqual(['seq-1','seq-2']);expect(alignment.alphabet).toBe('protein');expect(alignment.name).toBe('Untitled alignment');
  expect(s?.alignmentId).toBe(alignment.id);
  expect(fromJson({format:'msa-canvas',version:1,alignment:{id:'mine',rows:[{name:'a',sequence:'AC'}]}}).alignment.id).toBe('mine');
});
it('rejects malformed documents with an error that names the key',()=>{
  const row={name:'a',sequence:'ACGT'},doc=(extra:object={},alignment:object={rows:[row]})=>({format:'msa-canvas',version:1,alignment,...extra});
  const bad=(input:unknown,message:RegExp|string)=>expect(()=>fromJson(input)).toThrow(message);
  bad('{','Invalid msa-canvas document: the text is not JSON.');bad([],'expected a JSON object');bad({version:1,alignment:{rows:[row]}},'format must be "msa-canvas"');
  bad({...doc(),version:2},'version 2 is not supported; this build reads version 1');bad(doc({extra:1}),'unknown key "extra" in the document');
  bad(doc({},{rows:[]}),'alignment.rows must be a non-empty array');bad(doc({},{rows:[{name:'a'}]}),'alignment.rows[0].sequence must be a string');
  bad(doc({},{rows:[row,{name:'b',sequence:'AC',seq:'x'}]}),'unknown key "seq" in alignment.rows[1]');bad(doc({},{rows:[row],alphabet:'aa'}),'alignment.alphabet must be one of protein, dna, rna');
  bad(doc({},{rows:[row,{name:'b',sequence:'AC'}]}),/length 2; expected 4/);bad(doc({},{rows:[{name:'a',sequence:'AC1T'}]}),/Invalid residue symbol/);
  bad(doc({annotations:{}}),'annotations must be an array');bad(doc({annotations:[{id:'x',label:'x'}]}),'annotations[0].mapping must be one of mapped, unmapped');
  bad(doc({annotations:[{id:'x',label:'x',mapping:'mapped',start:1.5,end:2}]}),'annotations[0].start must be an integer');bad(doc({annotations:[{id:'x',label:'x',mapping:'mapped',rowId:'nope',start:1,end:2}]}),/unknown sequence/);
  bad(doc({annotations:[{id:'x',label:'x',mapping:'unmapped',consequence:'missense'}]}),'annotations[0].consequence must be an array of strings');
  bad(doc({tree:5}),'tree must be a Newick string');bad(doc({tree:'((a,b'}),/Invalid Newick/);bad(doc({config:{height:10}}),'height must be a number between 360 and 2000');bad(doc({config:{nope:true}}),'Unknown viewer configuration option: nope');
  bad(doc({state:{version:2}}),'state.version 2 is not supported');bad(doc({state:{...state(''),sort:'random'}}),'state.sort must be one of');bad(doc({state:{...state(''),start:'1'}}),'state.start must be a finite number');
  bad(doc({state:{...state(''),selection:{start:'a',end:2}}}),'state.selection must be null or');
  expect(()=>toJson(sample(),{config:{height:1}})).toThrow('height must be a number');expect(()=>toJson(sample(),{tree:'(('})).toThrow(/Invalid Newick/);expect(()=>toJson(sample(),{state:{version:3} as never})).toThrow('state.version 3');
});
it('does not change its input and returns plain JSON values',()=>{
  const a=sample(),doc=toJson(a),input=JSON.parse(JSON.stringify(doc)),copy=JSON.stringify(input);
  fromJson(input);expect(JSON.stringify(input)).toBe(copy);expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  doc.alignment.rows[0].metadata!.start=9;doc.annotations![0].label='changed';expect(a.rows[0].metadata).toEqual({start:5});expect(a.annotations[0].label).toBe('p.Thr2Ala');
});
it('escapes every < so that script end tags and comment openers cannot occur',()=>{
  const hostile=createAlignment([{name:'</script><script>alert(1)</script>',sequence:'ACGT',metadata:{note:'<!-- <script> -->',tag:'</SCRIPT >'}}],{name:'<!--'}),doc=toJson(hostile),json=JSON.stringify(doc);
  const escaped=escapeJson(json);expect(escaped).not.toContain('<');expect(JSON.parse(escaped)).toEqual(doc);expect(escapeJson('"a<b"')).toBe('"a\\u003cb"');
  const page=fillTemplate(`<script type="application/json" id="msa-payload">${WIRE_PLACEHOLDER}</script>`,doc),body=page.slice(page.indexOf('>')+1,page.lastIndexOf('</script>'));
  expect(page.match(/<\/script/gi)).toHaveLength(1);expect(page).not.toContain('<!--');expect(page).not.toContain(WIRE_PLACEHOLDER);expect(fromJson(body).alignment.rows[0].name).toBe('</script><script>alert(1)</script>');
  const dollars=toJson(createAlignment([{name:"$& $1 $` $'",sequence:'AC'}]));expect(fromJson(fillTemplate(`[${WIRE_PLACEHOLDER}]`,dollars).slice(1,-1)).alignment.rows[0].name).toBe("$& $1 $` $'");
  expect(()=>fillTemplate('no marker',doc)).toThrow('exactly once');expect(()=>fillTemplate(WIRE_PLACEHOLDER+WIRE_PLACEHOLDER,doc)).toThrow('exactly once');
});
