import { type Alphabet, type RulerCoordinates, type SortKey, type ColorMode } from '../types';
import { $ } from '../controls';

import type { Core, On } from './core';
export function bindForms(v:Core,on:On):void {
  on(v.root,'change',(event:Event)=>{
    const target=event.target as HTMLInputElement,aria=target.getAttribute('aria-label');
    if(target.dataset.selectRow){if(target.checked)v.selectedRows.add(target.dataset.selectRow);else v.selectedRows.delete(target.dataset.selectRow);v.inspectorDirty=true;v.labelKey='';v.schedule();}
    if(aria==='Alignment file'&&target.files?.[0]){const file=target.files[0];void v.openFile(file);target.value='';}
    if(aria==='Color scheme')v.setOptions({colorScheme:target.value});
    if(aria==='Residues to color')v.setOptions({colorMode:target.value as ColorMode});
    if(aria==='Statistics scope')v.setOptions({statisticsScope:target.value as 'all'|'filtered'});
    if(aria==='Minimum identity to reference')v.setOptions({minIdentity:Number(target.value)||0});
    if(aria==='Minimum coverage')v.setOptions({minCoverage:Number(target.value)||0});
    if(aria==='Dots for matches')v.setOptions({matchDisplay:target.checked?'dot':'letter'});
    if(aria==='Ruler coordinates'){v.setOptions({rulerCoordinates:target.value as RulerCoordinates});v.emit('state',v.getState());}
    if(aria==='Reverse complement')v.setReverseComplement(target.checked);
    if(aria==='Show frequency logo')v.setOptions({showLogo:target.checked});
    if(aria==='Sequence order')v.setSort(target.value as SortKey).catch(error=>{v.error(error);$<HTMLSelectElement>(v.root,'[aria-label="Sequence order"]').value=v.sort;v.menus.sync();});
    if(aria==='Export alignment'){if(target.value==='fasta-options')v.fastaPanel(true);else void v.export(target.value);target.value='';}
    if(aria==='FASTA gaps')v.setOptions({fasta:{gaps:target.value as 'keep'|'remove'}});
    if(aria==='FASTA letter case')v.setOptions({fasta:{letterCase:target.value as 'original'|'upper'|'lower'}});
    if(aria==='FASTA line width')v.setOptions({fasta:{lineWidth:Number(target.value)}});
    if(aria==='FASTA header')v.setOptions({fasta:{header:target.value as 'name'|'name-species'|'id-name'}});
    if(aria==='Visible columns only')v.setOptions({export:{columns:target.checked?'visible':'all'}});
    if(aria==='FASTA orientation')v.setOptions({fasta:{orientation:target.value as 'source'|'reverse-complement'}});
    if(aria==='Sequence alphabet'&&v.a)v.requestAlphabet(target.value as Alphabet);
    if(aria==='Feature type')v.setAnnotationFilter({...v.annotationFilter,types:target.value?[target.value]:[]});
    if(aria==='Feature consequence')v.setAnnotationFilter({...v.annotationFilter,consequences:target.value?[target.value]:[]});
    if(aria==='Features with disease evidence')v.setAnnotationFilter({...v.annotationFilter,disease:target.checked});
    if(aria==='Features with phenotype evidence')v.setAnnotationFilter({...v.annotationFilter,phenotype:target.checked});
  });
  on(v.root,'input',(event:Event)=>{
    const target=event.target as HTMLInputElement,aria=target.getAttribute('aria-label');
    if(aria==='Consensus threshold')v.setOptions({consensusThreshold:Number(target.value)/100});
    if(aria==='Color threshold')v.setOptions({colorThreshold:Number(target.value)/100});
  });
  on($(v.root,'[aria-label="Filter sequences"]'),'input',(event:Event)=>v.setFilter((event.target as HTMLInputElement).value));
  on($(v.root,'[aria-label="Go to alignment column"]'),'keydown',(event:KeyboardEvent)=>{if(event.key==='Enter'&&v.a){const input=event.target as HTMLInputElement,typed=input.value;if(v.goTo(typed))input.value=typed.trim();}});
  const motif=$<HTMLInputElement>(v.root,'[aria-label="Find motif"]');
  on(motif,'keydown',(event:KeyboardEvent)=>{if(event.key==='Enter')void v.action(event.shiftKey?'motif-prev':'motif');});
  on(motif,'input',()=>{if(!motif.value.trim())v.clearSearch();});
  on($(v.root,'.ak-fasta-options'),'keydown',(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();v.fastaPanel(false);}});
}
