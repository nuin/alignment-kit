import type { Alignment, AlignmentStats, Selection, Annotation, AnnotationFilter, Identity, Hit } from './types';
import { columnDetail } from './analysis';
import { columnToResidue } from './model';
import { getColorScheme, residueColor, dynamicSchemes, textColor } from './colors';
import { hitCount } from './search';
import { displayCode } from './strand';
import type { ColumnAnalysis } from './summary';
export interface InspectorInput { a:Alignment;stats?:AlignmentStats;selection:Selection|null;scheme:string;reference:number;selectedRows:Set<string>;annotations:Annotation[];annotationFilter:AnnotationFilter;unknown:number;excluded:number;tab:string;page:number;marked?:boolean;scope:string;identity?:Identity;hits:Hit[];truncated:boolean;pattern:string;hit:number;reverse?:boolean;strands?:Set<string>;summary?:SummaryView}
export interface SummaryView { block?:{start:number;end:number};data?:ColumnAnalysis;error?:string;page:number }
export const SUMMARY_PAGE=20;
export const HIT_LIST_LIMIT=200;
const bits=(n:number|null)=>n===null?'Unavailable':`${n.toFixed(2)} bits`;
const percent=(n:number|null)=>n===null?'Unavailable':`${(n*100).toFixed(1)}%`;

