import { parseAlignment } from './parsers';
import { calculateStats, pairwiseIdentity, pairwiseMatrix } from './analysis';
import { findHits, MAX_SEARCH_MS } from './search';
import { analyzeColumns, type ColumnAnalysis } from './summary';
import type { Alignment, AlignmentStats, ColumnScope, ParseOptions, Identity, SearchOptions, SearchResult } from './types';
/** Grace after the in-worker 2 s budget for worker start-up and transfer; past it a regex stuck in one exec call is terminated. */
export const SEARCH_TIMEOUT_MS=MAX_SEARCH_MS+500;
/** Rejection name when a worker job runs past its hard timeout and is terminated. */
export const TIMEOUT_ERROR='TimeoutError';
export class WorkerTask {
  private worker?:Worker;
  private reject?: (error:Error)=>void;
  private timer?:ReturnType<typeof setTimeout>;
  constructor(private url?:string|URL, private enabled=true) {}
  cancel() {this.worker?.terminate();this.worker=undefined;if(this.timer)clearTimeout(this.timer);this.reject?.(new DOMException('Operation cancelled','AbortError'));this.reject=undefined;}
  /** Run `payload` in a fresh module worker, or `fallback` on the main thread when workers are off. `timeout` terminates the worker and rejects with a TimeoutError; it cannot stop the main-thread fallback. */
  run<T>(payload:Record<string,unknown>,fallback:()=>T,timeout?:{ms:number;message:string}):Promise<T> {
    this.cancel();
    return new Promise((resolve,reject)=>{
      this.reject=reject;
      const finish=(result:T)=>{clearTimeout(this.timer);this.worker?.terminate();this.worker=undefined;this.reject=undefined;resolve(result);};
      const fail=(error:Error)=>{clearTimeout(this.timer);this.worker?.terminate();this.worker=undefined;this.reject=undefined;reject(error);};
      if(!this.enabled || typeof Worker==='undefined') {
        this.timer=setTimeout(()=>{try{finish(fallback());}catch(e){fail(e as Error);}},0);return;
      }
      try {
        this.worker=this.url ? new Worker(this.url,{type:'module'}) : new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
        this.worker.onmessage=({data})=>data.error?fail(new Error(data.error)):finish(data.result);
        this.worker.onerror=()=>fail(new Error('The analysis worker could not start. Check the worker URL and your Content Security Policy, or explicitly use worker: false for small alignments.'));
        this.worker.postMessage(payload);
        if(timeout)this.timer=setTimeout(()=>{const error=new Error(timeout.message);error.name=TIMEOUT_ERROR;fail(error);},timeout.ms);
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
  /** Column summary and variable-column list for `scope`, computed off the main thread. */
  summary(a:Alignment,scope:ColumnScope):Promise<ColumnAnalysis> {
    const compact={codes:a.codes,width:a.width,alphabet:a.alphabet,rows:a.rows.map(r=>({id:r.id,name:r.name,metadata:{start:r.metadata?.start}}))};
    return this.run({kind:'summary',alignment:compact,scope},()=>analyzeColumns(a,scope));
  }
  /** Run findHits off the main thread; a pattern still running after SEARCH_TIMEOUT_MS is terminated with a TimeoutError. */
  search(a:Alignment,pattern:string,options:SearchOptions):Promise<SearchResult> {
    const compact={codes:a.codes,width:a.width,alphabet:a.alphabet,rows:a.rows.map(r=>({id:r.id}))};
    return this.run({kind:'search',alignment:compact,pattern,options},()=>findHits(a,pattern,options),{ms:SEARCH_TIMEOUT_MS,message:`Search stopped after ${MAX_SEARCH_MS/1000} s; simplify the pattern.`});
  }
}
