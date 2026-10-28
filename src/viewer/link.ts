import { type ViewerOptions } from '../types';
import { colorSchemes } from '../colors';
import { decodeViewLink, type ViewLink } from '../link';
import { type Core } from './core';
export async function applyViewLink(v:Core, input:ViewLink|string):Promise<string[]> {
  v.assertAlive();if(!v.a)throw new Error('Load an alignment before applying a view link.');
  const link=typeof input==='string'?decodeViewLink(input):input,a=v.a,skipped=[...(link.ignored??[])];
  const options:ViewerOptions={colorMode:link.colorMode??'all',matchDisplay:link.matchDisplay??'letter',statisticsScope:link.statisticsScope??'all',rulerCoordinates:link.rulerCoordinates??'alignment',minIdentity:link.minIdentity??0,minCoverage:link.minCoverage??0};
  if(link.cellWidth!==undefined)options.cellWidth=link.cellWidth;
  if(link.colorScheme){if(colorSchemes(a.alphabet).some(s=>s.id===link.colorScheme))options.colorScheme=link.colorScheme;else skipped.push('scheme');}
  v.setOptions(options);v.setFilter(link.query??'');
  const hide=link.hiddenColumns??[];
  if(hide.some(([,e])=>e>a.width)||hide.length===1&&hide[0][0]===1&&hide[0][1]===a.width){skipped.push('hide');v.manualHidden=[];}else v.manualHidden=hide;
  v.colMap=undefined;v.overviewDirty=true;v.layout();
  if(link.referenceId){if(a.rows.some(r=>r.id===link.referenceId))v.setReference(link.referenceId);else skipped.push('ref');}
  let sort=link.sort??'input';if(sort==='tree'&&!v.tree||sort==='residue'&&(!link.sortColumn||link.sortColumn>a.width)){skipped.push('sort');sort='input';}
  await v.setSort(sort,link.sortColumn);
  if(v.disposed||v.a!==a)return skipped;
  const s=link.selection;
  if(s&&(s.end>a.width||(s.rowId&&!a.rows.some(r=>r.id===s.rowId)))){skipped.push('sel');v.setSelection(null,false);}
  else v.setSelection(s??null,link.start===undefined);
  if((link.start??1)<=a.width)v.scroll.scrollLeft=v.columns.before[(link.start??1)-1]*v.options.cellWidth;else skipped.push('x');
  if((link.rowOffset??0)<Math.max(1,v.rows.length))v.scroll.scrollTop=(link.rowOffset??0)*v.options.rowHeight;else skipped.push('y');
  v.schedule();
  const notes=[link.alignmentId&&link.alignmentId!==a.id?'This link was made for a different version of this alignment.':'',skipped.length?`Skipped link settings: ${skipped.join(', ')}.`:''].filter(Boolean);
  if(notes.length)v.message(notes.join(' '));
  return skipped;
}
export function scheduleLink(v:Core):void {
  if(!v.urlSync||v.pendingLink||!v.a||v.disposed)return;
  clearTimeout(v.linkTimer);
  v.linkTimer=setTimeout(()=>{if(v.disposed||!v.a||v.pendingLink)return;const hash='#'+v.getViewLink();if(hash===location.hash)return;
    try{history.replaceState(history.state,'',location.pathname+location.search+hash);v.lastHash=hash;}
    catch(error){v.urlSync=false;v.error(new Error(`URL sync stopped: ${(error as Error).message}`));}
  },250);
}