export function renderInspector(target:HTMLElement,v:InspectorInput) {
  const doc=target.ownerDocument;
  const el=<K extends keyof HTMLElementTagNameMap>(tag:K, text?:string, className?:string):HTMLElementTagNameMap[K]=>{
    const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;
  };
  const add=(parent:HTMLElement,tag:keyof HTMLElementTagNameMap,text?:string,className?:string)=>{const node=el(tag,text,className);parent.append(node);return node;};
  const action=(parent:HTMLElement,label:string,name:string,disabled=false)=>{const b=el('button',label);b.type='button';b.dataset.action=name;b.disabled=disabled;parent.append(b);return b;};
  const actions=()=>add(target,'div',undefined,'ak-inspector-actions');
  const stat=(grid:HTMLElement,value:string,label:string)=>{const box=add(grid,'div');add(box,'strong',value);add(box,'span',label);};
  const feature=(parent:HTMLElement,index:number,label:string,detail:string,small?:string)=>{const b=el('button',undefined,'ak-feature');b.type='button';b.dataset.feature=String(index);add(b,'strong',label);add(b,'span',detail);if(small!==undefined)add(b,'small',small);parent.append(b);};
  target.replaceChildren();
  if(v.tab==='legend') {
    const scheme=getColorScheme(v.scheme);add(target,'h3',scheme.label);add(target,'p',scheme.description);
    if(dynamicSchemes.has(scheme.id))add(target,'p','Colors depend on the column statistics, so there are no per-letter swatches.','ak-caption');
    else {const legend=add(target,'div',undefined,'ak-residue-legend');for(const r of v.a.alphabet==='protein'?'ACDEFGHIKLMNPQRSTVWYBXZ*':'ACGTUNRYKMSWBDHV'){const color=residueColor(r,scheme,1),s=add(legend,'span',r);s.style.background=color;s.style.color=textColor(color);}}
    if(scheme.classes){const list=add(target,'ul',undefined,'ak-class-legend');for(const c of scheme.classes){const item=add(list,'li'),s=add(item,'span',c.residues.slice(0,5));s.style.background=c.color;s.style.color=textColor(c.color);item.append(doc.createTextNode(c.label));}if(scheme.cvdSafe)add(target,'p','Colorblind-safe: checked under simulated deuteranopia and protanopia.');if(scheme.highContrast)add(target,'p','High contrast: letters keep at least 7:1 contrast against their fill.');}
    add(target,'p','Letters remain visible at residue zoom. Dots mark alignment gaps.');add(target,'h4','Coordinate systems');add(target,'p','Alignment columns include gaps. Sequence positions count only residues and are shown for the selected row.');return;
  }
  if(v.tab==='summary') {
    const s=v.summary??{page:0};add(target,'h3','Summary');
    if(s.error){add(target,'p',s.error);return;}if(!s.data){add(target,'p','Calculating summary…');return;}
    const {summary:m,variable:t}=s.data,id=m.identityToReference,pages=Math.max(1,Math.ceil(t.columns.length/SUMMARY_PAGE)),page=Math.min(s.page,pages-1),items=t.columns.slice(page*SUMMARY_PAGE,(page+1)*SUMMARY_PAGE);
    const gc=m.rowGc?.filter(r=>r.gc!==null).sort((x,y)=>x.gc!-y.gc!),gcMean=gc?.length?gc.reduce((sum,r)=>sum+r.gc!,0)/gc.length:null;
    add(target,'p',`${s.block?`Selected columns ${m.start}–${m.end}`:'All columns'} (${m.columns.toLocaleString()}) · ${m.rows.toLocaleString()} ${v.scope} rows`);
    const grid=add(target,'div',undefined,'ak-stat-grid');
    for(const [value,label] of [[m.conserved.toLocaleString(),'Conserved'],[m.variable.toLocaleString(),'Variable'],[m.parsimonyInformative.toLocaleString(),'Parsimony informative'],[m.singleton.toLocaleString(),'Singleton'],[m.constantWithGaps.toLocaleString(),'Constant with gaps'],[m.gapOnly.toLocaleString(),'Gap only'],[percent(m.gapFraction),'Gap fraction'],[percent(m.meanPairwiseIdentity),'Mean pairwise identity']])stat(grid,value,label);
    if(id)stat(grid,percent(id.identity),`Identity to ${v.a.rows[v.reference].name}`);if(gcMean!==null)stat(grid,percent(gcMean),'Mean GC');
    if(gc?.length)add(target,'p',`GC per row: lowest ${gc[0].name} ${percent(gc[0].gc)}, highest ${gc[gc.length-1].name} ${percent(gc[gc.length-1].gc)}. The API lists every row.`,'ak-caption');
    add(target,'h4',`Variable columns (${t.total.toLocaleString()})`);
    if(items.length){const table=add(target,'table',undefined,'ak-variants'),head=add(add(table,'thead'),'tr');for(const h of ['Col','Ref','Alleles'])add(head,'th',h);const body=add(table,'tbody');for(const c of items){const row=add(body,'tr');add(row,'td',String(c.column));add(row,'td',`${c.referenceResidue===null?'—':c.referenceResidue} ${c.reference==='-'?'':c.reference}`);add(row,'td',c.alleles.map(x=>`${x.residue}:${x.count}`).join(' '));}}
    else add(target,'p','No variable columns.');
    if(t.truncated)add(target,'p',`The list stops at ${t.columns.length.toLocaleString()} of ${t.total.toLocaleString()} columns. Export TSV lists all.`,'ak-caption');
    const bar=actions();action(bar,'Previous','summary-prev',page===0);add(bar,'span',`${page+1} / ${pages}`);action(bar,'Next','summary-next',page+1>=pages);action(bar,'Export TSV','export-variants');
    add(target,'p','Conserved: one residue, no gaps. Variable: two or more residues; gaps are ignored. Informative: two residues each seen at least twice. Singleton: any other variable column. Identity counts A, C, G, T/U (protein: the 20 amino acids) only.','ak-definition');return;
  }
  if(v.tab==='hits') {
    add(target,'h3','Hits');if(!v.pattern){const p=add(target,'p');p.append('Search with the motif box. It accepts IUPAC letters, ',el('code','/regex/'),' and PROSITE patterns such as ',el('code','N-{P}-[ST]-{P}'),'.');return;}
    const shown=v.hits.slice(0,HIT_LIST_LIMIT),p=add(target,'p');p.append(`${hitCount({hits:v.hits,truncated:v.truncated})} for `,el('code',v.pattern),v.truncated?' (stopped at the 10,000 hit limit)':'');
    const list=add(target,'div',undefined,'ak-feature-list');for(const [i,h] of shown.entries()){const b=el('button',undefined,'ak-feature');b.type='button';b.dataset.hit=String(i);if(i===v.hit)b.setAttribute('aria-current','true');add(b,'strong',v.a.rows[h.row].name);add(b,'span',`columns ${h.start}–${h.end} · ${h.strand==='+'?'forward':'reverse'} strand`);add(b,'small',h.match.length>48?h.match.slice(0,48)+'…':h.match);list.append(b);}if(!shown.length)add(list,'p','No matches.');
    if(v.hits.length>shown.length)add(target,'p',`Showing the first ${HIT_LIST_LIMIT} hits. Use Find next to reach the rest.`);return;
  }
  if(v.tab==='compare') {
    add(target,'h3','Compare sequences');add(target,'p','Select rows with the checkboxes beside their names. Comparison uses canonical residues present in both sequences.');add(target,'strong',`${v.selectedRows.size} selected`);const bar=actions();action(bar,'Calculate identity','compare',v.selectedRows.size<2);action(bar,'Clear rows','clear-rows');add(target,'p','Maximum 200 rows. Gaps and ambiguous residues are excluded; each pair reports its compared-position count.');add(target,'div',undefined,'ak-identity-result');return;
  }
  if(v.tab==='annotations') {
    const types=[...new Set(v.a.annotations.map(a=>a.kind??'variant'))].sort(),consequences=[...new Set(v.a.annotations.flatMap(a=>a.consequence??[]))].sort(),pageSize=30,start=v.page*pageSize,items=v.annotations.slice(start,start+pageSize);
    add(target,'h3','Features & variants');
    const filter=(label:string,aria:string,values:string[],selected:string[]|undefined,all:string)=>{const field=el('label',label,'ak-field'),select=el('select');select.setAttribute('aria-label',aria);const first=el('option',all);first.value='';select.append(first);for(const value of values){const option=el('option',value);option.selected=!!selected?.includes(value);select.append(option);}field.append(select);target.append(field);};
    filter('Type','Feature type',types,v.annotationFilter.types,'All types');filter('Consequence','Feature consequence',consequences,v.annotationFilter.consequences,'All consequences');
    const checks=add(target,'div',undefined,'ak-checks');for(const [label,aria,checked] of [['Disease evidence','Features with disease evidence',v.annotationFilter.disease],['Phenotype evidence','Features with phenotype evidence',v.annotationFilter.phenotype]] as const){const l=el('label'),input=el('input');input.type='checkbox';input.setAttribute('aria-label',aria);input.checked=!!checked;l.append(input,` ${label}`);checks.append(l);}
    add(target,'p',`${v.annotations.length.toLocaleString()} shown · ${v.excluded.toLocaleString()} excluded${v.unknown?` · ${v.unknown.toLocaleString()} with unknown evidence`:''}`);
    const list=add(target,'div',undefined,'ak-feature-list');for(const [i,a] of items.entries())feature(list,start+i,a.label,`${a.kind??'variant'} · ${a.mapping==='mapped'?`columns ${a.start}–${a.end}`:'Unmapped'}`,a.rowId?v.a.rows.find(r=>r.id===a.rowId)?.name??a.rowId:'Global feature');if(!items.length)add(list,'p','No features match these filters.');
    const bar=actions();bar.classList.add('ak-feature-pagination');action(bar,'Previous','features-prev',v.page===0);add(bar,'span',`${v.page+1} / ${Math.max(1,Math.ceil(v.annotations.length/pageSize))}`);action(bar,'Next','features-next',start+pageSize>=v.annotations.length);return;
  }
  if(!v.selection) {
    const intro=add(target,'div',undefined,'ak-inspector-intro'),symbol=add(intro,'div','⌖','ak-inspector-symbol');symbol.setAttribute('aria-hidden','true');add(intro,'h3','A closer look');add(intro,'p','Select a residue to inspect its column, sequence position and annotations.');add(target,'h4','Explore the alignment');const list=add(target,'ul');for(const text of ['Scroll to move through sequences.','Shift-click to select a range.','Pin any row as the reference.','Use + and − to change detail.'])add(list,'li',text);
    const p=add(target,'p');p.append(`${v.a.rows.length.toLocaleString()} sequences`,el('br'),`${v.a.width.toLocaleString()} aligned columns`,el('br'),v.a.alphabet.toUpperCase());if(v.a.metadata.source){add(target,'h4','Source');add(target,'p',v.a.metadata.source.description??v.a.metadata.source.url??'Imported alignment','ak-wrap');}return;
  }
  const col=v.selection.start,row=v.selection.rowId?v.a.rows.findIndex(r=>r.id===v.selection!.rowId):v.reference;
  const position=row>=0?columnToResidue(v.a,row,col):null,ref=columnToResidue(v.a,v.reference,col),residue=row>=0?String.fromCharCode(v.a.codes[row*v.a.width+col-1]):null,shown=row>=0&&residue!==null?String.fromCharCode(displayCode(v.a.alphabet,v.a.codes[row*v.a.width+col-1],!!v.reverse,!!v.strands?.has(v.a.rows[row].id))):null;
  const heading=add(target,'div',undefined,'ak-position-heading');add(heading,'span','Alignment position');add(heading,'h2',`Column ${col}`);if(v.selection.end!==col)add(heading,'p',`Selected range ${col}–${v.selection.end}`);add(heading,'p',`Reference ${v.a.rows[v.reference].name}: ${ref===null?'gap':`residue ${ref}`}`,'ak-reference-position');
  const mark=action(actions(),`${v.marked?'Unmark':'Mark'} column${v.selection.end!==col?'s':''}`,'mark-columns');mark.setAttribute('aria-pressed',String(!!v.marked));
  if(row>=0){const selected=add(target,'div',undefined,'ak-selected-residue');add(selected,'b',shown==='-'?'—':shown!);const info=add(selected,'div');add(info,'strong',v.a.rows[row].name);if(shown!==residue)add(info,'span',`Source residue ${residue}`);add(info,'span',position===null?'Alignment gap':`Sequence position ${position}`);if(v.a.rows[row].species)add(info,'small',v.a.rows[row].species);const bar=actions();action(bar,'Pin reference','pin-selected');action(bar,`${v.annotationFilter.hiddenRowIds?.includes(v.a.rows[row].id)?'Show':'Hide'} row features`,'toggle-row-features');}
  if(v.identity){const p=add(target,'p');p.append('Identity to reference: ',el('strong',percent(v.identity.identity)),el('br'),`${v.identity.matches.toLocaleString()} matches / ${v.identity.compared.toLocaleString()} canonical positions compared`);}
  if(!v.stats){add(target,'p','Calculating exact column statistics…');return;}
  const d=columnDetail(v.stats,col),grid=add(target,'div',undefined,'ak-stat-grid');
  for(const [value,label] of [[percent(d.frequency),'Modal frequency'],[percent(d.gapFraction),'Gap fraction'],[percent(d.support),'Consensus support'],[d.tied?'Tied':d.consensus??'—','Consensus'],[bits(d.entropy),'Entropy'],[bits(d.information),'Information']])stat(grid,value,label);
  if(v.a.alphabet==='protein')stat(grid,d.quality===null?'Unavailable':d.quality.toFixed(2),'Quality');
  add(target,'h4','Residue distribution');add(target,'p',`${d.total.toLocaleString()} ${v.scope} rows · ${d.gapCount.toLocaleString()} gaps`,'ak-caption');const distribution=add(target,'div',undefined,'ak-distribution');for(const x of d.counts){const line=add(distribution,'div');add(line,'b',x.residue);const bar=add(line,'div',undefined,'ak-bar'),fill=add(bar,'span');fill.style.width=`${x.count/Math.max(1,d.total)*100}%`;fill.style.background=residueColor(x.residue,getColorScheme(v.scheme),d.support??undefined);add(line,'span',x.count.toLocaleString());}
  add(target,'p','Frequency excludes gaps. Support includes all rows in the statistics scope. Ambiguity symbols are counted separately. Entropy and information are in bits over non-gap residues; information subtracts the small-sample correction. Quality is the mean pairwise BLOSUM62 score scaled to 0 to 1.','ak-definition');
  const features=v.annotations.filter(a=>a.mapping==='mapped'&&a.start!<=col&&a.end!>=col&&(!v.selection!.rowId||!a.rowId||a.rowId===v.selection!.rowId));
  if(features.length){add(target,'h4',`Features at this position (${features.length})`);for(const a of features.slice(0,20))feature(target,v.annotations.indexOf(a),a.label,a.kind??'variant');if(features.length>20)add(target,'p','Open Features to browse all annotations.');}
}
