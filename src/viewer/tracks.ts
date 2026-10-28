import { inspectorTabs } from '../visibility';
import { type CustomTrack } from '../types';
import { validateTrack, checkTrackLength, stockholmTracks } from '../tracks';
import { type Core } from './core';
export function selectionRow(v:Core):number {return v.selection?.rowId&&v.a?v.a.rows.findIndex(r=>r.id===v.selection!.rowId):v.pinned?v.reference:-1;}
/** Tracks drawn after the built-in column tracks: Stockholm GC lines, registered tracks whose values fit the alignment, then the GR lines of the selected or reference row, which sit next to the pinned reference row. Same array until an input changes. */
export function drawnTracks(v:Core):CustomTrack[] {
  const a=v.a;if(!a)return [];
  const row=v.selectionRow(),flag=v.visibility.stockholmTracks,d=v.drawn;
  if(d&&d.a===a&&d.row===row&&d.flag===flag&&d.user===v.customTracks)return d.list;
  const st=flag?stockholmTracks(a,row):[],perRow=(t:CustomTrack)=>t.id.startsWith('gr:');
  const list=[...st.filter(t=>!perRow(t)),...v.customTracks.filter(t=>t.values===undefined||t.values.length===a.width),...st.filter(perRow)];
  v.drawn={a,row,flag,user:v.customTracks,list};return list;
}
export function checkTracks(v:Core):void {if(v.a)for(const t of v.customTracks)try{checkTrackLength(t,v.a.width);}catch(error){v.error(error);}}
export function tracksChanged(v:Core):void {v.trackKey='';v.layout();}
export function addTrack(v:Core, track:CustomTrack):void {
  v.assertAlive();
  try{const t=validateTrack(track);if(v.customTracks.some(x=>x.id===t.id))throw new Error(`Track ${t.id}: a track with this id already exists.`);if(v.a)checkTrackLength(t,v.a.width);v.customTracks=[...v.customTracks,t];}catch(error){throw v.error(error);}
  v.tracksChanged();
}
export function removeTrack(v:Core, id:string):void {
  v.assertAlive();
  if(!v.customTracks.some(t=>t.id===id))throw v.error(new Error(`Unknown track: ${id}.`));
  v.customTracks=v.customTracks.filter(t=>t.id!==id);v.trackErrors.delete(id);v.tracksChanged();
}
export function ensureTab(v:Core):void {if(!v.visibility[inspectorTabs[v.tab as keyof typeof inspectorTabs]])v.tab=Object.keys(inspectorTabs).find(key=>v.visibility[inspectorTabs[key as keyof typeof inspectorTabs]])??'';}
