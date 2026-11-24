// Blob-URL classic workers for a window that has none (jsdom), each run in a node:worker_threads thread; tests/thread-worker.test.ts covers it.
import { Worker } from 'node:worker_threads';
const wrap=text=>`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=(value,transfer)=>parentPort.postMessage(value,transfer);${text}\n;parentPort.on('message',data=>self.onmessage?.({data}));`;
const read=(window,blob)=>typeof blob.text==='function'?blob.text():new Promise((done,fail)=>{const reader=new window.FileReader();reader.onload=()=>done(reader.result);reader.onerror=()=>fail(reader.error);reader.readAsText(blob);});
/** Install `URL.createObjectURL` and `Worker` on `window`. `jobs` holds one record per worker: its blob URL, the `kind` of the request posted and whether a thread answered with a result. `stop()` terminates every thread. */
export function threadWorkers(window) {
  const blobs=new Map(),jobs=[],live=new Set();let count=0;
  window.URL.createObjectURL=blob=>{const url=`blob:thread/${count++}`;blobs.set(url,blob);return url;};
  window.Worker=class {
    constructor(url) {
      const blob=blobs.get(String(url));if(!blob)throw new Error(`No blob registered for ${url}.`);
      this.job={url:String(url),kind:undefined,ok:false};jobs.push(this.job);
      this.thread=read(window,blob).then(text=>{
        if(this.dead)return;
        const thread=new Worker(wrap(text),{eval:true});live.add(thread);
        thread.on('message',data=>{this.job.ok=!data?.error;this.onmessage?.({data});});
        thread.on('error',error=>this.onerror?.(error));thread.on('exit',()=>live.delete(thread));
        return thread;
      });
    }
    postMessage(data) {this.job.kind=data?.kind;void this.thread.then(thread=>thread?.postMessage(data));}
    terminate() {this.dead=true;void this.thread.then(thread=>thread?.terminate());}
  };
  return {jobs,stop:()=>Promise.all([...live].map(thread=>thread.terminate()))};
}
