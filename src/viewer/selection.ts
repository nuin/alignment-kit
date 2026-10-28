import { type Selection } from '../types';
import { columnToResidue, residueToColumn } from '../model';
import { $ } from '../controls';
import { type Core } from './core';
export function setReference(v:Core, id:string):void {
  v.assertAlive();if(!v.a)return;const row=v.a.rows.findIndex(r=>r.id===id);if(row<0)throw new Error('Unknown reference sequence.');
  v.reference=row;v.identities=undefined;v.identityDetails=undefined;v.rebuildRows();v.inspectorDirty=true;v.schedule();if(v.sort==='identity')void v.setSort('identity');v.emit('state',v.getState());
}
export function setSelection(v:Core, selection:Selection|null,scrollIntoView=true,keepTab=false):void {
  v.assertAlive();if(!v.a)return;
  if(selection&&(!Number.isInteger(selection.start)||!Number.isInteger(selection.end)||selection.start<1||selection.end<selection.start||selection.end>v.a.width||(selection.rowId&&!v.a.rows.some(r=>r.id===selection.rowId))))throw new Error('Invalid selection coordinates or row ID.');
  const before=v.drawnTracks();
  v.selection=selection?{...selection}:null;if(v.drawnTracks()!==before)v.layout();if(!keepTab)v.tab='position';v.ensureTab();v.inspectorDirty=true;
  if(selection){$<HTMLInputElement>(v.root,'[aria-label="Go to alignment column"]').value=v.goToText(selection.start);if(scrollIntoView)v.reveal(selection);$(v.root,'.ak-live').textContent=`Column ${selection.start}${selection.end!==selection.start?` through ${selection.end}`:''}${selection.rowId?`, ${v.a.rows.find(r=>r.id===selection.rowId)?.name}`:''}`;}
  v.schedule();v.emit('selection',v.selection);v.emit('state',v.getState());
}
export function goToText(v:Core, column:number):string {
  if(v.options.rulerCoordinates!=='reference'||!v.a)return String(column);
  return String(columnToResidue(v.a,v.reference,column)??'');
}
export function goToResidue(v:Core, rowId:string,position:number):boolean {
  v.assertAlive();if(!v.a)return false;
  const row=v.a.rows.findIndex(r=>r.id===rowId);
  if(row<0){v.message(`No sequence with ID ${rowId}.`);return false;}
  const column=Number.isInteger(position)?residueToColumn(v.a,row,position):null;
  if(column===null){v.message(`${v.a.rows[row].name} has no residue ${position}.`);return false;}
  if(v.columnHidden(column))return false;
  v.setSelection({start:column,end:column,rowId});return true;
}
export function goTo(v:Core, input:string):boolean {
  const a=v.a;if(!a)return false;const text=input.trim(),plain=/^\d+$/.test(text),split=text.lastIndexOf(':');
  if(plain){
    const n=Number(text);
    if(v.options.rulerCoordinates==='reference'){
      const column=residueToColumn(a,v.reference,n);
      if(column===null){v.message(`${a.rows[v.reference].name} has no residue ${n}.`);return false;}
      if(v.columnHidden(column))return false;
      v.setSelection({start:column,end:column});return true;
    }
    if(n>=1&&n<=a.width){if(v.columnHidden(n))return false;v.setSelection({start:n,end:n});return true;}
    v.message(`Enter a column from 1 to ${a.width}.`);return false;
  }
  const key=text.slice(0,split).trim(),number=text.slice(split+1).trim();
  if(split>0&&/^\d+$/.test(number)){
    const row=a.rows.find(r=>r.id===key)??a.rows.find(r=>r.name===key);
    if(!row){v.message(`No sequence named ${key}.`);return false;}
    return v.goToResidue(row.id,Number(number));
  }
  v.message('Enter a number or row:residue, for example 123 or seq-1:45.');return false;
}
export function reveal(v:Core, s:Selection):void {
  const available=v.scroll.clientWidth-v.gutter,x=v.columns.before[s.start-1]*v.options.cellWidth;
  if(x<v.scroll.scrollLeft||x+v.options.cellWidth>v.scroll.scrollLeft+available)v.scroll.scrollLeft=Math.max(0,x-available/2);
  if(s.rowId&&v.a){const r=v.a.rows.findIndex(x=>x.id===s.rowId),index=r<0?-1:v.rowPos[r],y=index*v.options.rowHeight;if(index>=0&&(y<v.scroll.scrollTop||y+v.options.rowHeight>v.scroll.scrollTop+v.scroll.clientHeight))v.scroll.scrollTop=y;}
}
/** The display item under a pointer in the grid: a row index, a negative group header, or undefined. */
export function itemAt(v:Core, event:MouseEvent):number|undefined {
  if(!v.a)return undefined;const rect=v.scroll.getBoundingClientRect();
  if(event.clientX-rect.left-v.gutter<0)return undefined;return v.rows[Math.floor((event.clientY-rect.top+v.scroll.scrollTop)/v.options.rowHeight)];
}
export function eventAt(v:Core, event:MouseEvent):Selection|null {
  const item=v.itemAt(event);if(!v.a||item===undefined||item<0)return null;
  const d=Math.floor((event.clientX-v.scroll.getBoundingClientRect().left-v.gutter+v.scroll.scrollLeft)/v.options.cellWidth);
  return d<0||d>=v.columns.count?null:{start:v.columns.cols[d]+1,end:v.columns.cols[d]+1,rowId:v.a.rows[item].id};
}
