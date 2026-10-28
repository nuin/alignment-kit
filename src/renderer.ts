import { defaultVisibility, trackLayout } from './visibility';
import type { ViewerVisibility } from './types';
import type { Alignment, AlignmentStats, ColorMode, Selection } from './types';
import { getColorScheme, residueColor, textColor } from './colors';
import { AnnotationIndex } from './annotations';
import { STRIDE, SYMBOLS, consensusSymbol } from './analysis';
import { isGap } from './model';
export interface RenderView {
  a:Alignment; stats?:AlignmentStats; rows:number[]; reference:number; x:number; y:number;
  cw:number; rh:number; gutter:number; scheme:string; mode:ColorMode; dark:boolean;
  selection:Selection|null; annotations:AnnotationIndex; logo:boolean; visibility?:Required<ViewerVisibility>; threshold?:number; matchDots?:boolean;
}
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
    const start=Math.max(0,Math.floor(v.x/v.cw)),end=Math.min(v.a.width,Math.ceil((v.x+width-v.gutter)/v.cw));
    const atlas=this.tile(v),ratio=this.atlasRatio,scheme=getColorScheme(v.scheme);
    for(let c=start;c<end;c++) {
      const code=v.a.codes[row*v.a.width+c],x=v.gutter+c*v.cw-v.x;
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
    if(v.visibility?.annotationMarks===false)return;
    const items=[...v.annotations.query(v.a.rows[row].id,start+1,end),...v.annotations.query('*',start+1,end)];
    // Merge overlapping marks into pixel bins at low zoom; never draw unbounded feature DOM.
    const bins=new Set<number>();
    for(const item of items){const left=Math.max(start,item.start!-1),right=Math.min(end,item.end!);const x=v.gutter+left*v.cw-v.x;
      if(v.cw<9){const bin=Math.floor(x/4);if(bins.has(bin))continue;bins.add(bin);ctx.fillStyle='#a63d59';ctx.fillRect(x,y,Math.max(3,(right-left)*v.cw),3);}
      else{ctx.strokeStyle=item.color&&/^#[0-9a-f]{6}$/i.test(item.color)?item.color:'#a63d59';ctx.lineWidth=1.7;ctx.strokeRect(x+1,y+1,Math.max(1,(right-left)*v.cw-2),v.rh-3);}
    }
  }
  body(canvas:HTMLCanvasElement,v:RenderView,width:number,height:number) {
    const ctx=prepareCanvas(canvas,width,height);ctx.fillStyle=v.dark?'#172333':'#ffffff';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.beginPath();ctx.rect(v.gutter,0,width-v.gutter,height);ctx.clip();
    const first=Math.max(0,Math.floor(v.y/v.rh)),last=Math.min(v.rows.length,Math.ceil((v.y+height)/v.rh));
    for(let i=first;i<last;i++)this.row(ctx,v,v.rows[i],i*v.rh-v.y,width);
    if(v.selection&&v.visibility?.selectionOverlay!==false){const x=v.gutter+(v.selection.start-1)*v.cw-v.x,w=(v.selection.end-v.selection.start+1)*v.cw;ctx.fillStyle='rgba(36,99,166,0.09)';ctx.fillRect(x,0,w,height);ctx.strokeStyle='#2463a6';ctx.lineWidth=1.5;ctx.strokeRect(x+.75,.75,w-1.5,height-1.5);}
    ctx.restore();ctx.fillStyle=v.dark?'#172333':'#f9fbfc';ctx.fillRect(0,0,v.gutter,height);ctx.strokeStyle=v.dark?'#354356':'#d7e0e7';ctx.beginPath();ctx.moveTo(v.gutter-.5,0);ctx.lineTo(v.gutter-.5,height);ctx.stroke();
  }
  tracks(canvas:HTMLCanvasElement,v:RenderView,width:number) {
    const tracks=trackLayout(v.visibility??{...defaultVisibility,logo:v.logo},v.rh),offset=tracks.offsets;
    const height=tracks.height,ctx=prepareCanvas(canvas,width,height),ink=v.dark?'#b7c8d9':'#607489',line=v.dark?'#354356':'#e6ebf0';
    ctx.fillStyle=v.dark?'#172333':'#ffffff';ctx.fillRect(0,0,width,height);ctx.save();ctx.beginPath();ctx.rect(v.gutter,0,width-v.gutter,height);ctx.clip();
    const start=Math.max(0,Math.floor(v.x/v.cw)),end=Math.min(v.a.width,Math.ceil((v.x+width-v.gutter)/v.cw));
    ctx.font='11px "Alignment Mono", monospace';ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='alphabetic';
    const tick=v.cw<5?50:v.cw<10?20:10;
    for(let c=start;c<end;c++) {
      const x=v.gutter+c*v.cw-v.x;
      if(offset.ruler!==null&&(c===0||(c+1)%tick===0)){ctx.fillStyle=ink;ctx.font='11px "Alignment Mono", monospace';ctx.fillText(String(c+1),x+v.cw/2,17);ctx.fillStyle=line;ctx.fillRect(x+v.cw/2,23,1,height-23);}
      if(!v.stats)continue;
      if(offset.modalFrequency!==null){ctx.fillStyle='#3a7da4';ctx.fillRect(x,offset.modalFrequency+22-(v.stats.frequency[c]||0)*20,Math.max(1,v.cw-1),(v.stats.frequency[c]||0)*20);}
      if(offset.gapFraction!==null){ctx.fillStyle='#c5a278';const gap=v.stats.total?v.stats.gaps[c]/v.stats.total:0;ctx.fillRect(x,offset.gapFraction+22-gap*18,Math.max(1,v.cw-1),gap*18);}
      if(offset.consensus!==null){
        const symbol=consensusSymbol(v.stats,v.a.alphabet,c,v.threshold??0),color=residueColor(symbol,getColorScheme(v.scheme),v.stats.support[c]);
        ctx.fillStyle=color;ctx.fillRect(x,offset.consensus+4,v.cw,27);
        if(v.cw>=9&&v.visibility?.residueLetters!==false){ctx.fillStyle=symbol==='-'?ink:textColor(color);ctx.font=`500 ${Math.min(14,v.cw-3)}px "Alignment Mono", monospace`;ctx.fillText(symbol==='-'?'·':symbol,x+v.cw/2,offset.consensus+22);}
      }
      if(offset.logo!==null&&v.cw>=6) {
        const counts=[];const n=v.stats.total-v.stats.gaps[c];
        for(let k=0;k<27;k++){const count=v.stats.counts[c*STRIDE+k];if(count)counts.push({r:SYMBOLS[k],n:count});}
        counts.sort((a,b)=>a.n-b.n);let bottom=offset.logo+37;
        for(const d of counts){const h=d.n/n*39;if(h<1)continue;ctx.save();ctx.translate(x,bottom-h);ctx.scale(v.cw/16,h/16);ctx.font='bold 18px "Alignment Mono", monospace';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle=residueColor(d.r,getColorScheme(v.scheme),1);ctx.fillText(d.r,8,17);ctx.restore();bottom-=h;}
      }
    }
    if(offset.reference!==null&&v.reference>=0)this.row(ctx,v,v.reference,offset.reference,width);
    if(v.selection&&v.visibility?.selectionOverlay!==false){ctx.strokeStyle='#2463a6';ctx.lineWidth=1.5;ctx.strokeRect(v.gutter+(v.selection.start-1)*v.cw-v.x+.75,.75,(v.selection.end-v.selection.start+1)*v.cw-1.5,height-1.5);}
    ctx.restore();return height;
  }
  overview(canvas:HTMLCanvasElement,v:RenderView,width:number) {
    const ctx=prepareCanvas(canvas,width,44),scheme=getColorScheme(v.scheme);ctx.fillStyle=v.dark?'#243244':'#e9eff4';ctx.fillRect(0,4,width,32);
    // Aggregate all rows into occupancy/frequency bins; no hidden row sampling.
    if(v.stats)for(let px=0;px<width;px++){
      const from=Math.floor(px*v.a.width/width),to=Math.min(v.a.width,Math.max(from+1,Math.floor((px+1)*v.a.width/width)));
      let support=0,occupancy=0;for(let c=from;c<to;c++){support+=v.stats.support[c]||0;occupancy+=v.stats.total?1-v.stats.gaps[c]/v.stats.total:0;}
      const h=occupancy/(to-from)*30;ctx.fillStyle=residueColor(String.fromCharCode(v.stats.consensus[from]),scheme,support/(to-from));ctx.fillRect(px,35-h,1,h);
    }
  }
}
