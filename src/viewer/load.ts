import { type Alphabet, type Alignment, type ParseOptions } from '../types';
import { createAlignment, detectAlphabet } from '../model';
import { readAlignmentInput } from '../parsers';
import { colorSchemes } from '../colors';
import { $ } from '../controls';
import { type Core, type Carry } from './core';
export async function loadInput(v:Core, input:string|Blob|ArrayBuffer,options:ParseOptions,source?:string):Promise<void> {
  v.assertAlive();v.parser.cancel();v.request?.abort();const token=++v.loadRevision;v.loading=true;
  v.message('Reading alignment…');
  try {
    if(input instanceof File&&/\.a3m(?:\.gz)?$/i.test(input.name))throw new Error('A3M insertion notation is not aligned FASTA. Convert it to a rectangular alignment first.');
    const text=await readAlignmentInput(input);
    if(v.disposed||token!==v.loadRevision)return;
    const alignment=await v.parser.parse(text,options);
    if(v.disposed||token!==v.loadRevision)return;
    v.nextSource=source;await v.setAlignment(alignment);
  } catch(error){if(token===v.loadRevision){v.loading=false;v.error(error);}if((error as Error).name!=='AbortError')throw error;}
}
export async function loadUrl(v:Core, url:string,options:ParseOptions={}):Promise<void> {
  v.assertAlive();v.request?.abort();v.parser.cancel();const request=new AbortController();v.request=request;const token=++v.loadRevision;
  v.message('Fetching alignment…');
  try {
    const parsed=new URL(url,document.baseURI);if(/\.a3m(?:\.gz)?$/i.test(parsed.pathname))throw new Error('A3M insertion notation is not aligned FASTA. Convert it before loading.');if(!['https:','http:'].includes(parsed.protocol))throw new Error('Alignment URLs must use HTTP or HTTPS.');
    const response=await fetch(parsed,{signal:request.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const bytes=await response.arrayBuffer();if(token!==v.loadRevision||v.disposed)return;
    v.request=undefined;
    await v.loadInput(bytes,{...options,source:options.source??{url:parsed.href,retrieved:new Date().toISOString()}},parsed.href);
  }catch(error){if((error as Error).name==='AbortError')return;const err=new Error(`Could not load this URL: ${(error as Error).message}. The server must allow browser CORS requests. Download the file and use Open alignment instead.`);if(token===v.loadRevision)v.error(err);throw err;}
}
export async function replace(v:Core, alignment:Alignment,carry?:Carry):Promise<void> {
  v.assertAlive();++v.loadRevision;v.request?.abort();v.parser.cancel();v.analysis.cancel();v.comparison.cancel();v.ranking.cancel();v.searcher.cancel();const revision=++v.revision;
  if(!alignment.rows.length||alignment.width<1||alignment.codes.length!==alignment.width*alignment.rows.length)throw v.error(new Error('Invalid alignment model. Use createAlignment or parseAlignment.'));
  v.sourceUrl=v.nextSource;v.nextSource=undefined;v.loading=true;
  const index=new Map(alignment.rows.map((r,i)=>[r.id,i])),known=(id:string)=>index.has(id);
  v.a=alignment;v.detected=detectAlphabet(alignment);v.trackErrors.clear();v.checkTracks();v.stats=undefined;v.fullStats=undefined;v.reference=index.get(carry?.reference??'')??0;v.selection=carry?.selection??null;v.selectedRows=new Set(carry?.selectedRows.filter(known));v.query=carry?.query??'';v.sort=carry?.sort??'input';v.identities=undefined;v.identityDetails=undefined;v.annotationFilter=carry?.annotationFilter??{};v.featurePage=0;
  v.hidden=new Set(carry?.hidden.filter(known));v.manualOrder=carry?.manualOrder?.filter(known)??null;v.collapsed=new Set(carry?.collapsed);v.groupMap=carry?.groupMap??null;v.tree=carry?.tree?v.bindTree(carry.tree):undefined;v.manualHidden=carry?.hiddenColumns??[];v.colMap=undefined;
  v.menus.close();const schemes=colorSchemes(alignment.alphabet);
  if(!schemes.some(s=>s.id===v.options.colorScheme))v.options.colorScheme=alignment.alphabet==='protein'?'soft':'soft-nucleotide';
  const palette=$<HTMLSelectElement>(v.root,'select[aria-label="Color scheme"]');palette.replaceChildren(...schemes.map(s=>new Option(s.label,s.id)));palette.value=v.options.colorScheme;
  v.dropSearch();v.scroll.scrollLeft=0;v.scroll.scrollTop=0;
  $<HTMLInputElement>(v.root,'[aria-label="Filter sequences"]').value=v.query;
  $<HTMLSelectElement>(v.root,'[aria-label="Sequence alphabet"]').value=alignment.alphabet;
  $<HTMLSelectElement>(v.root,'[aria-label="Sequence order"]').value=v.sort;
  v.rebuildAnnotations();v.rebuildRows();v.inspectorDirty=true;v.overviewDirty=true;v.layout();
  v.message('Calculating exact column statistics…');
  try{await v.updateStats();}catch(error){if(v.revision===revision)v.loading=false;throw error;}
  if(!v.disposed&&v.revision===revision&&v.a===alignment){
    v.message('');v.emit('ready',alignment);
    v.loading=false;const link=v.pendingLink;v.pendingLink=undefined;if(link)await v.applyViewLink(link).catch(()=>[]);
  }
}
/** Type select handler: a switch across the protein/nucleotide line from the detected alphabet waits for Switch or Cancel in the message area. */
export function requestAlphabet(v:Core, next:Alphabet):void {
  const d=v.detected;if(!d||!v.a||next===v.a.alphabet)return;
  if((d.alphabet==='protein')===(next==='protein')){v.applyAlphabet(next);return;}
  const name=(x:Alphabet)=>x==='protein'?'protein':x.toUpperCase(),pct=(x:number)=>`${Math.round(x*1000)/10}%`;
  v.message(d.alphabet==='protein'?`This alignment looks like protein (${pct(d.other)} of residues are not A, C, G, T/U, N). Treat it as ${name(next)}?`:`This alignment looks like ${name(d.alphabet)} (${pct(1-d.other)} of residues are A, C, G, T/U or N). Treat it as protein?`);
  const target=$(v.root,'.ak-message'),button=(action:string,text:string)=>{const b=document.createElement('button');b.type='button';b.dataset.action=action;b.textContent=text;return b;};
  target.append(' ',button('alphabet-switch','Switch'),' ',button('alphabet-cancel','Cancel'));target.hidden=false;v.pendingAlphabet=next;$<HTMLSelectElement>(v.root,'[aria-label="Sequence alphabet"]').value=next;v.menus.sync();
}
export function applyAlphabet(v:Core, next:Alphabet):void {const old=v.a!;void v.setAlignment(createAlignment(old.rows,{name:old.name,alphabet:next,annotations:old.annotations,metadata:old.metadata})).catch(()=>{});}
export async function openFile(v:Core, file:File):Promise<void> {
  if(v.a&&/\.(?:gff3?|bed|gb|gbk|genbank|embl)(?:\.gz)?$/i.test(file.name)){
    try{v.importAnnotations(await readAlignmentInput(file));}catch(error){v.error(error);}
    return;
  }
  await v.load(file,{name:file.name}).catch(()=>{});
}
export function clear(v:Core):void {
  v.assertAlive();++v.loadRevision;++v.statsRevision;++v.revision;v.request?.abort();v.parser.cancel();v.analysis.cancel();v.comparison.cancel();v.ranking.cancel();v.searcher.cancel();
  v.loading=false;v.pendingLink=undefined;
  v.a=undefined;v.detected=undefined;v.stats=undefined;v.fullStats=undefined;v.rows=[];v.filteredRows=[];v.selection=null;v.dropSearch();v.selectedRows.clear();v.annotationFilter={};v.hidden.clear();v.manualHidden=[];v.colMap=undefined;v.manualOrder=null;v.collapsed.clear();v.groupMap=null;v.groupList=[];v.tree=undefined;v.treeHits=[];v.rowPos=new Int32Array(0);if(v.sort==='tree'||v.sort==='manual'){v.sort='input';$<HTMLSelectElement>(v.root,'[aria-label="Sequence order"]').value='input';}
  v.rebuildAnnotations();v.labels.replaceChildren();v.inspector.replaceChildren();
  for(const canvas of v.root.querySelectorAll('canvas')){canvas.width=0;canvas.height=0;}
  $(v.root,'.ak-reference-label').textContent='Reference';$(v.root,'.ak-overview-window').style.width='0';$(v.root,'.ak-status-main').textContent='No alignment loaded';$(v.root,'.ak-status-detail').textContent='';$(v.root,'.ak-empty').textContent='Open an alignment file or paste alignment text (FASTA, Stockholm, CLUSTAL, PHYLIP, NEXUS, MSF or PIR).';v.message('');v.layout();v.emit('selection',null);
}
