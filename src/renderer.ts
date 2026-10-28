import { defaultVisibility, trackLayout } from './visibility';
import type { ViewerVisibility, RulerCoordinates } from './types';
import { isGap, rowOffset } from './model';
import type { Alignment, AlignmentStats, ColorMode, CustomTrack, Selection, Hit } from './types';
import { trackHeight, trackNumber, trackText, isTrackBlank } from './tracks';
import { getColorScheme, residueColor, textColor } from './colors';
import { AnnotationIndex } from './annotations';
import { STRIDE, SYMBOLS, consensusSymbol, movingAverage } from './analysis';
import { treeSpans, type TreeLayout } from './tree';
import { identityColumns, type ColumnMap } from './mask';
export interface GroupInfo { name:string; count:number; color:string; collapsed:boolean }
export interface TreeHit { node:number; x:number; y:number }
/** `rows` holds row indexes; a negative entry -n is the header of groups[n-1]. */
export interface RenderView {
  a:Alignment; stats?:AlignmentStats; rows:number[]; reference:number; x:number; y:number;
  cw:number; rh:number; gutter:number; scheme:string; mode:ColorMode; dark:boolean;
  selection:Selection|null; annotations:AnnotationIndex; logo:boolean; visibility?:Required<ViewerVisibility>; threshold?:number; matchDots?:boolean; ruler?:RulerCoordinates; groups?:GroupInfo[];
  /** Search hits by alignment row index, sorted by start column. */
  hits?:Map<number,Hit[]>; activeHit?:Hit;
  /** Tracks drawn after the built-ins, already validated against the alignment width. */
  /** Display to original column map; omitted means every column is shown. */
  columns?:ColumnMap;
  tracks?:CustomTrack[]; logoMode?:'frequency'|'bits'; window?:number; trackError?:(id:string,error:Error)=>void;
}
const colMap=(v:RenderView):ColumnMap=>v.columns??identityColumns(v.a.width);
export function prepareCanvas(canvas:HTMLCanvasElement,w:number,h:number):CanvasRenderingContext2D {
  const dpr=Math.min(window.devicePixelRatio||1,3);
  w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)) {canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';}
  const ctx=canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return ctx;
}
export class Renderer {
  private atlas?:HTMLCanvasElement;private key='';
  private atlasRatio=1;
  private tile(v:RenderView) {
    const dpr=Math.min(window.devicePixelRatio||1,3),key=[v.cw,v.rh,v.scheme,dpr,v.visibility?.residueLetters].join(':');
    if(key===this.key && this.atlas)return this.atlas;
    this.key=key;const canvas=document.createElement('canvas');
    const cw=v.cw,rh=v.rh;canvas.width=Math.ceil(128*cw*dpr);canvas.height=Math.ceil(rh*2*dpr);
    const ctx=canvas.getContext('2d')!;ctx.scale(dpr,dpr);const scheme=getColorScheme(v.scheme);
    ctx.font=`500 ${Math.min(14,Math.max(9,cw-3))}px "Alignment Mono", ui-monospace, monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(let code=0;code<128;code++) {
      const residue=String.fromCharCode(code),color=residueColor(residue,scheme);
      ctx.fillStyle=color;ctx.fillRect(code*cw,0,cw,v.rh-1);
      if(cw>=9&&v.visibility?.residueLetters!==false){ctx.fillStyle=code===45?'#9caab7':textColor(color);ctx.fillText(code===45?'·':residue,code*cw+cw/2,rh/2+0.5);}
      ctx.fillStyle=color;ctx.fillRect(code*cw,rh,cw,v.rh-1);
      if(cw>=9&&v.visibility?.residueLetters!==false){ctx.fillStyle=textColor(color);ctx.fillText('.',code*cw+cw/2,rh+rh/2+0.5);}
    }
    this.atlas=canvas;this.atlasRatio=dpr;return canvas;
  }
  private row(ctx:CanvasRenderingContext2D,v:RenderView,row:number,y:number,width:number) {
    const m=colMap(v),start=Math.max(0,Math.floor(v.x/v.cw)),end=Math.min(m.count,Math.ceil((v.x+width-v.gutter)/v.cw));
    const atlas=this.tile(v),ratio=this.atlasRatio,scheme=getColorScheme(v.scheme);
    for(let d=start;d<end;d++) {
      const c=m.cols[d],code=v.a.codes[row*v.a.width+c],x=v.gutter+d*v.cw-v.x;
      const compare=!v.mode.startsWith('consensus')?v.a.codes[v.reference*v.a.width+c]:v.stats?.consensus[c];
      const same=compare===code&&compare!==45&&compare!==63;
      const dot=!!v.matchDots&&same&&row!==v.reference&&!isGap(code);
      const faded=v.mode!=='all'&&compare!==undefined&&(v.mode.endsWith('differences')?same:!same);
      if(v.scheme==='conservation') {
        const color=residueColor(String.fromCharCode(code),scheme,v.stats?.support[c]);ctx.fillStyle=color;ctx.globalAlpha=faded?0.22:1;ctx.fillRect(x,y,v.cw,v.rh-1);
        if(v.cw>=9&&v.visibility?.residueLetters!==false){ctx.fillStyle=textColor(color);ctx.font=`500 ${Math.min(14,v.cw-3)}px "Alignment Mono", monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(dot?'.':code===45?'·':String.fromCharCode(code),x+v.cw/2,y+v.rh/2);}
      } else {ctx.globalAlpha=faded?0.22:1;ctx.drawImage(atlas,code*v.cw*ratio,dot?v.rh*ratio:0,v.cw*ratio,v.rh*ratio,x,y,v.cw,v.rh);}
      ctx.globalAlpha=1;
    }
    const hits=v.hits?.get(row);
    if(hits)for(const hit of hits){
      const left=m.before[hit.start-1],right=m.before[hit.end];
      if(right<=left||left>=end||right<=start)continue;
      const x=v.gutter+left*v.cw-v.x,w=Math.max(2,(right-left)*v.cw),active=hit===v.activeHit;
      ctx.strokeStyle=active?'#d63b00':v.dark?'#ffb347':'#e08a00';ctx.lineWidth=active?3:2;ctx.setLineDash(hit.strand==='-'?[4,3]:[]);
      ctx.strokeRect(x+1,y+1,w-2,v.rh-3);
    }
    ctx.setLineDash([]);
    if(v.visibility?.annotationMarks===false)return;
    if(start>=end)return;
    const from=m.cols[start]+1,to=m.cols[end-1]+1,items=[...v.annotations.query(v.a.rows[row].id,from,to),...v.annotations.query('*',from,to)];
    // Merge overlapping marks into pixel bins at low zoom; never draw unbounded feature DOM.
    const bins=new Set<number>();
    for(const item of items){const left=Math.max(start,m.before[item.start!-1]),right=Math.min(end,m.before[item.end!]);if(right<=left)continue;const x=v.gutter+left*v.cw-v.x;
      if(v.cw<9){const bin=Math.floor(x/4);if(bins.has(bin))continue;bins.add(bin);ctx.fillStyle='#a63d59';ctx.fillRect(x,y,Math.max(3,(right-left)*v.cw),3);}
      else{ctx.strokeStyle=item.color&&/^#[0-9a-f]{6}$/i.test(item.color)?item.color:'#a63d59';ctx.lineWidth=1.7;ctx.strokeRect(x+1,y+1,Math.max(1,(right-left)*v.cw-2),v.rh-3);}
    }
  }
  private header(ctx:CanvasRenderingContext2D,v:RenderView,group:GroupInfo|undefined,y:number,width:number) {
    if(!group)return;
    ctx.fillStyle=v.dark?'#1f3147':'#eef3f8';ctx.fillRect(v.gutter,y,width-v.gutter,v.rh-1);ctx.fillStyle=group.color;ctx.fillRect(v.gutter,y,4,v.rh-1);
    ctx.fillStyle=v.dark?'#e3ecf5':'#243447';ctx.font='600 12px "Alignment Sans", system-ui, sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText(`${group.collapsed?'▸':'▾'} ${group.name} (${group.count.toLocaleString()})`,v.gutter+12,y+v.rh/2);
  }
  /** Draw the tree column. Leaves sit at the display position of their row, so scrolling and filtering keep it aligned. Returns the internal nodes drawn, for hit testing. */
  tree(canvas:HTMLCanvasElement,v:RenderView,layout:TreeLayout,leafRow:Int32Array,rowPos:Int32Array,width:number,height:number):TreeHit[] {
    const ctx=prepareCanvas(canvas,width,height),hits:TreeHit[]=[];
    ctx.fillStyle=v.dark?'#172333':'#f9fbfc';ctx.fillRect(0,0,width,height);
    const leafY=new Float64Array(layout.nodes.length).fill(NaN);
    for(let k=0;k<leafY.length;k++){const r=leafRow[k];if(r>=0&&rowPos[r]>=0)leafY[k]=rowPos[r]*v.rh-v.y+v.rh/2;}
    const {y,lo,hi}=treeSpans(layout,leafY),span=Math.max(1,width-14),px=(k:number)=>4+layout.x[k]*span;
    ctx.strokeStyle=v.dark?'#8ea4ba':'#6b7f93';ctx.fillStyle=v.dark?'#b7c8d9':'#3f5870';ctx.lineWidth=1;ctx.beginPath();
    for(let k=0;k<y.length;k++) {
      if(Number.isNaN(y[k]))continue;
      const internal=layout.kids[k].length>0,top=internal?lo[k]:y[k],bottom=internal?hi[k]:y[k];
      if(bottom<-2||top>height+2)continue;
      if(k>0){const yy=Math.round(y[k])+.5;ctx.moveTo(px(layout.parent[k]),yy);ctx.lineTo(px(k),yy);}
      if(internal){const xx=Math.round(px(k))+.5;ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);if(y[k]>=0&&y[k]<=height)hits.push({node:k,x:px(k),y:y[k]});}
    }
    ctx.stroke();
    for(const hit of hits)ctx.fillRect(hit.x-2,hit.y-2,4,4);
    return hits;
  }
  body(canvas:HTMLCanvasElement,v:RenderView,width:number,height:number) {
    const ctx=prepareCanvas(canvas,width,height);ctx.fillStyle=v.dark?'#172333':'#ffffff';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.beginPath();ctx.rect(v.gutter,0,width-v.gutter,height);ctx.clip();
    const first=Math.max(0,Math.floor(v.y/v.rh)),last=Math.min(v.rows.length,Math.ceil((v.y+height)/v.rh));
    for(let i=first;i<last;i++)v.rows[i]<0?this.header(ctx,v,v.groups?.[-v.rows[i]-1],i*v.rh-v.y,width):this.row(ctx,v,v.rows[i],i*v.rh-v.y,width);
    const m=colMap(v);this.edges(ctx,v,m,0,height,false,width);
    if(v.selection&&v.visibility?.selectionOverlay!==false){const x=v.gutter+m.before[v.selection.start-1]*v.cw-v.x,w=Math.max(2,(m.before[v.selection.end]-m.before[v.selection.start-1])*v.cw);ctx.fillStyle='rgba(36,99,166,0.09)';ctx.fillRect(x,0,w,height);ctx.strokeStyle='#2463a6';ctx.lineWidth=1.5;ctx.strokeRect(x+.75,.75,w-1.5,height-1.5);}
    ctx.restore();ctx.fillStyle=v.dark?'#172333':'#f9fbfc';ctx.fillRect(0,0,v.gutter,height);ctx.strokeStyle=v.dark?'#354356':'#d7e0e7';ctx.beginPath();ctx.moveTo(v.gutter-.5,0);ctx.lineTo(v.gutter-.5,height);ctx.stroke();
  }
  /** Dashed line at each collapsed boundary; `cap` adds a solid tab for the ruler. */
  private edges(ctx:CanvasRenderingContext2D,v:RenderView,m:ColumnMap,top:number,bottom:number,cap:boolean,width:number) {
    if(!m.edges.length)return;
    const first=Math.floor(v.x/v.cw),last=Math.ceil((v.x+width)/v.cw);
    ctx.save();ctx.strokeStyle=ctx.fillStyle=v.dark?'#ffb347':'#d07a1a';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();
    for(const e of m.edges){if(e<first||e>last)continue;const x=Math.round(v.gutter+e*v.cw-v.x)+.5;ctx.moveTo(x,top);ctx.lineTo(x,bottom);}
    ctx.stroke();ctx.setLineDash([]);
    if(cap)for(const e of m.edges){if(e<first||e>last)continue;const x=Math.round(v.gutter+e*v.cw-v.x);ctx.fillRect(x-2,top,4,9);}
    ctx.restore();
  }
  tracks(canvas:HTMLCanvasElement,v:RenderView,width:number) {
    const extra=v.tracks??[],tracks=trackLayout(v.visibility??{...defaultVisibility,logo:v.logo},v.rh,extra.map(t=>({height:trackHeight(t)})),v.a.alphabet),offset=tracks.offsets;
    const bitsMax=Math.log2(v.a.alphabet==='protein'?20:4),window=v.window??1;
    const height=tracks.height,ctx=prepareCanvas(canvas,width,height),ink=v.dark?'#b7c8d9':'#607489',line=v.dark?'#354356':'#e6ebf0';
    ctx.fillStyle=v.dark?'#172333':'#ffffff';ctx.fillRect(0,0,width,height);ctx.save();ctx.beginPath();ctx.rect(v.gutter,0,width-v.gutter,height);ctx.clip();
    const m=colMap(v),start=Math.max(0,Math.floor(v.x/v.cw)),end=Math.min(m.count,Math.ceil((v.x+width-v.gutter)/v.cw));
    ctx.font='11px "Alignment Mono", monospace';ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='alphabetic';
    const tick=v.cw<5?50:v.cw<10?20:10,refRow=v.ruler==='reference'?v.reference*v.a.width:-1,first=rowOffset(v.a.rows[v.reference]),showFirst=tick-first%tick>=Math.ceil(24/v.cw);
    // Reference numbering counts residues in hidden columns too, so labels stay in original coordinates.
    let residue=first-1,counted=0,lastLabel=-1e9,lastEdge=false;const gap=Math.ceil(36/v.cw);
    for(let d=start;d<end;d++) {
      const c=m.cols[d],x=v.gutter+d*v.cw-v.x;
      let number:number|null=c+1;
      if(refRow>=0){while(counted<c){if(!isGap(v.a.codes[refRow+counted]))residue++;counted++;}number=isGap(v.a.codes[refRow+c])?null:++residue;counted=c+1;}
      const regular=number!==null&&(refRow>=0?number%tick===0||showFirst&&number===first:c===0||number%tick===0),edge=number!==null&&!regular&&(d>0?c-m.cols[d-1]>1:c>0)&&d-lastLabel>=gap;
      if(offset.ruler!==null&&(edge||regular&&!(lastEdge&&d-lastLabel<gap))){lastLabel=d;lastEdge=edge;ctx.fillStyle=ink;ctx.font='11px "Alignment Mono", monospace';ctx.fillText(String(number),x+v.cw/2,17);ctx.fillStyle=line;ctx.fillRect(x+v.cw/2,23,1,height-23);}
      if(!v.stats)continue;
      if(offset.modalFrequency!==null){ctx.fillStyle='#3a7da4';ctx.fillRect(x,offset.modalFrequency+22-(v.stats.frequency[c]||0)*20,Math.max(1,v.cw-1),(v.stats.frequency[c]||0)*20);}
      if(offset.gapFraction!==null){ctx.fillStyle='#c5a278';const gap=v.stats.total?v.stats.gaps[c]/v.stats.total:0;ctx.fillRect(x,offset.gapFraction+22-gap*18,Math.max(1,v.cw-1),gap*18);}
      if(offset.entropy!==null){const h=Math.min(1,Math.max(0,movingAverage(v.stats.entropy,window,c)/bitsMax))||0;ctx.fillStyle='#8a6bb0';ctx.fillRect(x,offset.entropy+22-h*20,Math.max(1,v.cw-1),h*20);}
      if(offset.quality!==null){const h=Math.min(1,Math.max(0,movingAverage(v.stats.quality,window,c)))||0;ctx.fillStyle='#4f9a6b';ctx.fillRect(x,offset.quality+22-h*20,Math.max(1,v.cw-1),h*20);}
      if(offset.consensus!==null){
        const symbol=consensusSymbol(v.stats,v.a.alphabet,c,v.threshold??0),color=residueColor(symbol,getColorScheme(v.scheme),v.stats.support[c]);
        ctx.fillStyle=color;ctx.fillRect(x,offset.consensus+4,v.cw,27);
        if(v.cw>=9&&v.visibility?.residueLetters!==false){ctx.fillStyle=symbol==='-'?ink:textColor(color);ctx.font=`500 ${Math.min(14,v.cw-3)}px "Alignment Mono", monospace`;ctx.fillText(symbol==='-'?'·':symbol,x+v.cw/2,offset.consensus+22);}
      }
      if(offset.logo!==null&&v.cw>=6) {
        const counts=[];const n=v.stats.total-v.stats.gaps[c];
        for(let k=0;k<27;k++){const count=v.stats.counts[c*STRIDE+k];if(count)counts.push({r:SYMBOLS[k],n:count});}
        counts.sort((a,b)=>a.n-b.n);let bottom=offset.logo+37;const scale=v.logoMode==='bits'?(v.stats.information[c]||0)/bitsMax:1;
        for(const d of counts){const h=d.n/n*39*scale;if(h<1)continue;ctx.save();ctx.translate(x,bottom-h);ctx.scale(v.cw/16,h/16);ctx.font='bold 18px "Alignment Mono", monospace';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle=residueColor(d.r,getColorScheme(v.scheme),1);ctx.fillText(d.r,8,17);ctx.restore();bottom-=h;}
      }
    }
    if(offset.reference!==null&&v.reference>=0)this.row(ctx,v,v.reference,offset.reference,width);
    extra.forEach((t,i)=>tracks.custom[i]&&this.customTrack(ctx,v,m,t,tracks.custom[i],start,end,width,ink,line));
    this.edges(ctx,v,m,0,height,offset.ruler!==null,width);
    if(v.selection&&v.visibility?.selectionOverlay!==false){const l=m.before[v.selection.start-1];ctx.strokeStyle='#2463a6';ctx.lineWidth=1.5;ctx.strokeRect(v.gutter+l*v.cw-v.x+.75,.75,Math.max(2,(m.before[v.selection.end]-l)*v.cw)-1.5,height-1.5);}
    ctx.restore();return height;
  }
  private customTrack(ctx:CanvasRenderingContext2D,v:RenderView,m:ColumnMap,t:CustomTrack,slot:{offset:number;height:number},start:number,end:number,width:number,ink:string,line:string) {
    const top=slot.offset,height=slot.height,[d0,d1]=t.domain??[0,1],color=t.color??'#3a7da4';
    ctx.fillStyle=line;ctx.fillRect(v.gutter,top,width-v.gutter,1);
    if(t.type==='custom'){
      // One call per run of adjacent kept columns, clipped to that run when columns are hidden.
      const masked=m.count<m.width;
      for(let d=start,e=start;d<end;d=e){
        for(e=d+1;e<end&&m.cols[e]===m.cols[e-1]+1;)e++;
        ctx.save();ctx.beginPath();ctx.rect(masked?v.gutter+d*v.cw-v.x:v.gutter,top,masked?(e-d)*v.cw:width-v.gutter,height);ctx.clip();
        try{t.render!(ctx,{start:m.cols[d]+1,end:m.cols[e-1]+1,cellWidth:v.cw,offsetX:v.gutter+d*v.cw-v.x,top,height,alignment:v.a});}catch(error){v.trackError?.(t.id,error instanceof Error?error:new Error(String(error)));}
        ctx.restore();
      }
      ctx.globalAlpha=1;return;
    }
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`500 ${Math.min(12,Math.max(9,v.cw-3))}px "Alignment Mono", monospace`;
    for(let d=start;d<end;d++){
      const c=m.cols[d],x=v.gutter+d*v.cw-v.x;
      if(t.type==='text'){const ch=trackText(t,c);if(v.cw>=9){ctx.fillStyle=ink;ctx.fillText(ch,x+v.cw/2,top+height/2+1);}else if(!isTrackBlank(ch)){ctx.globalAlpha=0.45;ctx.fillStyle=color;ctx.fillRect(x,top+3,Math.max(1,v.cw-1),height-6);ctx.globalAlpha=1;}continue;}
      const n=trackNumber(t,c);if(n===null)continue;
      const f=Math.min(1,Math.max(0,(n-d0)/(d1-d0)));ctx.fillStyle=color;
      if(t.type==='bar')ctx.fillRect(x,top+height-2-f*(height-4),Math.max(1,v.cw-1),f*(height-4));
      else{ctx.globalAlpha=f;ctx.fillRect(x,top+1,v.cw,height-2);ctx.globalAlpha=1;}
    }
  }
  overview(canvas:HTMLCanvasElement,v:RenderView,width:number) {
    const ctx=prepareCanvas(canvas,width,44),scheme=getColorScheme(v.scheme);ctx.fillStyle=v.dark?'#243244':'#e9eff4';ctx.fillRect(0,4,width,32);
    // Aggregate all rows into occupancy/frequency bins; no hidden row sampling.
    const m=colMap(v);
    if(v.stats)for(let px=0;px<width;px++){
      const from=Math.floor(px*m.count/width),to=Math.min(m.count,Math.max(from+1,Math.floor((px+1)*m.count/width)));
      let support=0,occupancy=0;for(let d=from;d<to;d++){const c=m.cols[d];support+=v.stats.support[c]||0;occupancy+=v.stats.total?1-v.stats.gaps[c]/v.stats.total:0;}
      const h=occupancy/(to-from)*30;ctx.fillStyle=residueColor(String.fromCharCode(v.stats.consensus[m.cols[from]]),scheme,support/(to-from));ctx.fillRect(px,35-h,1,h);
    }
  }
}
