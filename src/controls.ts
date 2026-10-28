import { colorSchemes } from './colors';
import { escapeXml } from './export';
export function buildShell(root:HTMLElement) {
  root.className='ak-viewer';root.setAttribute('aria-label','Multiple sequence alignment viewer');
  root.innerHTML=`
  <div class="ak-toolbar">
    <button type="button" data-action="open" class="ak-open"><span aria-hidden="true">＋</span> Open alignment</button>
    <input class="ak-file" type="file" accept=".fa,.fasta,.faa,.fna,.aln,.sto,.stockholm,.gz,.txt" hidden aria-label="Alignment file">
    <span class="ak-toolbar-divider"></span>
    <label class="ak-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Find a sequence…" aria-label="Filter sequences"></label>
    <label class="ak-scheme-label">Color <select aria-label="Color scheme">${colorSchemes().map(s=>`<option value="${escapeXml(s.id)}">${escapeXml(s.label)}</option>`).join('')}</select></label>
    <div class="ak-zoom"><button type="button" data-action="zoom-out" aria-label="Zoom out">−</button><output aria-label="Zoom level">16 px</output><button type="button" data-action="zoom-in" aria-label="Zoom in">＋</button></div>
    <button type="button" data-action="fit">Fit</button>
    <button type="button" data-action="theme" aria-label="Toggle theme" title="Toggle light and dark theme">◐</button>
    <button type="button" data-action="inspect" aria-label="Toggle inspector" title="Show or hide inspector">Inspect</button>
    <button type="button" data-action="fullscreen" aria-label="Full screen">⛶</button>
    <select aria-label="Export alignment"><option value="">Export…</option><option value="fasta-all">All rows · FASTA</option><option value="fasta">Selection · FASTA</option><option value="svg">Selection · SVG</option><option value="png">Selection · PNG</option><option value="tsv">Column statistics · TSV</option><option value="state">View state · JSON</option></select>
  </div>
  <div class="ak-tools">
    <label>Go to <input type="number" min="1" value="1" aria-label="Go to alignment column"></label>
    <label class="ak-motif"><input type="search" placeholder="Find a motif…" aria-label="Find literal motif"><button type="button" data-action="motif" aria-label="Find next motif">Find next</button></label>
    <label>Order <select aria-label="Sequence order"><option value="input">As loaded</option><option value="name">Name</option><option value="identity">Identity to reference</option></select></label>
    <select aria-label="Residues to color"><option value="all">All residues</option><option value="reference-differences">Differences to reference</option><option value="reference-matches">Matches to reference</option><option value="consensus-differences">Differences to consensus</option><option value="consensus-matches">Matches to consensus</option></select>
    <label><input type="checkbox" aria-label="Show frequency logo"> Frequency logo</label>
    <label>Stats <select aria-label="Statistics scope"><option value="all">All sequences</option><option value="filtered">Filtered sequences</option></select></label>
    <label>Type <select aria-label="Sequence alphabet"><option value="protein">Protein</option><option value="dna">DNA</option><option value="rna">RNA</option></select></label>
  </div>
  <div class="ak-message" role="status" hidden></div>
  <div class="ak-overview-wrap"><span class="ak-overview-title">Alignment overview<small>Drag to explore</small></span><div class="ak-overview" role="slider" tabindex="0" aria-label="Alignment overview position" aria-valuemin="1" aria-valuemax="1" aria-valuenow="1"><canvas aria-hidden="true"></canvas><div class="ak-overview-window"></div></div></div>
  <div class="ak-workspace">
    <div class="ak-main">
      <div class="ak-tracks"><canvas aria-hidden="true"></canvas><div class="ak-track-labels"><span>Alignment position</span><span title="Most common non-gap symbol / non-gap rows">Modal frequency</span><span title="Gap count / rows">Gap fraction</span><span>Consensus</span><span class="ak-logo-label" hidden>Frequency logo · non-gap</span><button type="button" class="ak-reference-label" data-action="reference-info">Reference</button></div></div>
      <div class="ak-grid"><div class="ak-scroll" tabindex="0" role="grid" aria-label="Alignment residues. Use arrow keys to inspect, Shift and arrows to select, plus and minus to zoom."><div class="ak-spacer"></div></div><canvas class="ak-body-canvas" aria-hidden="true"></canvas><div class="ak-labels"></div><div class="ak-gutter-resize" role="separator" aria-label="Resize sequence labels" aria-orientation="vertical" tabindex="0"></div><div class="ak-empty">Open an aligned FASTA, Stockholm or CLUSTAL file.</div></div>
    </div>
    <aside class="ak-inspector" aria-label="Alignment inspector"><div class="ak-tabs"><button type="button" data-tab="position" aria-pressed="true">Position</button><button type="button" data-tab="annotations">Features</button><button type="button" data-tab="compare">Compare</button><button type="button" data-tab="legend">Colors</button></div><div class="ak-inspector-content"></div></aside>
  </div>
  <footer class="ak-status"><span class="ak-status-main">No alignment loaded</span><span class="ak-status-detail"></span></footer>
  <div class="ak-live ak-sr-only" aria-live="polite"></div>`;
}
export function download(content:string|Blob,name:string,type='text/plain') {
  const blob=typeof content==='string'?new Blob([content],{type}):content,url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const $ = <T extends Element=HTMLElement>(root:ParentNode,selector:string)=>root.querySelector<T>(selector)!;
