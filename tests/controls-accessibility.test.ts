// @vitest-environment jsdom
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import type {ViewerOptions} from '../src/types';

const cleanup:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{cleanup.splice(0).forEach(dispose=>dispose());document.body.replaceChildren();vi.unstubAllGlobals();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});});
const tick=()=>new Promise(resolve=>setTimeout(resolve));
async function mounted(options:ViewerOptions={},text='>r1\nACGT\n>r2\nACGA\n>r3\nAC-T\n>r4\nTCGT\n>r5\nACGG\n>r6\nGCGT') {
  const host=document.createElement('div');document.body.append(host);
  const viewer=createViewer(host,{worker:false,...options});cleanup.push(()=>viewer.destroy());
  await viewer.load(text,{alphabet:'dna'});
  return {viewer,root:host.querySelector<HTMLElement>('.ak-viewer')??host};
}
const press=(target:Element,key:string,init:KeyboardEventInit={})=>target.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...init}));

it('puts every tools control in a labelled group and keeps the earlier accessible names',async()=>{
  const {root}=await mounted();
  const groups=[...root.querySelectorAll('.ak-tools [role=group].ak-toolgroup')].map(g=>g.getAttribute('aria-label'));
  expect(groups).toEqual(['Navigate','Rows','Columns','Display','Thresholds','Row filters','Statistics and ruler']);
  for(const control of root.querySelectorAll('.ak-tools :is(input,select,button):not(.ak-select-trigger,.ak-more-toggle)'))expect(control.closest('.ak-toolgroup'),control.outerHTML.slice(0,80)).not.toBeNull();
  for(const name of ['Go to alignment column','Find motif','Find previous motif','Find next motif','Sequence order','Previous variant','Next variant','Residues to color','Show frequency logo','Dots for matches','Reverse complement','Consensus threshold','Color threshold','Minimum identity to reference','Minimum coverage','Statistics scope','Ruler coordinates','Sequence alphabet','Filter sequences','Color scheme','Zoom out','Zoom in','Export alignment','Visible columns only'])expect(root.querySelector(`[aria-label="${name}"]`),name).not.toBeNull();
  for(const action of ['open','fit','theme','inspect','text-view','fullscreen','show-hidden','hide-columns','show-columns'])expect(root.querySelector(`[data-action="${action}"]`),action).not.toBeNull();
});
it('keeps the rarely used controls behind one More disclosure that opens and closes',async()=>{
  const {root}=await mounted(),toggle=root.querySelector<HTMLButtonElement>('.ak-more-toggle')!,panel=root.querySelector<HTMLElement>('.ak-more')!;
  expect(root.querySelectorAll('.ak-more-toggle')).toHaveLength(1);expect(toggle.textContent).toBe('More');
  expect(toggle.getAttribute('aria-controls')).toBe(panel.id);expect(toggle.getAttribute('aria-expanded')).toBe('false');expect(panel.hidden).toBe(true);
  for(const name of ['Consensus threshold','Color threshold','Minimum identity to reference','Minimum coverage','Statistics scope','Ruler coordinates'])expect(panel.querySelector(`[aria-label="${name}"]`),name).not.toBeNull();
  for(const name of ['Go to alignment column','Sequence order','Residues to color','Reverse complement','Sequence alphabet'])expect(panel.querySelector(`[aria-label="${name}"]`),name).toBeNull();
  toggle.click();expect(panel.hidden).toBe(false);expect(toggle.getAttribute('aria-expanded')).toBe('true');
  toggle.click();expect(panel.hidden).toBe(true);expect(toggle.getAttribute('aria-expanded')).toBe('false');
});
it('gives each second-viewer disclosure, tab and key description its own ID',async()=>{
  const a=await mounted(),b=await mounted();
  for(const selector of ['.ak-more','.ak-inspector-content','[data-tab=position]','.ak-scroll'])expect(a.root.querySelector(selector)!.id||a.root.querySelector(selector)!.getAttribute('aria-describedby')).not.toBe(b.root.querySelector(selector)!.id||b.root.querySelector(selector)!.getAttribute('aria-describedby'));
});
it('contains the visible label text in the accessible name of every labelled control',async()=>{
  const {root}=await mounted();let checked=0;
  for(const label of root.querySelectorAll('.ak-toolbar label,.ak-tools label,.ak-fasta-options label')){
    const control=label.querySelector('input,select')!,visible=[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent!.trim()).join(' ').trim().toLowerCase();
    if(!visible)continue;checked++;expect(control.getAttribute('aria-label')!.toLowerCase(),visible).toContain(visible);
  }
  expect(checked).toBeGreaterThanOrEqual(17);
  for(const button of root.querySelectorAll<HTMLElement>('.ak-toolbar button[aria-label]:not(.ak-select-trigger),.ak-tools button[aria-label]:not(.ak-select-trigger)')){const visible=button.textContent!.replace(/[‹›]/g,'').trim().toLowerCase();if(visible.length>1)expect(button.getAttribute('aria-label')!.toLowerCase(),visible).toContain(visible);}
  expect(root.querySelector('[data-action="inspect"]')!.hasAttribute('aria-label')).toBe(false);
});
it('reports the theme and inspector toggles as pressed from the options, including API changes',async()=>{
  const {viewer,root}=await mounted({showInspector:false}),theme=root.querySelector('[data-action="theme"]')!,inspect=root.querySelector<HTMLElement>('[data-action="inspect"]')!;
  await tick();expect(theme.getAttribute('aria-label')).toBe('Dark theme');
  expect(theme.getAttribute('aria-pressed')).toBe('false');expect(inspect.getAttribute('aria-pressed')).toBe('false');
  viewer.setOptions({theme:'dark',showInspector:true});await tick();
  expect(theme.getAttribute('aria-pressed')).toBe('true');expect(inspect.getAttribute('aria-pressed')).toBe('true');
  inspect.click();await tick();expect(inspect.getAttribute('aria-pressed')).toBe('false');
  viewer.setOptions({theme:'auto'});await tick();expect(root.dataset.theme).toBe('auto');expect(theme.getAttribute('aria-pressed')).toBe('false');
});
it('follows the system color scheme for the auto theme toggle state',async()=>{
  const listeners:(()=>void)[]=[],query={matches:true,addEventListener:(_:string,fn:()=>void)=>listeners.push(fn)};
  vi.stubGlobal('matchMedia',()=>query);
  const {root}=await mounted({theme:'auto'}),theme=root.querySelector('[data-action="theme"]')!;
  await tick();expect(theme.getAttribute('aria-pressed')).toBe('true');
  query.matches=false;listeners.forEach(fn=>fn());expect(theme.getAttribute('aria-pressed')).toBe('false');
});
it('announces errors assertively and other messages politely',async()=>{
  const {viewer,root}=await mounted(),message=root.querySelector<HTMLElement>('.ak-message')!;
  expect(message.getAttribute('role')).toBe('status');
  expect(()=>viewer.setOptions({logoMode:'tall' as never})).toThrow();await tick();
  expect(message.dataset.error).toBe('true');expect(message.getAttribute('role')).toBe('alert');
  root.querySelector<HTMLElement>('[data-action="hide-columns"]')!.click();await tick();
  expect(message.textContent).toMatch(/Select columns/);expect(message.getAttribute('role')).toBe('status');
});
it('exposes the inspector tabs as a tablist with one tab stop and arrow-key movement',async()=>{
  const {viewer,root}=await mounted(),list=root.querySelector('.ak-tabs')!,tabs=[...list.querySelectorAll<HTMLElement>('[role=tab]')],panel=root.querySelector('.ak-inspector-content')!;
  const selected=()=>tabs.filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.dataset.tab);
  expect(list.getAttribute('role')).toBe('tablist');expect(tabs.map(t=>t.textContent)).toEqual(['Position','Features','Compare','Colors','Hits','Summary']);
  expect(panel.getAttribute('role')).toBe('tabpanel');expect(selected()).toEqual(['position']);expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
  expect(tabs.filter(t=>t.tabIndex===0)).toEqual([tabs[0]]);for(const tab of tabs)expect(tab.getAttribute('aria-controls')).toBe(panel.id);
  tabs[0].focus();press(tabs[0],'ArrowRight');
  expect(selected()).toEqual(['annotations']);expect(document.activeElement).toBe(tabs[1]);expect(tabs.filter(t=>t.tabIndex===0)).toEqual([tabs[1]]);expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
  press(tabs[1],'End');expect(selected()).toEqual(['summary']);press(tabs[5],'ArrowRight');expect(selected()).toEqual(['position']);
  press(tabs[0],'ArrowLeft');expect(selected()).toEqual(['summary']);press(tabs[5],'Home');expect(selected()).toEqual(['position']);
  viewer.setOptions({visibility:{featuresTab:false,compareTab:false}});press(tabs[0],'ArrowRight');expect(selected()).toEqual(['legend']);
  tabs[4].click();expect((viewer as unknown as {core:{tab:string}}).core.tab).toBe('hits');
});
it('names the grid briefly and moves the key instructions to a description',async()=>{
  const {root}=await mounted(),grid=root.querySelector('.ak-scroll')!;
  expect(grid.getAttribute('aria-label')).toBe('Alignment residues');
  const text=root.querySelector('#'+grid.getAttribute('aria-describedby'))!.textContent!;
  for(const word of ['Arrow keys','Shift','Page Up','Page Down','Home','End','Plus and minus','brackets','Escape'])expect(text).toContain(word);
});
it('moves the active row by a screen with Page Up and Page Down and to the ends with Control Home and End',async()=>{
  const {viewer,root}=await mounted(),grid=root.querySelector<HTMLElement>('.ak-scroll')!,ids=viewer.getAlignment()!.rows.map(r=>r.id);
  const rowHeight=(viewer as unknown as {core:{options:{rowHeight:number}}}).core.options.rowHeight;Object.defineProperty(grid,'clientHeight',{configurable:true,value:rowHeight*2+5});
  const row=()=>ids.indexOf(viewer.getState().selection!.rowId!);
  // The pinned reference (row 0) sits in the track area, so the body holds rows 1 to 5.
  viewer.setSelection({start:3,end:3,rowId:ids[1]});
  const event=new KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true});grid.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);expect(row()).toBe(3);expect(viewer.getState().selection!.start).toBe(3);
  press(grid,'PageDown');expect(row()).toBe(5);press(grid,'PageDown');expect(row()).toBe(5);
  press(grid,'PageUp');expect(row()).toBe(3);press(grid,'PageUp');expect(row()).toBe(1);press(grid,'PageUp');expect(row()).toBe(1);
  press(grid,'End',{ctrlKey:true});expect(row()).toBe(5);expect(viewer.getState().selection!.start).toBe(3);
  press(grid,'Home',{ctrlKey:true});expect(row()).toBe(1);expect(viewer.getState().selection!.start).toBe(3);
  press(grid,'End');expect(viewer.getState().selection!.start).toBe(4);expect(row()).toBe(1);press(grid,'Home');expect(viewer.getState().selection!.start).toBe(1);
});
