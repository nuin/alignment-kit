import { createViewer, decodeViewLink, defaultVisibility } from '../src/index';
import { syntheticAlignment } from './fixtures';
import datasets from './public/alignments.json';
import { version } from '../package.json';
import type { Alphabet, ViewerVisibility } from '../src/types';
import '../src/fonts.css';import '../src/style.css';import './style.css';
const app=document.querySelector('#app')!;
app.innerHTML=`<header class="site-header"><a class="wordmark" href="/"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="3" width="5" height="6" rx="1" fill="#2463a6"/><rect x="10" y="3" width="16" height="6" rx="1" fill="#adc7df"/><rect x="2" y="11" width="16" height="6" rx="1" fill="#adc7df"/><rect x="21" y="11" width="5" height="6" rx="1" fill="#2463a6"/><rect x="2" y="19" width="5" height="6" rx="1" fill="#2463a6"/><rect x="10" y="19" width="16" height="6" rx="1" fill="#adc7df"/></svg>Alignment Kit<span class="version">${version}</span></a><nav aria-label="Examples"><a href="/" aria-current="page">Explorer</a><a href="/examples/react/">React</a><a href="/examples/svelte/">Svelte</a><a href="/guide/index.html">User guide</a></nav></header>
<main><section class="intro"><div><div class="intro-line"><span class="dataset-tag">Pfam seed alignment</span><span class="local-tag"><i></i> Runs in your browser</span></div><h1>The detail is in the alignment.</h1><p>Explore sequence families, inspect variation, and keep the biological context in view.</p></div><div class="dataset-note"><strong class="dataset-name">CBS domain</strong><span class="dataset-description">PF00571.34 · 838 sequences · 160 columns</span></div></section>
<div class="demo-switcher"><span>Real alignments</span>${datasets.map(d=>`<button type="button" data-demo="${d.id}" aria-pressed="${d.id==='cbs'}" title="${d.collection} · ${d.rows.toLocaleString()} sequences × ${d.columns} columns">${d.label}</button>`).join('')}<button type="button" data-demo="variants">Annotated example</button><span class="demo-separator"></span><span>Synthetic benchmarks</span><button type="button" data-demo="large">10,000 sequences</button><button type="button" data-demo="many">50,000 sequences</button><button type="button" data-demo="wide">10,000 columns</button></div>
<p class="dataset-context" aria-live="polite"></p><details class="demo-customize"><summary>Customize viewer</summary><p>Show or hide components. Your sequences and statistics stay intact.</p><button type="button" class="demo-reset">Restore default view</button><div class="demo-visibility"></div></details><div id="viewer"></div><div class="viewer-caption"><span>Click a residue to inspect. Shift-click selects a region. Drag the overview to navigate.</span><span class="source-caption">Source: Pfam / InterPro</span></div>
<section class="integration" id="integration"><div><h2>One viewer. Your application.</h2><p>A shared rendering engine with JavaScript, React and Svelte APIs. Annotation data stays with its sequence, wherever you scroll.</p><div class="integration-links"><a href="/examples/react/">React example</a><a href="/examples/svelte/">Svelte example</a><a href="/README.md">API reference</a></div></div><pre><code>import { createViewer, defaultVisibility } from '@nuin/msa-canvas';
import '@nuin/msa-canvas/style.css';

const viewer = createViewer(element);
await viewer.load(alignmentText);
viewer.on('selection', selection => {
  // Alignment columns are 1-based and inclusive.
});</code></pre></section></main><footer class="site-footer"><span>Alignment Kit</span><span>Sequence first. Context always.</span><span>JavaScript · React · Svelte</span></footer>`;
const preview=(window as any).__ALIGNMENT_PREVIEW__;
const viewer=createViewer(document.querySelector('#viewer')!,{height:740,showInspector:window.innerWidth>800,workerUrl:preview?.workerUrl,urlSync:!preview});
const customize=document.querySelector<HTMLDetailsElement>('.demo-customize')!;
const groups:Record<string,(keyof ViewerVisibility)[]>={
  'Layout':['toolbar','tools','overview','overviewTitle','tracks','alignment','inspector','inspectorTabs','status','statusSummary','statusDetails','warnings','messages','emptyState'],
  'Main controls':['open','search','colorScheme','zoom','fit','theme','inspectorToggle','textView','fullscreen','export'],
  'Navigation and analysis':['goTo','motif','order','colorMode','logoToggle','statisticsScope','alphabet','variantNav'],
  'Tracks and residues':['ruler','modalFrequency','gapFraction','consensus','logo','entropy','quality','stockholmTracks','variantTrack','reference','residueLetters','annotationMarks','selectionOverlay'],
  'Sequence labels':['labels','rowNames','rowSpecies','rowSelection','rowPinning','rowHiding','rowReordering','tree','labelResize'],
  'Inspector':['positionTab','featuresTab','compareTab','colorsTab','hitsTab','pinReference','rowFeaturesToggle','featureType','featureConsequence','diseaseFilter','phenotypeFilter','featurePagination','calculateIdentity','clearRows'],
};
for(const [title,keys] of Object.entries(groups)){
  const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;fieldset.append(legend);
  for(const key of keys){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.visibility=key;input.checked=viewer.getVisibility()[key];input.addEventListener('change',()=>viewer.setOptions({visibility:{[key]:input.checked}}));label.append(input,key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()));fieldset.append(label);}
  document.querySelector('.demo-visibility')!.append(fieldset);
}
const syncVisibility=()=>{const visibility=viewer.getVisibility();customize.querySelectorAll<HTMLInputElement>('[data-visibility]').forEach(input=>input.checked=visibility[input.dataset.visibility as keyof ViewerVisibility]);};
customize.addEventListener('toggle',syncVisibility);
document.querySelector('.demo-reset')!.addEventListener('click',()=>{viewer.setOptions({visibility:{...defaultVisibility}});syncVisibility();});
// Exposed only by this demo for reproducible integration/performance checks.
Object.assign(window,{alignmentDemo:{viewer,syntheticAlignment}});
let loading=false;
async function load(kind:string) {
  if(loading)return;
  loading=true;
  const buttons=document.querySelectorAll<HTMLButtonElement>('[data-demo]');
  buttons.forEach(button=>button.disabled=true);
  const context=document.querySelector('.dataset-context')!;
  context.textContent='Loading alignment…';
  try {
    const dataset=datasets.find(d=>d.id===kind);
    if(dataset) {
      const options={name:`${dataset.name} · ${dataset.accession}`,alphabet:dataset.alphabet as Alphabet,source:dataset.source};
      if(preview?.datasets?.[kind]) {
        const bytes=Uint8Array.from(atob(preview.datasets[kind]),c=>c.charCodeAt(0));
        await viewer.load(bytes.buffer,options);
      } else await viewer.loadUrl('/'+dataset.file,options);
      document.querySelector('.dataset-name')!.textContent=dataset.name;
      document.querySelector('.dataset-description')!.textContent=`${dataset.accession} · ${dataset.rows.toLocaleString()} sequences · ${dataset.columns.toLocaleString()} columns`;
      document.querySelector('.dataset-tag')!.textContent=dataset.collection;
      context.textContent=dataset.description+' ';
      const source=document.createElement('a');source.href=dataset.page;source.target='_blank';source.rel='noopener noreferrer';source.textContent='View source ↗';context.append(source);
      const download=document.createElement('a');download.textContent='Download alignment ↓';download.download=dataset.file;
      download.href=preview?.datasets?.[kind]?`data:application/octet-stream;base64,${preview.datasets[kind]}`:'/'+dataset.file;
      context.append(' · ',download);
      document.querySelector('.source-caption')!.textContent=`${dataset.collection} · retrieved ${dataset.source.retrieved.slice(0,10)}`;
    } else {
      document.querySelector('.source-caption')!.textContent='Synthetic data · not biological evidence';
      document.querySelector('.dataset-tag')!.textContent='Synthetic fixture';
      const a=kind==='large'?syntheticAlignment(10000,1000):kind==='many'?syntheticAlignment(50000,300):kind==='wide'?syntheticAlignment(1000,10000):syntheticAlignment(18,240,60);
      await viewer.setAlignment(a);document.querySelector('.dataset-name')!.textContent=kind==='variants'?'Annotated example':'Synthetic benchmark';document.querySelector('.dataset-description')!.textContent=`${a.rows.length.toLocaleString()} sequences · ${a.width.toLocaleString()} columns${a.annotations.length?' · '+a.annotations.length+' features':''}`;
      context.textContent='Deterministic synthetic data for exercising viewer behavior. Not biological evidence.';
    }
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.demo===kind)));
  }catch(error){context.textContent=`Could not load alignment: ${(error as Error).message}`;console.error(error);}
  finally{loading=false;buttons.forEach(button=>button.disabled=false);}
}
document.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach(button=>button.onclick=()=>void load(button.dataset.demo!));
// A shared link names its alignment file in src; the viewer restores the rest of the view.
const linked=decodeViewLink(location.hash).source;
void load(datasets.find(d=>linked&&new URL(linked,location.href).pathname==='/'+d.file)?.id??'cbs');
