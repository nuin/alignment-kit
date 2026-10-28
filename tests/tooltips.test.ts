// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {parseViewerConfig} from '../src/config';
import {validateAnnotationLinks,annotationDetails} from '../src/tooltip';
import {mountViewer} from '../src/integration';
const disposers:(()=>void)[]=[];
beforeAll(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.useRealTimers();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const rows=[{id:'a',name:'Alpha',sequence:'ACCGT'},{id:'b',name:'Beta',sequence:'AC-GT',metadata:{start:10}},{id:'c',name:'Gamma',sequence:'ACCGT'}];
const note={id:'n1',rowId:'b',label:'<b>V1</b>',kind:'variant',consequence:['missense'],disease:true,start:2,end:2,mapping:'mapped' as const,metadata:{evidence:'ECO:0000269, IEA',source:'ClinVar',pubmed:['123456','x<y'],pmid:99}};
const make=async(options={}):Promise<any>=>{
  vi.useRealTimers();const v=createViewer(host(),{worker:false,annotationLinks:{pubmed:'https://pubmed.ncbi.nlm.nih.gov/{id}/'},...options});disposers.push(()=>v.destroy());
  const a=createAlignment(rows,{alphabet:'dna'});a.annotations=[note];await v.setAlignment(a);vi.useFakeTimers();return v;
};
const at=(v:any,col:number,row:number)=>({clientX:v.gutter+(col-0.5)*v.options.cellWidth,clientY:(row+0.5)*v.options.rowHeight});
const move=(v:any,col:number,row:number,type='mouse')=>{const e=new MouseEvent('pointermove',{...at(v,col,row),bubbles:true});Object.defineProperty(e,'pointerType',{value:type});v.scroll.dispatchEvent(e);};
const card=(v:any)=>v.root.querySelector('.ak-tooltip') as HTMLElement|null;
const click=(v:any,col:number,row:number,shiftKey=false)=>v.scroll.dispatchEvent(new MouseEvent('click',{...at(v,col,row),shiftKey,bubbles:true}));

it('shows a residue card after 300 ms with offset position and hides on leave',async()=>{
  const v=await make();move(v,4,0);vi.advanceTimersByTime(299);expect(card(v)).toBeNull();vi.advanceTimersByTime(2);
  const t=card(v)!.textContent!;expect(t).toContain('Beta');expect(t).toContain('Residue G');expect(t).toContain('Column 4');expect(t).toContain('Position 12');
  v.scroll.dispatchEvent(new Event('pointerleave'));expect(card(v)).toBeNull();
});
it('reports gaps and the reference residue number',async()=>{
  const v=await make({rulerCoordinates:'reference'});move(v,3,0);vi.advanceTimersByTime(300);
  const t=card(v)!.textContent!;expect(t).toContain('Residue gap');expect(t).toContain('Position gap');expect(t).toContain('Reference residue 3');
});
it('hides on scroll and key press, and ignores touch and active panning',async()=>{
  const v=await make();move(v,1,1);vi.advanceTimersByTime(300);expect(card(v)).not.toBeNull();v.scroll.dispatchEvent(new Event('scroll'));expect(card(v)).toBeNull();
  move(v,2,1);vi.advanceTimersByTime(300);v.scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));expect(card(v)).toBeNull();
  move(v,3,1,'touch');vi.advanceTimersByTime(300);expect(card(v)).toBeNull();
  v.root.dataset.panning='true';move(v,4,1);vi.advanceTimersByTime(300);expect(card(v)).toBeNull();
});
it('emits hover and cellclick, also with tooltips off',async()=>{
  const v=await make({tooltips:false}),hover:any[]=[],clicks:any[]=[];v.on('hover',(e:any)=>hover.push(e));v.on('cellclick',(e:any)=>clicks.push(e));
  move(v,3,0);move(v,3,0);v.scroll.dispatchEvent(new Event('pointerleave'));click(v,3,0,true);vi.advanceTimersByTime(500);
  expect(hover).toEqual([{rowId:'b',column:3,residue:'-',position:null},null]);expect(clicks).toEqual([{rowId:'b',column:3,residue:'-',position:null,shiftKey:true}]);expect(card(v)).toBeNull();
});
it('shows annotation details with escaped text and links only from templates',async()=>{
  const v=await make();move(v,2,0);vi.advanceTimersByTime(300);const c=card(v)!;
  expect(c.textContent).toContain('<b>V1</b>');expect(c.querySelector('b')).toBeNull();
  for(const s of ['variant','missense','disease','ECO:0000269','IEA','ClinVar','123456','99'])expect(c.textContent).toContain(s);
  const links=[...c.querySelectorAll('a')];expect(links.map(a=>a.getAttribute('href'))).toEqual(['https://pubmed.ncbi.nlm.nih.gov/123456/','https://pubmed.ncbi.nlm.nih.gov/99/']);
  expect(links.every(a=>a.rel.includes('noopener')&&a.target==='_blank')).toBe(true);
  const none=await make({annotationLinks:{}});move(none,2,0);vi.advanceTimersByTime(300);expect(card(none)!.querySelector('a')).toBeNull();
});
it('pins on click until Escape or close',async()=>{
  const v=await make();click(v,2,0);const c=card(v)!;expect(c.dataset.pinned).toBe('true');
  move(v,4,1);vi.advanceTimersByTime(500);expect(card(v)).toBe(c);v.scroll.dispatchEvent(new Event('scroll'));expect(card(v)).toBe(c);
  v.scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(card(v)).toBeNull();
  click(v,2,0);(card(v)!.querySelector('.ak-tip-close') as HTMLElement).click();expect(card(v)).toBeNull();
  click(v,4,1);expect(card(v)).toBeNull();
});
it('honors visibility.tooltip and removes the card when switched off',async()=>{
  const v=await make({visibility:{tooltip:false}});move(v,2,0);vi.advanceTimersByTime(300);expect(card(v)).toBeNull();
  v.setOptions({visibility:{tooltip:true}});move(v,3,1);vi.advanceTimersByTime(300);expect(card(v)).not.toBeNull();v.setOptions({tooltips:false});expect(card(v)).toBeNull();
});
it('validates annotationLinks in options and configuration',async()=>{
  for(const bad of [{p:'javascript:alert({id})'},{p:'https://x.org/'},{p:'ftp://x.org/{id}'},{p:5},['a']] as any[]){expect(()=>validateAnnotationLinks(bad)).toThrow(/annotationLinks/);expect(()=>parseViewerConfig({annotationLinks:bad})).toThrow(/annotationLinks/);}
  expect(parseViewerConfig({tooltips:false,annotationLinks:{PubMed:'http://x.org/{id}'}})).toEqual({tooltips:false,annotationLinks:{pubmed:'http://x.org/{id}'}});
  expect(()=>parseViewerConfig({tooltips:1})).toThrow(/boolean/);
  const v=await make();expect(()=>v.setOptions({annotationLinks:{p:'javascript:{id}'}})).toThrow(/http/);
  const {readFileSync}=await import('node:fs'),schema=JSON.parse(readFileSync('config/viewer-config.schema.json','utf8'));expect(schema.properties.tooltips.type).toBe('boolean');expect(schema.properties.annotationLinks.type).toBe('object');expect(schema.properties.visibility.properties.tooltip.type).toBe('boolean');
});
it('reads evidence, source and PubMed IDs from metadata',()=>{
  expect(annotationDetails(note)).toEqual({evidence:['ECO:0000269','IEA'],source:['ClinVar'],pubmed:['123456','x<y','99']});
  expect(annotationDetails({id:'x',label:'x',mapping:'unmapped',metadata:{pubmed:'PMID:7;8'}}).pubmed).toEqual(['7','8']);
});
it('forwards hover and cellclick through the integration',async()=>{
  const hover=vi.fn(),click_=vi.fn(),m=mountViewer(host(),{options:{worker:false},onHover:hover,onCellClick:click_});disposers.push(()=>m.destroy());
  await m.viewer.setAlignment(createAlignment(rows,{alphabet:'dna'}));vi.useFakeTimers();const v=m.viewer as any;move(v,1,0);click(v,1,0);
  expect(hover).toHaveBeenCalledWith({rowId:'b',column:1,residue:'A',position:10});expect(click_).toHaveBeenCalledWith(expect.objectContaining({rowId:'b',column:1,shiftKey:false}));
});
it('shows the card again in the same cell after a key press, scroll or reload and emits hover null',async()=>{
  const v=await make(),hover:any[]=[];v.on('hover',(e:any)=>hover.push(e));
  move(v,2,0);vi.advanceTimersByTime(300);expect(card(v)).not.toBeNull();
  v.scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));expect(card(v)).toBeNull();expect(hover.at(-1)).toBeNull();
  move(v,2,0);vi.advanceTimersByTime(300);expect(card(v)).not.toBeNull();
  v.scroll.dispatchEvent(new Event('scroll'));expect(card(v)).toBeNull();vi.advanceTimersByTime(300);expect(card(v)).not.toBeNull();
  const a=createAlignment(rows,{alphabet:'dna'});a.annotations=[note];vi.useRealTimers();await v.setAlignment(a);vi.useFakeTimers();
  expect(card(v)).toBeNull();expect(hover.at(-1)).toBeNull();move(v,2,0);vi.advanceTimersByTime(300);expect(card(v)).not.toBeNull();
});
it('refreshes hover when a scroll moves another cell under a stationary pointer',async()=>{
  const v=await make(),hover:any[]=[];v.on('hover',(e:any)=>hover.push(e));
  move(v,2,0);expect(hover).toHaveLength(1);v.scroll.scrollLeft=v.options.cellWidth;v.scroll.dispatchEvent(new Event('scroll'));
  expect(hover.length).toBe(2);expect(hover[1]).toMatchObject({rowId:'b',column:3});
});
it('shows cards for the original column when columns are hidden',async()=>{
  const v=await make();v.hideColumns(1,1);move(v,1,0);vi.advanceTimersByTime(300);const t=card(v)!.textContent!;
  expect(t).toContain('Column 2');expect(t).toContain('<b>V1</b>');
});
