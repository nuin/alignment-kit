import { colorSchemes } from './colors';
import { escapeXml } from './export';
let viewerId=0;
export function buildShell(root:HTMLElement) {
  const n=++viewerId,activeCellId=`ak-cell-${n}`;
  const icon=(path:string)=>`<svg class="ak-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${path}</svg>`;
  const tab=(id:string,label:string,on=false)=>`<button type="button" role="tab" id="ak-tab-${n}-${id}" data-tab="${id}" aria-selected="${on}" aria-controls="ak-panel-${n}" tabindex="${on?0:-1}">${label}</button>`;
  root.className='ak-viewer';root.setAttribute('aria-label','Multiple sequence alignment viewer');
  root.innerHTML=`
  <div class="ak-toolbar">
    <button type="button" data-action="open" class="ak-open">${icon('<path d="M8 3v10M3 8h10"/>')} Open alignment</button>
    <input class="ak-file" type="file" accept=".fa,.fasta,.faa,.fna,.aln,.sto,.stockholm,.phy,.phylip,.nex,.nexus,.nxs,.msf,.pir,.gz,.txt,.gff,.gff3,.bed,.gb,.gbk,.genbank,.embl,.json" hidden aria-label="Alignment file">
    <span class="ak-toolbar-divider"></span>
    <label class="ak-search">${icon('<circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25 13.5 13.5"/>')}<input type="search" placeholder="Find a sequence…" aria-label="Filter sequences"></label>
    <label class="ak-scheme-label">Color <select aria-label="Color scheme">${colorSchemes().map(s=>`<option value="${escapeXml(s.id)}">${escapeXml(s.label)}</option>`).join('')}</select></label>
    <div class="ak-zoom"><button type="button" data-action="zoom-out" aria-label="Zoom out" data-hint="Zoom out">−</button><output aria-label="Zoom level">16 px</output><button type="button" data-action="zoom-in" aria-label="Zoom in" data-hint="Zoom in">+</button></div>
    <button type="button" data-action="fit">Fit</button>
    <button type="button" class="ak-icon-button" data-action="theme" aria-label="Dark theme" aria-pressed="false" data-hint="Dark theme on or off">${icon('<circle cx="8" cy="8" r="5.25"/><path d="M8 2.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" stroke="none"/>')}</button>
    <button type="button" data-action="inspect" aria-pressed="true" title="Show or hide the inspector">Inspector</button>
    <button type="button" data-action="text-view" aria-pressed="false" title="Show the alignment as plain text blocks">Text</button>
    <button type="button" data-action="tree" aria-pressed="false" title="Show or hide the tree beside the names. With no tree loaded, builds a neighbor-joining guide tree from p-distances">Tree</button>
    <button type="button" data-action="tree-view" aria-pressed="false" data-empty="true" hidden title="Open or close the full-size tree with the residue of one column beside each sequence">Tree view</button>
    <button type="button" class="ak-fullscreen" data-action="fullscreen" aria-pressed="false" title="Fill the screen with the viewer (F)">${icon('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>')}<span>Full screen</span></button>
    <select aria-label="Export alignment"><option value="">Export…</option><option value="fasta-all">All rows · FASTA</option><option value="fasta">Selection · FASTA</option><option value="fasta-visible">Visible columns · FASTA</option><option value="clustal-all">All rows · CLUSTAL</option><option value="clustal">Selection · CLUSTAL</option><option value="stockholm-all">All rows · Stockholm</option><option value="stockholm">Selection · Stockholm</option><option value="phylip-all">All rows · PHYLIP</option><option value="phylip">Selection · PHYLIP</option><option value="nexus-all">All rows · NEXUS</option><option value="nexus">Selection · NEXUS</option><option value="svg">Selection · SVG</option><option value="png">Selection · PNG</option><option value="consensus">Consensus · FASTA</option><option value="tsv">Column statistics · TSV</option><option value="variants">Variable columns (selected block or all) · TSV</option><option value="annotations-gff3">Annotations · GFF3</option><option value="annotations-tsv">Annotations · TSV</option><option value="annotations-json">Annotations · JSON</option><option value="state">View state · JSON</option><option value="fasta-options">FASTA options…</option></select>
    <label class="ak-export-columns" title="Applies to every export and to copy"><input type="checkbox" aria-label="Visible columns only"> Visible columns only</label>
  </div>
  <div class="ak-tools">
    <div class="ak-toolgroup" role="group" aria-label="Navigate">
      <label>Go to <input type="text" value="1" aria-label="Go to alignment column" title="A column, a reference residue number in reference ruler mode, or row:residue" placeholder="123 or row:45"></label>
      <label class="ak-motif"><input type="search" placeholder="Find a motif…" aria-label="Find motif" title="Letters with IUPAC codes, /regex/, or PROSITE such as N-{P}-[ST]-{P}"><button type="button" data-action="motif-prev" aria-label="Find previous motif">Previous</button><button type="button" data-action="motif" aria-label="Find next motif">Find next</button></label>
      <span class="ak-variant-nav" role="group" aria-label="Variant navigation" data-empty="true" hidden><button type="button" data-action="variant-prev" aria-label="Previous variant" title="Previous variant ([)">‹ Variant</button><output aria-label="Current variant">– / 0</output><button type="button" data-action="variant-next" aria-label="Next variant" title="Next variant (])">Variant ›</button></span>
    </div>
    <div class="ak-toolgroup" role="group" aria-label="Rows">
      <label>Order <select aria-label="Sequence order"><option value="input">As loaded</option><option value="name">Name</option><option value="identity">Identity to reference</option><option value="gaps">Fewest gaps</option><option value="length">Longest sequence</option><option value="residue">Residue at selected column</option><option value="annotations">Most annotations</option><option value="manual">Manual</option><option value="tree">Tree</option></select></label>
      <button type="button" data-action="show-hidden" data-empty="true" hidden>Show hidden (0)</button>
    </div>
    <div class="ak-toolgroup" role="group" aria-label="Columns">
      <button type="button" data-action="hide-columns" title="Hide the selected columns without changing the alignment">Hide selected columns</button>
      <button type="button" data-action="show-columns" data-empty="true" hidden>Show all columns</button>
    </div>
    <div class="ak-toolgroup" role="group" aria-label="Display">
      <select aria-label="Residues to color"><option value="all">All residues</option><option value="reference-differences">Differences to reference</option><option value="reference-matches">Matches to reference</option><option value="consensus-differences">Differences to consensus</option><option value="consensus-matches">Matches to consensus</option></select>
      <label><input type="checkbox" aria-label="Dots for matches"> Dots for matches</label>
      <label><input type="checkbox" aria-label="Show frequency logo"> Frequency logo</label>
      <label><input type="checkbox" aria-label="Reverse complement"> Reverse complement</label>
      <label>Alphabet <select aria-label="Sequence alphabet"><option value="protein">Protein</option><option value="dna">DNA</option><option value="rna">RNA</option></select></label>
    </div>
    <button type="button" class="ak-more-toggle" aria-expanded="false" aria-controls="ak-more-${n}" title="Thresholds, row filters, statistics scope and ruler coordinates">More</button>
    <div class="ak-more" id="ak-more-${n}" hidden>
      <div class="ak-toolgroup" role="group" aria-label="Thresholds">
        <label class="ak-range">Consensus <input type="range" min="0" max="100" step="5" value="0" aria-label="Consensus threshold" title="Consensus columns whose modal frequency is below this become X or N"><output>0%</output></label>
        <label class="ak-range">Color threshold <input type="range" min="0" max="100" step="5" value="0" aria-label="Color threshold" title="Conservation and percent identity: leave residues below this uncolored" disabled><output>0%</output></label>
      </div>
      <div class="ak-toolgroup" role="group" aria-label="Row filters">
        <label class="ak-number">Minimum identity <input type="number" min="0" max="100" step="1" placeholder="0" aria-label="Minimum identity to reference" title="Show rows with at least this identity (%) to the reference"></label>
        <label class="ak-number">Minimum coverage <input type="number" min="0" max="100" step="1" placeholder="0" aria-label="Minimum coverage" title="Show rows with at least this non-gap fraction (%)"></label>
      </div>
      <div class="ak-toolgroup" role="group" aria-label="Statistics and ruler">
        <label>Statistics <select aria-label="Statistics scope"><option value="all">All sequences</option><option value="filtered">Filtered sequences</option></select></label>
        <label>Ruler <select aria-label="Ruler coordinates"><option value="alignment">Alignment columns</option><option value="reference">Reference residues</option></select></label>
      </div>
    </div>
  </div>
  <div class="ak-fasta-options" role="group" aria-label="FASTA options" hidden><strong>FASTA options</strong>
    <label>Gaps <select aria-label="FASTA gaps"><option value="keep">Keep gaps</option><option value="remove">Remove gaps</option></select></label>
    <label>Case <select aria-label="FASTA letter case"><option value="original">Original case</option><option value="upper">Upper case</option><option value="lower">Lower case</option></select></label>
    <label>Line width <select aria-label="FASTA line width"><option value="80">80</option><option value="60">60</option><option value="0">Unwrapped</option></select></label>
    <label>Orientation <select aria-label="FASTA orientation"><option value="source">Source</option><option value="reverse-complement">Reverse complement</option></select></label>
    <label>Header <select aria-label="FASTA header"><option value="name">Name</option><option value="name-species">Name and species</option><option value="id-name">ID and name</option></select></label>
    <button type="button" data-action="close-fasta-options">Done</button></div>
  <div class="ak-message" role="status" hidden></div>
  <section class="ak-variant-cards" aria-label="Variant cards" data-empty="true" hidden>
    <div class="ak-variant-cards-header"><button type="button" data-action="variant-cards-toggle" aria-expanded="true" aria-controls="${activeCellId}-variants">Variants <span aria-hidden="true">▾</span></button><span class="ak-variant-cards-count" role="status"></span><span class="ak-variant-cards-pages"><button type="button" data-action="variant-cards-prev" aria-label="Previous page of variant cards">‹</button><output aria-label="Variant card page"></output><button type="button" data-action="variant-cards-next" aria-label="Next page of variant cards">›</button></span></div>
    <div class="ak-variant-cards-content" id="${activeCellId}-variants"><div class="ak-variant-card-list" role="group" aria-label="Browse variants"></div><p class="ak-variant-cards-empty" hidden>No variants match the current filters.</p><div class="ak-variant-details" hidden><button type="button" data-action="variant-cards-close">Close details</button><div class="ak-variant-details-body"></div></div></div>
  </section>
  <div class="ak-overview-wrap"><span class="ak-overview-title">Alignment overview<small>Drag to explore</small></span><div class="ak-overview" role="slider" tabindex="0" aria-label="Alignment overview position" aria-valuemin="1" aria-valuemax="1" aria-valuenow="1"><canvas aria-hidden="true"></canvas><div class="ak-overview-window"></div></div></div>
  <div class="ak-workspace">
    <div class="ak-main">
      <div class="ak-tracks"><canvas aria-hidden="true"></canvas><div class="ak-track-labels"><span>Alignment position</span><span title="Most common non-gap symbol / non-gap rows">Modal frequency</span><span title="Gap count / rows">Gap fraction</span><span title="Shannon entropy of non-gap residues, bits">Entropy</span><span title="Mean pairwise BLOSUM62 score, 0 to 1 (protein)">Quality</span><span>Consensus</span><span class="ak-logo-label" hidden>Frequency logo · non-gap</span><span class="ak-variant-label" title="Variants by consequence; hover for details, click to select" hidden>Variants</span><button type="button" class="ak-reference-label" data-action="reference-info">Reference</button></div></div>
      <div class="ak-grid"><div class="ak-scroll" tabindex="0" role="grid" aria-label="Alignment residues" aria-describedby="ak-keys-${n}"><div class="ak-spacer"></div><div class="ak-sr-only" role="row"><span class="ak-active-cell" id="${activeCellId}" role="gridcell"></span></div></div><pre role="region" class="ak-text" tabindex="0" aria-label="Alignment as text" hidden></pre><p class="ak-text-note" hidden></p><canvas class="ak-body-canvas" aria-hidden="true"></canvas><canvas class="ak-tree-canvas" aria-label="Sequence tree. Click a branch point to select its sequences." data-empty="true" hidden></canvas><div class="ak-labels"></div><div class="ak-gutter-resize" role="separator" aria-label="Resize sequence labels" aria-orientation="vertical" aria-valuemin="100" aria-valuemax="420" aria-valuenow="230" tabindex="0"></div><div class="ak-empty">Open an alignment file or paste alignment text (FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF or PIR).</div></div>
    </div>
    <aside class="ak-inspector" aria-label="Alignment inspector"><div class="ak-tabs" role="tablist" aria-label="Inspector sections">${tab('position','Position',true)}${tab('annotations','Features')}${tab('compare','Compare')}${tab('legend','Colors')}${tab('hits','Hits')}${tab('summary','Summary')}</div><div class="ak-inspector-content" id="ak-panel-${n}" tabindex="0" role="tabpanel" aria-labelledby="ak-tab-${n}-position"></div></aside>
  </div>
  <footer class="ak-status"><span class="ak-status-main">No alignment loaded</span><span class="ak-status-detail"></span><button type="button" class="ak-warnings" data-action="warnings" data-empty="true" hidden></button></footer>
  <div class="ak-live ak-sr-only" aria-live="polite"></div>
  <div class="ak-tree-view" role="dialog" aria-label="Tree view" hidden><header><strong>Tree</strong><label>Column <input type="number" min="1" value="1"></label><button type="button" data-action="tree-view-close">Close</button></header><div class="ak-tree-view-scroll" tabindex="-1"><div class="ak-tree-view-spacer"></div><canvas aria-label="Sequence tree with the residue at the chosen column. Click a branch point to select its sequences."></canvas></div></div>
  <div class="ak-sr-only" id="ak-keys-${n}">Arrow keys move the active cell. Shift with the arrow keys selects columns. Page Up and Page Down move by one screen of rows. Home and End go to the first and last column; with Control, to the first and last row. Plus and minus zoom. Left and right square brackets step through variants. Escape clears the selection.</div>`;
}
export function download(content:string|Blob,name:string,type='text/plain') {
  const blob=typeof content==='string'?new Blob([content],{type}):content,url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const $ = <T extends Element=HTMLElement>(root:ParentNode,selector:string)=>root.querySelector<T>(selector)!;
