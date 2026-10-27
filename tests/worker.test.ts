import {it,expect} from 'vitest';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { parseAlignment } from '../src/parsers';
async function request(payload:unknown) {
  const bundle=await build({entryPoints:['src/worker.js'],bundle:true,format:'iife',write:false});
  const source=`const {parentPort}=require('node:worker_threads');global.self={postMessage:(value,transfer)=>parentPort.postMessage(value,transfer)};${bundle.outputFiles[0].text};parentPort.on('message',data=>self.onmessage({data}));`;
  const worker=new Worker(source,{eval:true});
  try{return await new Promise<any>((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(payload);});}finally{await worker.terminate();}
}
it('executes parsing and exact statistics through the actual worker message protocol',async()=>{
  const parsed=await request({kind:'parse',text:'>a\nA-\n>b\nAC',options:{alphabet:'dna'}});
  expect(parsed.result.width).toBe(2);expect(parsed.result.codes).toBeInstanceOf(Uint8Array);
  const a=parsed.result;
  const stats=await request({kind:'stats',alignment:{codes:a.codes,width:a.width,alphabet:a.alphabet,rows:{length:a.rows.length}}});
  expect(Array.from(stats.result.gaps)).toEqual([0,1]);expect(stats.result.total).toBe(2);
});
it('calculates bounded pairwise comparisons off-thread',async()=>{
  const a=parseAlignment('>a\nACN\n>b\nATN',{alphabet:'dna'});
  const response=await request({kind:'pairwise',alignment:a,rows:[0,1]});
  expect(response.error).toBeUndefined();
  expect(response.result[0][1]).toEqual({matches:1,compared:2,identity:0.5});
});
