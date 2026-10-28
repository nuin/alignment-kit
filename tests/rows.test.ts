// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createViewer} from '../src/viewer';
import {createAlignment} from '../src/model';
import {encodeViewLink,decodeViewLink} from '../src/link';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const data=()=>createAlignment([
  {id:'a',name:'Zeta',sequence:'ACGT',species:'human',metadata:{clade:'x'}},
  {id:'b',name:'Alpha',sequence:'ACGA',species:'mouse',metadata:{clade:'y'}},
  {id:'c',name:'Mid',sequence:'TCGT',species:'human',metadata:{clade:'x'}},
  {id:'d',name:'Beta',sequence:'ACGG',species:'mouse'},
  {id:'e',name:'Gamma',sequence:'A-GT'},
],{alphabet:'dna',annotations:[{id:'f1',rowId:'d',label:'site',start:1,end:2,mapping:'mapped'},{id:'f2',rowId:'a',label:'other',start:2,end:3,mapping:'mapped'}]});
const make=async()=>{const viewer=createViewer(host(),{worker:false,visibility:{reference:false}});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());return viewer;};
const shown=(viewer:any)=>(viewer.rows as number[]).map(i=>i<0?`#${viewer.groupList[-i-1].name}`:viewer.a.rows[i].id).join(',');

