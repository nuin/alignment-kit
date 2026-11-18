import { createViewer, type AlignmentViewer, type Annotation } from '../dist/index.js';
import '../dist/style.css';
import { syntheticAlignment } from '../demo/fixtures';

let viewer:AlignmentViewer|undefined;
let input='';
let annotations:Annotation[]=[];
const host=document.querySelector<HTMLElement>('#viewer')!;
const painted=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));

function mount() {viewer=createViewer(host,{height:740,focusFirstVariant:false});}
function prepare(rows:number,columns:number,features:number) {
  const a=syntheticAlignment(rows,columns,features);
  input=a.rows.map(r=>`>${r.name}\n${r.sequence}`).join('\n');
  const ids=new Map(a.rows.map((row,i)=>[row.id,`seq-${i+1}`]));
  annotations=a.annotations.map(a=>({...a,rowId:a.rowId?ids.get(a.rowId):undefined}));
}
async function load() {
  const current=viewer!;
  const start=performance.now();
  await current.load(input,{alphabet:'protein'});
  if(annotations.length)current.addAnnotations(annotations);
  await painted();
  const grid=host.querySelector<HTMLElement>('.ak-scroll')!;
  grid.focus();grid.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  await painted();
  if(current.getState().selection?.start!==2)throw new Error('Viewport did not respond to keyboard input');
  if(!current.getStatistics())throw new Error('Statistics did not finish');
  return performance.now()-start;
}
async function pan(duration:number) {
  const grid=host.querySelector<HTMLElement>('.ak-scroll')!,intervals:number[]=[];
  let previous=performance.now();const start=previous;
  let frames=0,maxLabels=0,maxElements=0;
  await new Promise<void>(resolve=>{
    function frame(now:number) {
      intervals.push(now-previous);previous=now;frames++;
      const progress=(now-start)/duration,cycle=(1-Math.cos(progress*Math.PI*4))/2;
      grid.scrollTop=cycle*(grid.scrollHeight-grid.clientHeight);
      grid.scrollLeft=(1-Math.cos(progress*Math.PI*6))/2*(grid.scrollWidth-grid.clientWidth);
      maxLabels=Math.max(maxLabels,host.querySelectorAll('.ak-row-label').length);
      maxElements=Math.max(maxElements,host.querySelectorAll('*').length);
      if(now-start>=duration)resolve();else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  intervals.sort((a,b)=>a-b);
  return {durationMs:previous-start,frames,p95FrameMs:intervals[Math.ceil(intervals.length*.95)-1],maxFrameMs:intervals.at(-1),maxLabels,maxElements};
}
async function dispose() {viewer?.destroy();viewer=undefined;await painted();return host.childElementCount;}
mount();
Object.assign(window,{alignmentBenchmark:{prepare,load,pan,dispose,mount}});
