import {it,expect} from 'vitest';
import {build} from 'esbuild';
import {threadWorkers} from '../scripts/thread-worker.mjs';
const host=()=>({URL:{} as {createObjectURL:(blob:Blob)=>string},Worker:undefined as any});
const reply=(worker:any,payload:unknown)=>new Promise<any>((resolve,reject)=>{worker.onmessage=({data}:{data:unknown})=>resolve(data);worker.onerror=reject;worker.postMessage(payload);});
it('runs a blob URL worker in a thread and records the job',async()=>{
  const window=host(),threads=threadWorkers(window);
  const url=window.URL.createObjectURL(new Blob(['"use strict";(()=>{self.onmessage=({data})=>self.postMessage({result:{twice:data.n*2}})})();']));
  try{
    expect(url).toMatch(/^blob:/);expect(await reply(new window.Worker(url),{kind:'double',n:21})).toEqual({result:{twice:42}});
    expect(threads.jobs).toEqual([{url,kind:'double',ok:true}]);
  }finally{await threads.stop();}
});
it('marks a job that answered with an error and rejects an unknown URL',async()=>{
  const window=host(),threads=threadWorkers(window);
  const url=window.URL.createObjectURL(new Blob(['self.onmessage=()=>self.postMessage({error:"no"})']));
  try{
    expect(await reply(new window.Worker(url),{kind:'parse'})).toEqual({error:'no'});expect(threads.jobs[0].ok).toBe(false);
    expect(()=>new window.Worker('blob:other')).toThrow('No blob registered for blob:other.');
  }finally{await threads.stop();}
});
it('starts no thread for a worker terminated before its source was read',async()=>{
  const window=host(),threads=threadWorkers(window),worker=new window.Worker(window.URL.createObjectURL(new Blob(['self.onmessage=()=>self.postMessage({result:1})'])));
  let answered=false;worker.onmessage=()=>{answered=true;};worker.postMessage({kind:'parse'});worker.terminate();
  await new Promise(done=>setTimeout(done,50));await threads.stop();
  expect(answered).toBe(false);expect(threads.jobs).toEqual([{url:'blob:thread/0',kind:'parse',ok:false}]);
});
it('runs the minified classic worker bundle, as the build writes it, through a blob URL',async()=>{
  const bundle=await build({entryPoints:['src/worker.js'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false});
  const window=host(),threads=threadWorkers(window),url=window.URL.createObjectURL(new Blob([bundle.outputFiles[0].text],{type:'text/javascript'}));
  try{
    const parsed=await reply(new window.Worker(url),{kind:'parse',text:'>a\nA-\n>b\nAC',options:{alphabet:'dna'}});
    expect(parsed.result.width).toBe(2);expect(parsed.result.rows).toHaveLength(2);expect(parsed.result.codes).toBeInstanceOf(Uint8Array);
    expect((await reply(new window.Worker(url),{kind:'nothing'})).error).toBe('Unknown worker request.');
    expect(threads.jobs.map(job=>[job.kind,job.ok])).toEqual([['parse',true],['nothing',false]]);
  }finally{await threads.stop();}
});
