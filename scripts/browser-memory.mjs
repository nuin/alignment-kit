import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);

export async function browserRss(pid) {
  const {stdout}=await exec('ps',['-axo','pid=,ppid=,rss=']);
  const rows=stdout.trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
  const descendants=new Set([pid]);let changed=true;
  while(changed){changed=false;for(const [id,parent] of rows)if(descendants.has(parent)&&!descendants.has(id)){descendants.add(id);changed=true;}}
  const found=rows.filter(([id])=>descendants.has(id));
  if(!found.some(([id])=>id===pid))throw new Error('Benchmark browser process is missing');
  return found.reduce((total,[,,rss])=>total+rss,0)/1024;
}

export async function sampleMemory(pid,work) {
  const baselineMiB=await browserRss(pid),samples=[baselineMiB];let stopped=false;
  const sampling=(async()=>{
    while(!stopped){samples.push(await browserRss(pid));await new Promise(resolve=>setTimeout(resolve,100));}
  })();
  try {
    const value=await work();samples.push(await browserRss(pid));
    return {value,memory:{baselineMiB,peakMiB:Math.max(...samples),increaseMiB:Math.max(...samples)-baselineMiB,samples:samples.length}};
  } finally {stopped=true;await sampling;}
}
