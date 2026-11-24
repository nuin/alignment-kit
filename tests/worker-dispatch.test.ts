import {it,expect,beforeAll,vi} from 'vitest';
import {parseAlignment} from '../src/parsers';
const post=vi.fn(),scope:{postMessage:typeof post;onmessage?:(e:{data:unknown})=>void}={postMessage:post};
beforeAll(async()=>{vi.stubGlobal('self',scope);await import('../src/worker.js');});
const request=(data:unknown)=>{post.mockClear();scope.onmessage!({data});return post.mock.calls[0] as [{result?:any;error?:string},ArrayBuffer[]?];};
const a=parseAlignment('>a\nA-CG\n>b\nATCG\n>c\nAT-G',{alphabet:'dna'});
it('parses text and transfers the code buffer',()=>{
  const [message,transfer]=request({kind:'parse',text:'>a\nA-\n>b\nAC',options:{alphabet:'dna'}});
  expect(message.result.width).toBe(2);expect(transfer).toEqual([message.result.codes.buffer]);
});
it('dispatches stats, pairwise, identity, summary and search requests',()=>{
  const [stats,transfer]=request({kind:'stats',alignment:a});
  expect(Array.from(stats.result.gaps)).toEqual([0,1,1,0]);expect(transfer!.length).toBeGreaterThan(0);
  expect(request({kind:'pairwise',alignment:a,rows:[0,1]})[0].result[0][1]).toEqual({matches:3,compared:3,identity:1});
  expect(request({kind:'identity',alignment:a,reference:0,rows:[1,2]})[0].result.map((r:any)=>r.identity)).toEqual([1,1]);
  expect(request({kind:'summary',alignment:a,scope:{}})[0].error).toBeUndefined();
  expect(request({kind:'search',alignment:a,pattern:'CG',options:{strands:'forward'}})[0].result.hits.map((h:any)=>h.rowId)).toEqual(['seq-1','seq-2']);
});
it('posts the error message for unknown kinds and for failing jobs',()=>{
  expect(request({kind:'nope'})).toEqual([{error:'Unknown worker request.'}]);
  expect(request({kind:'search',alignment:a,pattern:'/(/',options:{}})[0].error).toMatch(/regular expression/);
  expect(request({kind:'parse',text:'',options:{}})[0].error).toEqual(expect.any(String));
});
