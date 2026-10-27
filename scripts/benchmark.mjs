import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createAlignment,calculateStats,parseAlignment,AnnotationIndex } from '../dist/index.js';
const results=[];
const measure=(name,fn)=>{const start=performance.now(),value=fn();return {value,ms:+(performance.now()-start).toFixed(2)};};
for(const [rows,width,features] of [[10000,1000,0],[1000,10000,0],[50000,300,0],[10000,1000,100000]]) {
  global.gc?.();const before=process.memoryUsage().rss;
  const generated=measure('generate',()=>{
    const motif='ACDEFGHIKLMNPQRSTVWY-',base=motif.repeat(Math.ceil(width/motif.length)).slice(0,width);
    return Array.from({length:rows},(_,i)=>({name:`Synthetic ${i}`,sequence:base.slice(0,i%width)+'A'+base.slice(i%width+1)}));
  });
  const model=measure('model',()=>createAlignment(generated.value,{alphabet:'protein'}));
  const stats=measure('stats',()=>calculateStats(model.value));
  const annotations=Array.from({length:features},(_,i)=>({id:`a${i}`,rowId:model.value.rows[i%rows].id,label:'Synthetic',mapping:'mapped',start:i%width+1,end:i%width+1}));
  const indexed=measure('index',()=>new AnnotationIndex(annotations));
  const queried=measure('queries',()=>{let hits=0;for(let i=0;i<10000;i++)hits+=indexed.value.query(model.value.rows[i%rows].id,1,80).length;return hits;});
  results.push({rows,columns:width,annotations:features,generationMs:generated.ms,modelMs:model.ms,statisticsMs:stats.ms,annotationIndexMs:indexed.ms,tenThousandQueriesMs:queried.ms,rssIncreaseMiB:+((process.memoryUsage().rss-before)/1048576).toFixed(1),statsRows:stats.value.total});
}
const cbs=parseAlignment(await readFile('demo/public/cbs-seed.sto','utf8'),{alphabet:'protein'});
const report={date:new Date().toISOString(),environment:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,ramGiB:+(os.totalmem()/1073741824).toFixed(1),node:process.version},method:'Single cold run per fixture in one Node process. Timings exclude browser layout, paint, worker messaging and file fetch. RSS delta is not peak/browser memory. Synthetic sequences use a repeated motif with a deterministic per-row change. No FPS or first-usable-browser claims.',realFixture:{rows:cbs.rows.length,columns:cbs.width},results};
await mkdir('docs',{recursive:true});await writeFile('docs/benchmark-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
