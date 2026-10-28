import { type ViewState } from '../types';
import { createAlignment } from '../model';
import { $ } from '../controls';
import { type Core, bounded } from './core';
const groupColors=['#2463a6','#3a8a5f','#b5651d','#8a4fa3','#c0392b','#2a9d8f','#9c8a1d','#5c6bc0'];
/** Every row index in the current sort order, ignoring filters, hiding, grouping and pinning. */
export function orderAll(v:Core):number[] {
  const a=v.a;if(!a)return [];const order=a.rows.map((_,i)=>i),late=1e9;
  if(v.sort==='name')order.sort((x,y)=>a.rows[x].name.localeCompare(a.rows[y].name)||x-y);
  if(v.sort==='identity'&&v.identities)order.sort((x,y)=>v.identities![y]-v.identities![x]||x-y);
  if(v.sort==='manual'&&v.manualOrder){const pos=new Map(v.manualOrder.map((id,i)=>[id,i])),at=(i:number)=>pos.get(a.rows[i].id)??late+i;order.sort((x,y)=>at(x)-at(y));}
  if(v.sort==='tree'&&v.tree){const pos=v.tree.treePos,at=(i:number)=>pos[i]>=0?pos[i]:late+i;order.sort((x,y)=>at(x)-at(y));}
  return order;
}
export function groupName(v:Core, row:number):string|null {
  const r=v.a!.rows[row];if(v.groupMap)return v.groupMap.get(r.id)||'Ungrouped';if(!v.groupBy)return null;
  const value=v.groupBy==='species'?r.species:r.metadata?.[v.groupBy];return value===undefined||value===null||value===''?'Ungrouped':String(value);
}
export function rebuildRows(v:Core):void {
  if(!v.a)return;const a=v.a,q=v.query.trim().toLocaleLowerCase(),all=v.orderAll();
  v.filteredRows=all.filter(i=>!v.hidden.has(a.rows[i].id)&&(!q||`${a.rows[i].name} ${a.rows[i].species??''}`.toLocaleLowerCase().includes(q)));
  const shown=v.filteredRows.filter(i=>!v.pinned||i!==v.reference);
  v.groupList=[];v.rowGroup=new Int32Array(a.rows.length).fill(-1);
  if(!v.groupMap&&!v.groupBy)v.rows=shown;
  else {
    // Names come from every row so a group keeps its color while filters change; Ungrouped sorts last.
    const names=[...new Set(all.map(i=>v.groupName(i)!))].sort((x,y)=>(x==='Ungrouped'?1:0)-(y==='Ungrouped'?1:0)||x.localeCompare(y));
    const buckets=new Map<string,number[]>();for(const i of shown){const name=v.groupName(i)!,list=buckets.get(name);if(list)list.push(i);else buckets.set(name,[i]);}
    v.rows=[];
    names.forEach((name,n)=>{
      const list=buckets.get(name);if(!list)return;
      const group={name,count:list.length,color:groupColors[n%groupColors.length],collapsed:v.collapsed.has(name)};v.groupList.push(group);v.rows.push(-v.groupList.length);
      if(!group.collapsed)for(const i of list){v.rows.push(i);v.rowGroup[i]=v.groupList.length-1;}
    });
  }
  v.rowPos=new Int32Array(a.rows.length).fill(-1);v.rows.forEach((row,p)=>{if(row>=0)v.rowPos[row]=p;});
  v.noteTreeGroups();v.labelKey='';v.layout();
  if(v.searchState&&!v.searchBusy)v.runSearch(v.searchState.pattern,v.searchState.options,true).catch(error=>v.error(error));
}
export function rowsChanged(v:Core):void {v.rebuildRows();v.inspectorDirty=true;if(v.options.statisticsScope==='filtered')void v.updateStats().catch(()=>{});v.emit('state',v.getState());}
export function setFilter(v:Core, query:string):void {v.assertAlive();v.query=query;v.scroll.scrollTop=0;v.rebuildRows();$<HTMLInputElement>(v.root,'[aria-label="Filter sequences"]').value=query;if(v.options.statisticsScope==='filtered')void v.updateStats().catch(()=>{});v.emit('state',v.getState());}
export async function setSort(v:Core, sort:ViewState['sort']):Promise<void> {
  v.assertAlive();if(!['input','name','identity','manual','tree'].includes(sort))throw new Error('Unknown sequence order.');
  if(sort==='tree'&&!v.tree)throw new Error('Load a tree with setTree before ordering by tree.');
  if(sort==='manual'&&!v.manualOrder&&v.a)v.manualOrder=v.orderAll().map(i=>v.a!.rows[i].id);
  v.sort=sort;$<HTMLSelectElement>(v.root,'[aria-label="Sequence order"]').value=sort;
  if(sort==='identity'&&v.a) {
    const a=v.a,ref=v.reference;v.message('Comparing sequences with the reference…');
    try{const results=await v.ranking.identities(a,ref,a.rows.map((_,i)=>i));if(v.disposed)return;if(v.a!==a||v.reference!==ref||v.sort!==sort){v.message('');return;}v.identityDetails=results;v.inspectorDirty=true;v.identities=results.map(r=>r.identity??-1);v.message('');}catch(error){v.error(error);return;}
  }
  v.rebuildRows();v.emit('state',v.getState());
}
export function rowIndexes(v:Core, ids:string[]):number[] {
  const a=v.a;if(!a)throw new Error('No alignment is loaded.');
  return ids.map(id=>{const i=a.rows.findIndex(r=>r.id===id);if(i<0)throw new Error(`Unknown sequence ID “${id}”.`);return i;});
}
export function hideRows(v:Core, ids:string[]):void {v.assertAlive();for(const i of v.rowIndexes(ids))v.hidden.add(v.a!.rows[i].id);v.rowsChanged();}
export function showRows(v:Core, ids?:string[]):void {v.assertAlive();if(ids)for(const id of ids)v.hidden.delete(id);else v.hidden.clear();v.rowsChanged();}
export function getRowOrder(v:Core):string[] {v.assertAlive();return v.orderAll().map(i=>v.a!.rows[i].id);}
export function moveRow(v:Core, id:string,index:number):void {
  v.assertAlive();if(!Number.isInteger(index))throw new Error('Row index must be an integer.');
  v.rowIndexes([id]);const order=v.getRowOrder().filter(x=>x!==id);order.splice(bounded(index,0,order.length),0,id);
  v.manualOrder=order;v.sort='manual';$<HTMLSelectElement>(v.root,'[aria-label="Sequence order"]').value='manual';v.rebuildRows();v.emit('state',v.getState());
}
export async function removeRows(v:Core, ids:string[]):Promise<void> {
  v.assertAlive();const a=v.a;v.rowIndexes(ids);const drop=new Set(ids);
  if(!drop.size)return;if(drop.size>=a!.rows.length)throw new Error('At least one sequence must remain.');
  const next=createAlignment(a!.rows.filter(r=>!drop.has(r.id)),{name:a!.name,alphabet:a!.alphabet,metadata:a!.metadata,annotations:a!.annotations.filter(x=>!x.rowId||!drop.has(x.rowId))});
  const filter=v.annotationFilter,selected=v.selection?.rowId;
  await v.replace(next,{reference:a!.rows[v.reference].id,selection:selected&&drop.has(selected)?null:v.selection,selectedRows:[...v.selectedRows],query:v.query,sort:v.sort==='identity'?'input':v.sort,hidden:[...v.hidden],manualOrder:v.manualOrder,collapsed:[...v.collapsed],groupMap:v.groupMap,tree:v.tree?.layout,annotationFilter:{...filter,hiddenRowIds:filter.hiddenRowIds?.filter(id=>!drop.has(id))},hiddenColumns:v.manualHidden,strands:[...v.rowStrands].filter(id=>!drop.has(id))});
  if(v.a===next&&v.tree?.note)v.message(v.tree.note);
}
export function setGroups(v:Core, groups:Record<string,string>|null):void {
  v.assertAlive();if(groups!==null&&(typeof groups!=='object'||Array.isArray(groups)))throw new Error('Groups must be an object of row ID to group name, or null.');
  v.groupMap=groups?new Map(Object.entries(groups).map(([id,name])=>[id,String(name)])):null;v.rebuildRows();v.emit('state',v.getState());
}
export function toggleGroup(v:Core, name:string,collapsed?:boolean):void {
  v.assertAlive();if(collapsed??!v.collapsed.has(name))v.collapsed.add(name);else v.collapsed.delete(name);
  v.rebuildRows();v.emit('state',v.getState());
}
export function stepRow(v:Core, index:number,step:number):number|undefined {for(let i=index+step;i>=0&&i<v.rows.length;i+=step)if(v.rows[i]>=0)return v.rows[i];return undefined;}
