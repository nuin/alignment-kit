import {it,expect,vi,afterEach} from 'vitest';
import {WorkerTask,spawnWorker} from '../src/worker-client';
import {parseAlignment} from '../src/parsers';
class FakeWorker {
  static made:FakeWorker[]=[];
  onmessage?:(event:{data:unknown})=>void;onerror?:()=>void;terminated=false;
  constructor(public url?:unknown,public init?:{type?:string}){FakeWorker.made.push(this);}
  postMessage(data:any){queueMicrotask(()=>this.onmessage?.({data:{result:{echo:data.kind}}}));}
  terminate(){this.terminated=true;}
}
afterEach(()=>{FakeWorker.made=[];vi.unstubAllGlobals();});
it('calls a workerUrl factory once per job and terminates the worker it returned',async()=>{
  vi.stubGlobal('Worker',class{constructor(){throw new Error('The default worker must not start.');}});
  const factory=vi.fn(()=>new FakeWorker() as unknown as Worker),task=new WorkerTask(factory);
  expect(await task.parse('>a\nAC',{})).toEqual({echo:'parse'});
  expect(await task.stats(parseAlignment('>a\nAC'))).toEqual({echo:'stats'});
  expect(factory).toHaveBeenCalledTimes(2);expect(FakeWorker.made.every(w=>w.terminated)).toBe(true);
});
it('starts a module worker for a string or URL source',()=>{
  vi.stubGlobal('Worker',FakeWorker);
  spawnWorker('/assets/worker.js');spawnWorker(new URL('https://example.org/worker.js'));
  expect(FakeWorker.made.map(w=>[String(w.url),w.init?.type])).toEqual([['/assets/worker.js','module'],['https://example.org/worker.js','module']]);
});
it('falls back to the sibling worker.js module when no source is given',()=>{
  vi.stubGlobal('Worker',FakeWorker);spawnWorker();
  expect(String(FakeWorker.made[0].url)).toMatch(/\/worker\.js$/);expect(FakeWorker.made[0].init?.type).toBe('module');
});
it('starts the inlined worker from one blob URL when the build defines its source',()=>{
  vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('__MSA_CANVAS_WORKER__','self.onmessage=()=>{}');
  const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:inline');
  try{spawnWorker();spawnWorker();expect(create).toHaveBeenCalledOnce();expect(FakeWorker.made.map(w=>[w.url,w.init])).toEqual([['blob:inline',undefined],['blob:inline',undefined]]);}
  finally{create.mockRestore();}
});
it('rejects with the factory error and keeps the main-thread path when workers are off',async()=>{
  vi.stubGlobal('Worker',FakeWorker);
  await expect(new WorkerTask(()=>{throw new Error('blocked');}).parse('>a\nAC',{})).rejects.toThrow('blocked');
  const factory=vi.fn(),parsed=await new WorkerTask(factory as never,false).parse('>a\nAC',{});
  expect(parsed.width).toBe(2);expect(factory).not.toHaveBeenCalled();
});
