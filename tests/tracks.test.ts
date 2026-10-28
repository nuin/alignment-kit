// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createViewer} from '../src/viewer';
import {parseAlignment} from '../src/parsers';
import {calculateStats,columnDetail,blosum62,movingAverage} from '../src/analysis';
import {exportStatistics} from '../src/export';
import {parseViewerConfig} from '../src/config';
import {trackLayout,defaultVisibility} from '../src/visibility';
import {validateTrack} from '../src/tracks';
import type {CustomTrack} from '../src/types';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const make=async(text:string,alphabet:'dna'|'rna'|'protein'='dna',options={})=>{
  const el=host(),viewer=createViewer(el,{worker:false,...options});disposers.push(()=>viewer.destroy());
  await viewer.setAlignment(parseAlignment(text,{alphabet}));return {el,viewer};
};
const fasta=(rows:string[])=>rows.map((s,i)=>`>r${i}\n${s}`).join('\n');
const tracksHeight=(el:HTMLElement)=>el.querySelector<HTMLElement>('.ak-tracks')!.style.height;
const stockholm='# STOCKHOLM 1.0\n#=GS a DE x\na ACGU\nb ACGA\n#=GR a PP 9876\n#=GR b PP 1234\n#=GR b SS <<>>\n#=GC SS_cons <<>>\n#=GC PP_cons 9876\n#=GC RF xxxx\n//\n';

it('computes Shannon entropy and small-sample information content per column',()=>{
  const dna=parseAlignment(fasta(['AA-','AA-','AC-','AA-','AA-','AA-','AA-','AA-']),{alphabet:'dna'}),s=calculateStats(dna);
  expect(s.entropy[0]).toBe(0);expect(s.information[0]).toBeCloseTo(2-3/(2*Math.LN2*8),5);
  const p=7/8,h=-(p*Math.log2(p)+(1/8)*Math.log2(1/8));
  expect(s.entropy[1]).toBeCloseTo(h,5);expect(s.information[1]).toBeCloseTo(Math.max(0,2-(h+3/(2*Math.LN2*8))),5);
  expect(s.entropy[2]).toBeNaN();expect(s.information[2]).toBeNaN();
  const even=calculateStats(parseAlignment(fasta(['A','C','G','T']),{alphabet:'dna'}));
  expect(even.entropy[0]).toBeCloseTo(2,6);expect(even.information[0]).toBe(0);
});
it('uses 20 symbols for protein information and gives 0 information to a single residue',()=>{
  const s=calculateStats(parseAlignment(fasta(['M','M','M','M']),{alphabet:'protein'}));
  expect(s.information[0]).toBeCloseTo(Math.log2(20)-19/(2*Math.LN2*4),5);
  expect(calculateStats(parseAlignment(fasta(['M']),{alphabet:'protein'})).information[0]).toBe(0);
  const d=columnDetail(s,1);expect(d.entropy).toBe(0);expect(d.information).toBeCloseTo(s.information[0],5);
});
it('scores protein quality as scaled mean pairwise BLOSUM62 and leaves DNA without it',()=>{
  const s=calculateStats(parseAlignment(fasta(['AAA','AW-','AAW','A--']),{alphabet:'protein'}));
  expect(s.quality[0]).toBeCloseTo(8/15,5);
  expect(s.quality[1]).toBeCloseTo((-2/3+4)/15,5);
  expect(s.quality[2]).toBeCloseTo((-3+4)/15,5);
  expect(calculateStats(parseAlignment(fasta(['A','-']),{alphabet:'protein'})).quality[0]).toBeNaN();
  const d=calculateStats(parseAlignment(fasta(['AAAW','AAWW']),{alphabet:'protein'}));
  expect(d.quality[2]).toBeCloseTo((-3+4)/15,5);
  expect(calculateStats(parseAlignment(fasta(['AC','AC']),{alphabet:'dna'})).quality.every(Number.isNaN)).toBe(true);
  expect(blosum62('W','W')).toBe(11);expect(blosum62('A','W')).toBe(blosum62('W','A'));expect(blosum62('A','B')).toBeNull();
  for(const x of 'ARNDCQEGHILKMFPSTWYV')for(const y of 'ARNDCQEGHILKMFPSTWYV')expect(blosum62(x,y)).toBe(blosum62(y,x));
});
it('averages a centered window and skips NaN',()=>{
  const v=new Float32Array([1,NaN,3,5]);
  expect(movingAverage(v,1,2)).toBe(3);expect(movingAverage(v,3,1)).toBe(2);expect(movingAverage(v,3,3)).toBe(4);expect(movingAverage(new Float32Array([NaN]),3,0)).toBeNaN();
});
it('writes entropy, information and quality to the statistics TSV',()=>{
  const lines=exportStatistics(calculateStats(parseAlignment(fasta(['AW','AW']),{alphabet:'protein'}))).trim().split('\n');
  expect(lines[0].split('\t').slice(-3)).toEqual(['entropy_bits','information_bits','quality']);
  const cells=lines[1].split('\t');expect(cells[7]).toBe('0');expect(Number(cells[9])).toBeCloseTo(8/15,5);
  const dna=exportStatistics(calculateStats(parseAlignment(fasta(['A','A']),{alphabet:'dna'}))).trim().split('\n')[1].split('\t');expect(dna[9]).toBe('NA');
});
it('survives the worker transfer path with the new arrays',()=>{
  const s=calculateStats(parseAlignment(fasta(['AC','AC']),{alphabet:'dna'}));
  for(const key of ['entropy','information','quality'] as const)expect(ArrayBuffer.isView(s[key])).toBe(true);
});

