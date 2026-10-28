// @vitest-environment jsdom
import {it,expect,beforeAll,afterEach,vi} from 'vitest';
import {createAlignment} from '../src/model';
import {createViewer} from '../src/viewer';
import {findHits} from '../src/search';
import {SEARCH_TIMEOUT_MS} from '../src/worker-client';
const disposers:(()=>void)[]=[];
beforeAll(()=>{
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(()=>{disposers.splice(0).forEach(d=>d());document.body.replaceChildren();vi.useRealTimers();vi.stubGlobal('Worker',undefined);});
const host=()=>{const el=document.createElement('div');document.body.append(el);return el;};
const dna=(...rows:string[])=>createAlignment(rows.map((sequence,i)=>({name:`r${i+1}`,sequence})),{alphabet:'dna'});
/** Stand-in for a module worker: `reply` answers a posted job, or leaves it running forever when it returns undefined. */
function fakeWorker(reply:(data:any)=>unknown) {
  const made:{terminate:ReturnType<typeof vi.fn>;payload?:any}[]=[];
  vi.stubGlobal('Worker',class{
    onmessage?:(event:{data:unknown})=>void;onerror?:()=>void;terminate=vi.fn();
    constructor(){made.push(this as any);}
    postMessage(payload:any){(this as any).payload=payload;const result=reply(payload);if(result!==undefined)queueMicrotask(()=>this.onmessage?.({data:{result}}));}
  });
  return made;
}
const viewerFor=async(rows:string[]):Promise<any>=>{const v=createViewer(host(),{worker:false});disposers.push(()=>v.destroy());await v.setAlignment(dna(...rows));return v;};

it('runs the scan in the search worker when workers are enabled',async()=>{
  const v=createViewer(host());disposers.push(()=>v.destroy());
  const a=dna('ACGTACGT','TTTTTTTT');await v.setAlignment(a);
  const made=fakeWorker(data=>findHits(a,data.pattern,data.options));
  const result=await v.search('ACG',{strands:'forward'});
  expect(result.hits.map((h:any)=>[h.rowId,h.start])).toEqual([['seq-1',1],['seq-1',5]]);
  expect(made).toHaveLength(1);expect(made[0].payload).toMatchObject({kind:'search',pattern:'ACG',options:{strands:'forward'}});
  expect(made[0].payload.alignment.rows).toEqual([{id:'seq-1'},{id:'seq-2'}]);expect(made[0].terminate).toHaveBeenCalled();
});
it('keeps the main-thread path with worker:false and never starts a worker',async()=>{
  const made=fakeWorker(()=>undefined),v=await viewerFor(['ACGTACGT','TTACGTTT']);
  const result=await v.search('ACG',{strands:'forward'});
  expect(result).toEqual({hits:v.getSearchHits(),truncated:false});expect(result.hits).toHaveLength(3);expect(made).toHaveLength(0);
});
it('terminates a search worker stuck past the timeout, reports it and leaves no hits',async()=>{
  const v=createViewer(host());disposers.push(()=>v.destroy());
  const a=dna('ACGTACGT');await v.setAlignment(a);
  let stuck=false;const made=fakeWorker(data=>stuck?undefined:findHits(a,data.pattern,data.options));
  await v.search('ACG',{strands:'forward'});expect(v.getSearchHits()).toHaveLength(2);
  const errors=vi.fn(),searches=vi.fn();v.on('error',errors);v.on('search',searches);
  vi.useFakeTimers();stuck=true;
  const pending=v.search('/.*.*.*.*.*.*.*.*.*.*.*.*X/');const outcome=expect(pending).rejects.toThrow(/Search stopped after 2 s; simplify the pattern/);
  await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS-1);expect(made.at(-1)!.terminate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);await outcome;
  expect(made.at(-1)!.terminate).toHaveBeenCalled();expect(v.getSearchHits()).toEqual([]);expect(searches).toHaveBeenLastCalledWith(null);
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({name:'TimeoutError'}));
  expect((v as any).root.querySelector('.ak-message').textContent).toMatch(/Search stopped after 2 s/);
  stuck=false;vi.useRealTimers();
  expect((await v.search('ACG',{strands:'forward'})).hits).toHaveLength(2);expect(made.length).toBeGreaterThan(2);
});
it('discards a search replaced by a newer one or by clearSearch',async()=>{
  const v=createViewer(host());disposers.push(()=>v.destroy());
  const a=dna('ACGTACGT');await v.setAlignment(a);
  const made=fakeWorker(()=>undefined);
  const first=v.search('ACG');const firstOutcome=expect(first).rejects.toMatchObject({name:'AbortError'});
  const second=v.search('CGT');await firstOutcome;expect(made[0].terminate).toHaveBeenCalled();
  v.clearSearch();await expect(second).rejects.toMatchObject({name:'AbortError'});
  expect(made[1].terminate).toHaveBeenCalled();expect(v.getSearchHits()).toEqual([]);
});
it('rejects an invalid or nested pattern before starting a worker',async()=>{
  const v=createViewer(host());disposers.push(()=>v.destroy());await v.setAlignment(dna('ACGT'));
  const made=fakeWorker(()=>undefined);
  await expect(v.search('/(A+)+B/')).rejects.toThrow(/Nested repetition/);
  await expect(v.search('/(/')).rejects.toThrow(/regular expression/);expect(made).toHaveLength(0);
});
