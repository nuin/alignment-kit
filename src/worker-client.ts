import { parseAlignment } from './parsers';
import { calculateStats, pairwiseIdentity, pairwiseMatrix } from './analysis';
import type { Alignment, AlignmentStats, ParseOptions, Identity } from './types';
export class WorkerTask {
  private worker?:Worker;
  private reject?: (error:Error)=>void;
  private timer?:ReturnType<typeof setTimeout>;
  constructor(private url?:string|URL, private enabled=true) {}
  cancel() {this.worker?.terminate();this.worker=undefined;if(this.timer)clearTimeout(this.timer);this.reject?.(new DOMException('Operation cancelled','AbortError'));this.reject=undefined;}
  run<T>(payload:Record<string,unknown>,fallback:()=>T):Promise<T> {
    this.cancel();
    return new Promise((resolve,reject)=>{
      this.reject=reject;
      const finish=(result:T)=>{this.worker?.terminate();this.worker=undefined;this.reject=undefined;resolve(result);};
      const fail=(error:Error)=>{this.worker?.terminate();this.worker=undefined;this.reject=undefined;reject(error);};
      if(!this.enabled || typeof Worker==='undefined') {
        this.timer=setTimeout(()=>{try{finish(fallback());}catch(e){fail(e as Error);}},0);return;
      }
      try {
        this.worker=this.url ? new Worker(this.url,{type:'module'}) : new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
        this.worker.onmessage=({data})=>data.error?fail(new Error(data.error)):finish(data.result);
        this.worker.onerror=()=>fail(new Error('The analysis worker could not start. Check the worker URL and your Content Security Policy, or explicitly use worker: false for small alignments.'));
        this.worker.postMessage(payload);
      } catch(error){fail(error as Error);}
    });
  }
  parse(text:string,options:ParseOptions):Promise<Alignment> {return this.run({kind:'parse',text,options},()=>parseAlignment(text,options));}
  stats(a:Alignment,rows?:number[]):Promise<AlignmentStats> {
    const compact={codes:a.codes,width:a.width,alphabet:a.alphabet,rows:{length:a.rows.length}};
    return this.run({kind:'stats',alignment:compact,rows},()=>calculateStats(a,rows));
  }
  pairwise(a:Alignment,rows:number[]):Promise<Identity[][]> {
    if(rows.length>200)return Promise.reject(new Error('Pairwise comparison is limited to 200 selected sequences.'));
    const compact={codes:a.codes,width:a.width,alphabet:a.alphabet,rows:a.rows.map(()=>true)};
    return this.run({kind:'pairwise',alignment:compact,rows},()=>pairwiseMatrix(a,rows));
  }
  identities(a:Alignment,reference:number,rows:number[]):Promise<Identity[]> {
    const compact={codes:a.codes,width:a.width,alphabet:a.alphabet,rows:a.rows.map(()=>true)};
    return this.run({kind:'identity',alignment:compact,reference,rows},()=>rows.map(row=>pairwiseIdentity(a,reference,row)));
  }
}
