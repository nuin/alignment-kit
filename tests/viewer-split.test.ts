// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {createViewer,AlignmentViewer} from '../src/viewer';
import * as entry from '../src/index';
import {parseAlignment} from '../src/parsers';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const sources=()=>['src/viewer.ts',...readdirSync('src/viewer').map(f=>`src/viewer/${f}`)];
const publicMethods=['addAnnotations','addTrack','applyViewLink','clear','clearSearch','copySelection','destroy','findMotif','getAlignment','getColumnMask','getConsensus','getDetectedAlphabet','getRowOrder','getSearchHits','getSelectedRowIds','getSelectionText','getState','getStatistics','getTracks','getViewLink','getVisibility','goToResidue','hideColumns','hideRows','importAnnotations','load','loadUrl','moveRow','on','removeAnnotations','removeRows','removeTrack','search','setAlignment','setAnnotationFilter','setFilter','setGroups','setOptions','setReference','setSelection','setSort','setState','setTree','showColumns','showRows','toggleGroup'];
it('keeps the AlignmentViewer public methods and the index export',()=>{
  expect(entry.AlignmentViewer).toBe(AlignmentViewer);expect(entry.createViewer).toBe(createViewer);
  const own=Object.getOwnPropertyNames(AlignmentViewer.prototype).filter(n=>n!=='constructor'&&!Object.getOwnPropertyDescriptor(AlignmentViewer.prototype,n)!.get);
  for(const name of publicMethods)expect(own,name).toContain(name);
});
it('keeps every viewer source file under 400 lines',()=>{
  for(const file of sources())expect(readFileSync(file,'utf8').split('\n').length,file).toBeLessThan(400);
});
it('builds viewer markup without innerHTML',()=>{
  for(const file of sources())expect(readFileSync(file,'utf8'),file).not.toMatch(/innerHTML|insertAdjacentHTML/);
});
it('draws the comparison table from text nodes so sequence names stay literal',async()=>{
  const el=host(),viewer=createViewer(el,{worker:false});disposers.push(()=>viewer.destroy());const internal=viewer as any;
  const name='<img src=x onerror=alert(1)>';
  await viewer.setAlignment(parseAlignment(`>${name}\nACGT\n>b&c\nACGA\n>c\n----`,{alphabet:'dna'}));
  const target=document.createElement('div');target.className='ak-identity-result';el.querySelector('.ak-inspector-content')!.append(target);
  internal.tab='compare';internal.selectedRows.add('seq-1');internal.selectedRows.add('seq-2');internal.selectedRows.add('seq-3');
  await internal.action('compare');
  expect(target.querySelector('img')).toBeNull();
  const heads=[...target.querySelectorAll('thead th')].map(c=>c.textContent);
  expect(heads).toEqual(['Sequence',name,'b&c','c']);
  const rows=[...target.querySelectorAll('tbody tr')].map(r=>[...r.children].map(c=>c.textContent));
  expect(rows[0]).toEqual([name,'100.0%','75.0%','NA']);
  expect(rows[1]).toEqual(['b&c','75.0%','100.0%','NA']);
  expect(target.querySelector('caption')!.textContent).toBe('Identity over canonical comparable positions');
  expect(target.querySelector('td')!.title).toBe('4 matches / 4 compared');
  expect(target.firstElementChild!.className).toBe('ak-matrix-scroll');
});