it('lays out built-in column tracks, then registered tracks, then the reference row, and hides quality for nucleotides',()=>{
  const base=trackLayout(defaultVisibility,36);
  expect(base.height).toBe(150);expect(base.offsets).toMatchObject({ruler:0,modalFrequency:26,gapFraction:52,entropy:null,quality:null,consensus:78,reference:114});
  const all={...defaultVisibility,entropy:true,quality:true,logo:true};
  const protein=trackLayout(all,36,[{height:20},{height:40}],'protein');
  expect(protein.offsets).toMatchObject({gapFraction:52,entropy:78,quality:104,consensus:130,logo:166,reference:271});
  expect(protein.custom).toEqual([{offset:211,height:20},{offset:231,height:40}]);expect(protein.height).toBe(307);
  expect(trackLayout(all,36,[],'dna').offsets.quality).toBeNull();
  expect(trackLayout({...all,tracks:false},36,[{height:20}]).height).toBe(0);
});

it('registers, lists and removes tracks and sizes the track area',async()=>{
  const {el,viewer}=await make('>a\nACGT\n>b\nACGA');
  expect(tracksHeight(el)).toBe('150px');
  viewer.addTrack({id:'score',label:'Score',type:'bar',values:[0,0.5,1,null]});
  viewer.addTrack({id:'cols',label:'Columns',type:'text',values:'abcd',height:40});
  expect(tracksHeight(el)).toBe('216px');
  expect([...el.querySelectorAll('.ak-custom-label')].map(n=>[n.textContent,(n as HTMLElement).style.top])).toEqual([['Score','117px'],['Columns','150px']]);
  expect(viewer.getTracks().map(t=>t.id)).toEqual(['score','cols']);
  viewer.getTracks()[0].label='changed';expect(viewer.getTracks()[0].label).toBe('Score');
  viewer.removeTrack('score');expect(viewer.getTracks().map(t=>t.id)).toEqual(['cols']);expect(tracksHeight(el)).toBe('190px');
  expect(el.querySelectorAll('.ak-custom-label')).toHaveLength(1);
  viewer.setOptions({visibility:{tracks:false}});expect(tracksHeight(el)).toBe('0px');
});
it('rejects invalid track definitions, duplicates and unknown ids with an error event',async()=>{
  const {viewer}=await make('>a\nACGT\n>b\nACGA'),errors:string[]=[];viewer.on('error',e=>errors.push(e.message));
  const ok:CustomTrack={id:'t',label:'T',type:'bar'};viewer.addTrack(ok);
  expect(()=>viewer.addTrack(ok)).toThrow(/already exists/);
  expect(()=>viewer.addTrack({id:'u',label:'U',type:'bar',values:[1,2,3]})).toThrow(/3 entries; expected 4/);
  expect(()=>viewer.addTrack({id:'u',label:'U',type:'text',values:'abcde'})).toThrow(/expected 4/);
  expect(()=>viewer.addTrack({id:'v',label:'V',type:'custom'})).toThrow(/render/);
  expect(()=>viewer.addTrack({id:'v',label:'V',type:'bar',height:5})).toThrow(/height/);
  expect(()=>viewer.addTrack({id:'v',label:'V',type:'bar',height:121})).toThrow(/height/);
  expect(()=>viewer.addTrack({id:'v',label:'V',type:'bar',domain:[1,1]})).toThrow(/domain/);
  expect(()=>viewer.addTrack({id:'v',label:'V',type:'wiggle' as 'bar'})).toThrow(/type/);
  expect(()=>viewer.addTrack({id:'logo',label:'V',type:'bar'})).toThrow(/reserved/);
  expect(()=>viewer.addTrack({id:'bad id',label:'V',type:'bar'})).toThrow(/id/);
  expect(()=>viewer.addTrack({id:'v',label:'',type:'bar'})).toThrow(/label/);
  expect(()=>viewer.removeTrack('missing')).toThrow(/Unknown track/);
  expect(viewer.getTracks().map(t=>t.id)).toEqual(['t']);
  expect(errors).toHaveLength(12);expect(errors[1]).toMatch(/3 entries/);
});
it('flags values whose length no longer fits a newly loaded alignment',async()=>{
  const track:CustomTrack={id:'t',label:'T',type:'heatmap',values:[0,1,0,1]};
  const {el,viewer}=await make('>a\nACGT\n>b\nACGA',undefined,{tracks:[track]}),errors:string[]=[];viewer.on('error',e=>errors.push(e.message));
  expect(tracksHeight(el)).toBe('176px');
  await viewer.setAlignment(parseAlignment('>a\nACGTAC\n>b\nACGAAC',{alphabet:'dna'}));
  expect(errors.some(m=>/6/.test(m)&&/4 entries/.test(m))).toBe(true);expect(tracksHeight(el)).toBe('150px');expect(viewer.getTracks()).toHaveLength(1);
});
it('accepts tracks from options and replaces them on update',async()=>{
  const {viewer}=await make('>a\nAC',undefined,{tracks:[{id:'a',label:'A',type:'bar'}]});
  expect(viewer.getTracks().map(t=>t.id)).toEqual(['a']);
  viewer.setOptions({tracks:[{id:'b',label:'B',type:'text'}]});expect(viewer.getTracks().map(t=>t.id)).toEqual(['b']);
  viewer.setOptions({height:500});expect(viewer.getTracks().map(t=>t.id)).toEqual(['b']);
  expect(()=>viewer.setOptions({tracks:[{id:'x',label:'X',type:'bar'},{id:'x',label:'X',type:'bar'}]})).toThrow(/duplicate/);
  viewer.setOptions({tracks:[]});expect(viewer.getTracks()).toEqual([]);
});
it('selects a column when a track column is clicked',async()=>{
  const {el,viewer}=await make('>a\nACGTACGT\n>b\nACGAACGA',undefined,{cellWidth:16,labelWidth:230});
  const tracks=el.querySelector('.ak-tracks')!;
  tracks.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:230+16*2+3,clientY:10}));
  expect(viewer.getState().selection).toEqual({start:3,end:3});
  tracks.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:100,clientY:10}));
  expect(viewer.getState().selection).toEqual({start:3,end:3});
  tracks.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:230+16*5+1,clientY:120}));
  expect(viewer.getState().selection).toEqual({start:6,end:6,rowId:viewer.getAlignment()!.rows[0].id});
});
it('validates declarative tracks in JSON configuration and the standalone validator',()=>{
  const track={id:'t',label:'T',type:'bar',values:[0,null,1],domain:[0,1],color:'#336699',height:30};
  expect(parseViewerConfig({tracks:[track],logoMode:'bits',conservationWindow:5})).toEqual({tracks:[track],logoMode:'bits',conservationWindow:5});
  for(const bad of [{...track,height:200},{...track,type:'custom'},{...track,values:[0,'x']},{...track,render:()=>{}},{...track,extra:1},{id:'t'}])expect(()=>parseViewerConfig({tracks:[bad]})).toThrow(/Track|track/);
  expect(()=>parseViewerConfig({tracks:[track,track]})).toThrow(/duplicate/);
  expect(()=>parseViewerConfig({tracks:{}})).toThrow(/array/);
  for(const w of [0,2,4,53,1.5,'3'])expect(()=>parseViewerConfig({conservationWindow:w})).toThrow(/conservationWindow/);
  expect(()=>parseViewerConfig({logoMode:'info'})).toThrow(/logoMode/);
  expect(parseViewerConfig({visibility:{entropy:true,quality:true,stockholmTracks:false}}).visibility).toEqual({entropy:true,quality:true,stockholmTracks:false});
  const fn=()=>{};expect(validateTrack({id:'c',label:'C',type:'custom',render:fn}).render).toBe(fn);
});
it('normalizes the conservation window to an odd integer from 1 to 51',async()=>{
  const {viewer}=await make('>a\nAC');
  for(const [input,expected] of [[4,3],[100,51],[0,1],[8,7],[5,5]] as const){viewer.setOptions({conservationWindow:input});expect((viewer as any).options.conservationWindow).toBe(expected);}
  expect(()=>viewer.setOptions({logoMode:'x' as 'bits'})).toThrow(/logoMode/);
});