it('hides and restores rows without changing the alignment',async()=>{
  const viewer=await make();expect(shown(viewer)).toBe('a,b,c,d,e');
  viewer.hideRows(['b','d']);expect(shown(viewer)).toBe('a,c,e');expect(viewer.getAlignment()!.rows).toHaveLength(5);expect(viewer.getState().hiddenRowIds).toEqual(['b','d']);
  const button=viewer.element.querySelector<HTMLElement>('[data-action="show-hidden"]')!;expect(button.textContent).toBe('Show hidden (2)');expect(button.hidden).toBe(false);
  viewer.showRows(['b']);expect(shown(viewer)).toBe('a,b,c,e');
  viewer.showRows();expect(shown(viewer)).toBe('a,b,c,d,e');expect(button.hidden).toBe(true);
  expect(()=>viewer.hideRows(['nope'])).toThrow(/Unknown sequence ID/);
  viewer.hideRows(['a']);button.click();expect(viewer.getState().hiddenRowIds).toEqual([]);
});
it('recomputes filtered statistics when rows are hidden',async()=>{
  const viewer=await make();viewer.setOptions({statisticsScope:'filtered'});await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(5));
  viewer.hideRows(['a','b']);await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(3));
  viewer.showRows();await vi.waitFor(()=>expect(viewer.getStatistics()?.total).toBe(5));
});
it('moves rows into a manual order and keeps it when switching sort',async()=>{
  const viewer=await make();expect(viewer.getRowOrder()).toEqual(['a','b','c','d','e']);
  viewer.moveRow('e',0);expect(viewer.getRowOrder()).toEqual(['e','a','b','c','d']);expect(viewer.getState()).toMatchObject({sort:'manual',manualOrder:['e','a','b','c','d']});
  viewer.moveRow('e',99);expect(viewer.getRowOrder()).toEqual(['a','b','c','d','e']);
  viewer.moveRow('c',1);expect(shown(viewer)).toBe('a,c,b,d,e');
  await viewer.setSort('name');expect(viewer.getRowOrder()).toEqual(['b','d','e','c','a']);
  await viewer.setSort('manual');expect(shown(viewer)).toBe('a,c,b,d,e');
  viewer.hideRows(['c']);expect(shown(viewer)).toBe('a,b,d,e');expect(viewer.getRowOrder()).toContain('c');
  expect(()=>viewer.moveRow('zz',0)).toThrow(/Unknown sequence ID/);expect(()=>viewer.moveRow('a',1.5)).toThrow(/integer/);
});
it('starts manual order from the current sort',async()=>{
  const viewer=await make();await viewer.setSort('name');await viewer.setSort('manual');
  expect(viewer.getState().manualOrder).toEqual(['b','d','e','c','a']);expect(shown(viewer)).toBe('b,d,e,c,a');
});
it('removes rows from a copy and recomputes statistics, keeping the view',async()=>{
  const viewer=await make(),original=viewer.getAlignment()!;viewer.moveRow('d',0);viewer.hideRows(['e']);viewer.setFilter('a');viewer.setReference('c');
  await viewer.removeRows(['a','b']);
  const next=viewer.getAlignment()!;expect(next).not.toBe(original);expect(original.rows).toHaveLength(5);
  expect(next.rows.map(r=>r.id)).toEqual(['c','d','e']);expect(next.annotations.map(a=>a.id)).toEqual(['f1']);expect(viewer.getStatistics()?.total).toBe(3);
  const state=viewer.getState();expect(state).toMatchObject({sort:'manual',query:'a',referenceId:'c',hiddenRowIds:['e']});expect(viewer.getRowOrder()).toEqual(['d','c','e']);
  await expect(viewer.removeRows(['c','d','e'])).rejects.toThrow(/At least one/);await expect(viewer.removeRows(['x'])).rejects.toThrow(/Unknown/);
  await viewer.removeRows([]);expect(viewer.getAlignment()).toBe(next);
});
it('orders rows by group, then by the current sort, with header rows',async()=>{
  const viewer=await make();viewer.setOptions({groupBy:'species'});
  expect(shown(viewer)).toBe('#human,a,c,#mouse,b,d,#Ungrouped,e');expect((viewer as any).groupList.map((g:any)=>g.count)).toEqual([2,2,1]);
  await viewer.setSort('name');expect(shown(viewer)).toBe('#human,c,a,#mouse,b,d,#Ungrouped,e');
  viewer.setOptions({groupBy:'clade'});expect(shown(viewer)).toBe('#x,c,a,#y,b,#Ungrouped,d,e');
  viewer.setOptions({groupBy:''});expect(shown(viewer)).toBe('b,d,e,c,a');expect((viewer as any).groupList).toEqual([]);
});
it('groups from an explicit map, which wins over groupBy, and falls back on null',async()=>{
  const viewer=await make();viewer.setOptions({groupBy:'species'});
  viewer.setGroups({a:'one',b:'two',c:'one'});expect(shown(viewer)).toBe('#one,a,c,#two,b,#Ungrouped,d,e');
  viewer.setGroups(null);expect(shown(viewer)).toBe('#human,a,c,#mouse,b,d,#Ungrouped,e');
  expect(()=>viewer.setGroups([] as any)).toThrow(/object/);
});
it('collapses groups, keeps virtual positions consistent and drops empty groups',async()=>{
  const viewer=await make();viewer.setOptions({groupBy:'species'});
  viewer.toggleGroup('mouse');expect(shown(viewer)).toBe('#human,a,c,#mouse,#Ungrouped,e');expect(viewer.getState().collapsedGroups).toEqual(['mouse']);
  expect((viewer as any).groupList[1]).toMatchObject({name:'mouse',count:2,collapsed:true});
  const spacer=viewer.element.querySelector<HTMLElement>('.ak-spacer')!;expect(spacer.style.height).toBe(6*36+'px');
  const rowPos=(viewer as any).rowPos as Int32Array;expect([...rowPos]).toEqual([1,-1,2,-1,5]);
  viewer.toggleGroup('mouse');expect(shown(viewer)).toBe('#human,a,c,#mouse,b,d,#Ungrouped,e');expect(spacer.style.height).toBe(8*36+'px');
  viewer.toggleGroup('human',true);viewer.toggleGroup('human',true);expect(viewer.getState().collapsedGroups).toEqual(['human']);
  viewer.setFilter('beta');expect(shown(viewer)).toBe('#mouse,d');
});
it('restores hidden rows, manual order and collapsed groups through state',async()=>{
  const viewer=await make();viewer.setOptions({groupBy:'species'});viewer.moveRow('d',0);viewer.hideRows(['a']);viewer.toggleGroup('mouse');
  const state=structuredClone(viewer.getState());viewer.showRows();viewer.toggleGroup('mouse');await viewer.setSort('input');
  await viewer.setState(state);expect(viewer.getState()).toMatchObject({sort:'manual',hiddenRowIds:['a'],collapsedGroups:['mouse']});expect(shown(viewer)).toBe('#human,c,#mouse,#Ungrouped,e');
  await viewer.setState({...state,hiddenRowIds:undefined,manualOrder:undefined,collapsedGroups:undefined,sort:'input'} as any);expect(viewer.getState()).toMatchObject({hiddenRowIds:[],manualOrder:null,collapsedGroups:[]});
});
it('orders rows by tree, warns about unmatched leaves and rows, and removes the tree',async()=>{
  const viewer=await make();await expect(viewer.setSort('tree')).rejects.toThrow(/setTree/);
  viewer.setTree('((Beta,c)0.9:1,(a,ghost):1,Gamma);');
  expect(viewer.getState().sort).toBe('tree');expect(shown(viewer)).toBe('d,c,a,e,b');
  const message=viewer.element.querySelector('.ak-message')!;expect(message.textContent).toContain('1 tree leaves match no sequence (ghost)');expect(message.textContent).toContain('1 sequences have no leaf');
  expect(viewer.element.querySelector<HTMLElement>('.ak-tree-canvas')!.hidden).toBe(false);expect((viewer as any).gutter).toBe(120+230);
  viewer.hideRows(['c']);expect(shown(viewer)).toBe('d,a,e,b');
  await viewer.setSort('name');expect(shown(viewer)).toBe('b,d,e,a');
  viewer.setTree(null);expect(viewer.element.querySelector<HTMLElement>('.ak-tree-canvas')!.hidden).toBe(true);expect((viewer as any).gutter).toBe(230);
  viewer.setTree('(a,b);');viewer.setTree(null);expect(viewer.getState().sort).toBe('input');
  expect(()=>viewer.setTree('(a,b')).toThrow(/Invalid Newick/);
});
it('sizes the tree column from treeWidth and the tree visibility switch',async()=>{
  const viewer=await make();viewer.setTree('(a,b,c,d,e);');
  viewer.setOptions({treeWidth:60});expect((viewer as any).gutter).toBe(290);
  viewer.setOptions({treeWidth:0});expect((viewer as any).gutter).toBe(230);expect(viewer.element.querySelector<HTMLElement>('.ak-tree-canvas')!.hidden).toBe(true);
  viewer.setOptions({treeWidth:999});expect((viewer as any).gutter).toBe(230+400);
  viewer.setOptions({visibility:{tree:false}});expect((viewer as any).gutter).toBe(230);expect(viewer.element.querySelector<HTMLElement>('.ak-tree-canvas')!.hidden).toBe(true);
});
it('selects the visible leaf rows under an internal node',async()=>{
  const viewer=await make();viewer.setTree('((Beta,c)0.9,(a,Gamma));');const tree=(viewer as any).tree,layout=tree.layout;
  const inner=layout.nodes.findIndex((n:any,k:number)=>k>0&&n.children.length&&layout.nodes[layout.kids[k][0]].name==='Beta');
  viewer.hideRows(['c']);(viewer as any).selectClade(inner);expect(viewer.getSelectedRowIds()).toEqual(['d']);
  viewer.showRows();(viewer as any).selectClade(inner);expect(viewer.getSelectedRowIds().sort()).toEqual(['c','d']);
  (viewer as any).selectClade(0,true);expect(viewer.getSelectedRowIds().sort()).toEqual(['a','c','d','e']);
});
it('keeps the tree through removeRows and re-matches its leaves',async()=>{
  const viewer=await make();viewer.setTree('((Beta,c),(a,Gamma),b);');await viewer.removeRows(['a']);
  expect(viewer.getState().sort).toBe('tree');expect(shown(viewer)).toBe('d,c,e,b');expect(viewer.element.querySelector('.ak-message')!.textContent).toContain('1 tree leaves match no sequence (a)');
});
it('leaves the pinned reference out of clade selection',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());viewer.setTree('((a,b),(c,d),e);');
  const layout=(viewer as any).tree.layout,node=layout.nodes.findIndex((n:any,k:number)=>k>0&&n.children.length&&layout.nodes[layout.kids[k][0]].name==='a');
  (viewer as any).selectClade(node);expect(viewer.getSelectedRowIds()).toEqual(['b']);
});
it('omits manual order from links; carries tree order and skips tree when none is loaded orders in links and skips tree when none is loaded',async()=>{
  expect(decodeViewLink('sort=tree')).toEqual({sort:'tree'});expect(decodeViewLink('sort=manual').ignored).toEqual(['sort']);expect(decodeViewLink('sort=bogus').ignored).toEqual(['sort']);
  const viewer=await make();expect(await viewer.applyViewLink('sort=tree')).toContain('sort');expect(viewer.getState().sort).toBe('input');
  viewer.moveRow('e',0);expect(encodeViewLink(viewer.getState())).not.toContain('sort');viewer.setTree('(e,d,c,b,a);');expect(encodeViewLink(viewer.getState())).toContain('sort=tree');expect(await viewer.applyViewLink('sort=tree')).not.toContain('sort');expect(shown(viewer)).toBe('e,d,c,b,a');
});
it('leaves the pinned reference out of groups and the tree order',async()=>{
  const viewer=createViewer(host(),{worker:false});disposers.push(()=>viewer.destroy());await viewer.setAlignment(data());
  viewer.setOptions({groupBy:'species'});expect(shown(viewer)).toBe('#human,c,#mouse,b,d,#Ungrouped,e');expect((viewer as any).groupList[0].count).toBe(1);
  viewer.setTree('(e,d,c,b,a);');viewer.setOptions({groupBy:''});expect(shown(viewer)).toBe('e,d,c,b');
});
it('moves a row from the keyboard with Alt and the arrows',async()=>{
  const viewer=await make();const labels=viewer.element.querySelector('.ak-labels')!;
  const button=document.createElement('button');button.dataset.row='b';labels.append(button);
  button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));expect(viewer.getRowOrder()).toEqual(['a','c','b','d','e']);
  button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true}));expect(viewer.getRowOrder()).toEqual(['a','b','c','d','e']);
  viewer.setOptions({visibility:{rowReordering:false}});button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));expect(viewer.getRowOrder()).toEqual(['a','b','c','d','e']);
});
