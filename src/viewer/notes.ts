import { type AnnotationFilter, type Annotation, type AnnotationImportOptions, type AnnotationImportResult } from '../types';
import { importAnnotations as parseAnnotations } from '../annotation-import';
import { AnnotationIndex, filterAnnotations } from '../annotations';
import { type Core } from './core';
export function setAnnotationFilter(v:Core, filter:AnnotationFilter):void {v.assertAlive();v.annotationFilter={...filter};v.featurePage=0;v.rebuildAnnotations();v.inspectorDirty=true;v.schedule();}
export function addAnnotations(v:Core, list:Annotation[]):void {
  v.assertAlive();if(!v.a)throw new Error('Load an alignment before adding annotations.');
  const ids=new Set(v.a.annotations.map(a=>a.id)),rows=new Set(v.a.rows.map(r=>r.id));
  for(const a of list){
    if(ids.has(a.id))throw new Error(`Duplicate annotation ID “${a.id}”.`);ids.add(a.id);
    if(a.rowId&&!rows.has(a.rowId))throw new Error(`Annotation “${a.id}” refers to unknown sequence “${a.rowId}”.`);
    if(a.mapping==='mapped'&&(!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start!<1||a.end!<a.start!||a.end!>v.a.width))throw new Error(`Annotation “${a.id}” has invalid alignment coordinates.`);
  }
  v.a.annotations=[...v.a.annotations,...list.map(a=>({...a}))];v.refreshAnnotations();
}
export function removeAnnotations(v:Core, ids?:string[]):void {
  v.assertAlive();if(!v.a)return;const drop=ids&&new Set(ids);
  v.a.annotations=drop?v.a.annotations.filter(a=>!drop.has(a.id)):[];v.refreshAnnotations();
}
export function importAnnotations(v:Core, text:string,options:AnnotationImportOptions={}):AnnotationImportResult {
  v.assertAlive();if(!v.a)throw new Error('Load an alignment before importing annotations.');
  const result=parseAnnotations(v.a,text,options);v.addAnnotations(result.annotations);
  const mapped=result.annotations.filter(a=>a.mapping==='mapped').length;
  v.message(`Imported ${result.annotations.length} annotations (${mapped} mapped).${result.warnings.length?` ${result.warnings.length} warnings: ${result.warnings.slice(0,3).join(' ')}${result.warnings.length>3?' …':''}`:''}`);
  return result;
}
export function refreshAnnotations(v:Core):void {v.rebuildAnnotations();if(v.sort==='annotations'){v.rebuildRows();v.emit('state',v.getState());}v.featurePage=Math.min(v.featurePage,Math.max(0,Math.ceil(v.filteredAnnotations.visible.length/30)-1));v.inspectorDirty=true;v.overviewDirty=true;v.schedule();}
export function rebuildAnnotations(v:Core):void {v.filteredAnnotations=filterAnnotations(v.a?.annotations??[],v.annotationFilter);v.annotationIndex=new AnnotationIndex(v.filteredAnnotations.visible);}