it('builds Stockholm GC tracks from the bundled tRNA fixture',async()=>{
  const text=gunzipSync(readFileSync('demo/public/trna-seed.sto.gz')).toString('utf8');
  const {el,viewer}=await make(text,'rna');
  const drawn=(viewer as any).drawnTracks() as CustomTrack[],keys=Object.keys(viewer.getAlignment()!.metadata.stockholm!.GC);
  expect(keys).toContain('SS_cons');expect(keys).toContain('RF');
  expect(drawn.map(t=>t.label)).toEqual(keys);expect(drawn.every(t=>t.type==='text'&&t.values!.length===viewer.getAlignment()!.width)).toBe(true);
  expect(tracksHeight(el)).toBe(`${150+20*keys.length}px`);expect(viewer.getTracks()).toEqual([]);
  viewer.setOptions({visibility:{stockholmTracks:false}});expect(tracksHeight(el)).toBe('150px');
});
it('shows PP_cons as shading and GR lines for the selected or pinned row',async()=>{
  const {el,viewer}=await make(stockholm,'rna');
  const a=viewer.getAlignment()!,labels=()=>((viewer as any).drawnTracks() as CustomTrack[]).map(t=>t.label);
  expect(labels()).toEqual(['SS_cons','PP_cons','RF','PP a']);
  const gc=(viewer as any).drawnTracks() as CustomTrack[];
  expect(gc.find(t=>t.label==='PP_cons')).toMatchObject({type:'heatmap',domain:[0,9],values:'9876'});
  expect(gc.find(t=>t.label==='SS_cons')).toMatchObject({type:'text',values:'<<>>'});
  expect(labels().filter(l=>/ a$| b$/.test(l))).toEqual(['PP a']);
  viewer.setSelection({start:2,end:2,rowId:a.rows[1].id});
  expect(labels().filter(l=>/ [ab]$/.test(l))).toEqual(['PP b','SS b']);
  expect(el.querySelectorAll('.ak-custom-label')).toHaveLength(5);
  expect((viewer as any).drawnTracks().find((t:CustomTrack)=>t.label==='PP b')).toMatchObject({type:'heatmap',values:'1234'});
  viewer.setSelection(null);expect(labels().filter(l=>/ [ab]$/.test(l))).toEqual(['PP a']);
  viewer.setReference(a.rows[1].id);expect(labels().filter(l=>/ [ab]$/.test(l))).toEqual(['PP b','SS b']);
  expect(tracksHeight(el)).toBe(`${150+20*5}px`);
});
const recorder=()=>{
  const calls:[string,unknown[]][]=[],ctx:Record<string,unknown>={};
  const proxy=new Proxy(ctx,{get:(t,k:string)=>k in t?t[k]:(...args:unknown[])=>{calls.push([k,args]);},set:(t,k:string,v)=>{t[k]=v;return true;}});
  return {calls,proxy};
};
it('draws entropy, quality, bit-scaled logo and registered tracks on the track canvas',async()=>{
  const {viewer}=await make(fasta(['AAWW','AAWW','AAWC','AAWC']),'protein',{visibility:{entropy:true,quality:true,logo:true},logoMode:'bits',conservationWindow:3,cellWidth:16});
  const seen:Record<string,unknown>[]=[],bad:CustomTrack={id:'bad',label:'Bad',type:'custom',render:()=>{throw new Error('boom');}};
  viewer.addTrack({id:'c',label:'C',type:'custom',render:(_ctx,info)=>{seen.push({...info,alignment:undefined});}});
  viewer.addTrack({id:'h',label:'H',type:'heatmap',values:[0,1,null,0.5]});viewer.addTrack({id:'t',label:'T',type:'text',values:'abcd'});viewer.addTrack({id:'b',label:'B',type:'bar',values:'0912',domain:[0,9]});viewer.addTrack(bad);
  const errors:string[]=[];viewer.on('error',e=>errors.push(e.message));
  const rec=recorder(),canvas=document.createElement('canvas');vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation((()=>rec.proxy) as never);
  const view=(viewer as any).view();(viewer as any).renderer.tracks(canvas,view,600);(viewer as any).renderer.tracks(canvas,view,600);
  expect(seen[0]).toMatchObject({start:1,end:4,cellWidth:16,offsetX:230,height:26});
  expect(rec.calls.filter(([k,a])=>k==='fillText'&&['a','b','c','d'].includes(a[0] as string)).length).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual(['Track bad: render failed: boom']);vi.restoreAllMocks();
});
it('keeps the render of a class-based track and ignores later changes to the input',()=>{
  let seen=0;class T{id='cls';label='C';type='custom';render(){seen++;}}
  const copy=validateTrack(new T());(copy.render as any)({});
  expect(typeof copy.render).toBe('function');expect(seen).toBe(1);
  const plain:any={id:'p',label:'P',type:'bar'},c=validateTrack(plain);plain.label='X';expect(c.label).toBe('P');expect(Object.keys(c)).toEqual(['id','label','type']);
});
it('leaves tracks unchanged when setOptions fails on logoMode',async()=>{
  const {viewer}=await make('>a\nAC',undefined,{tracks:[{id:'a',label:'A',type:'bar'}]});
  expect(()=>viewer.setOptions({tracks:[],logoMode:'x' as any})).toThrow(/logoMode/);expect(viewer.getTracks().map(t=>t.id)).toEqual(['a']);
});
it('shows GR tracks only for a selected row or a pinned reference',async()=>{
  const {viewer}=await make(stockholm,'rna'),labels=()=>((viewer as any).drawnTracks() as CustomTrack[]).map(t=>t.label);
  viewer.setOptions({visibility:{reference:false}});expect(labels()).toEqual(['SS_cons','PP_cons','RF']);
  viewer.setOptions({visibility:{reference:true,tracks:false}});expect(labels()).toEqual(['SS_cons','PP_cons','RF']);
});
it('keeps the track area free of an inner scrollbar',()=>{
  const css=readFileSync('src/style.css','utf8'),rule=css.match(/\.ak-tracks\{[^}]*\}/)![0];
  expect(rule).not.toContain('max-height');expect(rule).toContain('overflow:hidden');
});
