import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import { sampleMemory, browserRss } from './browser-memory.mjs';

const pilot=process.argv.includes('--pilot'),repetitions=pilot?1:3;
const fixtures=pilot?[[10000,1000,0]]:[[10000,1000,0],[1000,10000,0],[50000,300,0],[10000,1000,100000]];
const outDir='.preview/browser-benchmark';
await build({configFile:false,publicDir:false,logLevel:'warn',build:{outDir,rollupOptions:{input:'scripts/browser-benchmark.html'}}});
const server=await preview({configFile:false,build:{outDir},preview:{host:'127.0.0.1',port:4180,strictPort:true}});
let browserServer;
const report={date:new Date().toISOString(),pilot,environment:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,ramGiB:os.totalmem()/2**30,node:process.version},method:{viewport:{width:1440,height:1000},warmupsPerFixture:1,measuredRuns:repetitions,scrollMs:10000,startup:'FASTA text and annotations resident before timer; load includes parsing, workers, exact statistics, annotation indexing, two animation frames, keyboard input and repaint.',memory:'Sum of browser and descendant process RSS sampled about every 100 ms, including worker processes; shared pages can be counted more than once, peaks between samples may be missed. Baseline after input preparation and forced GC. Not a portable heap measurement.',frames:'requestAnimationFrame intervals during scripted two-axis scrolling; includes DOM-bound checks and concurrent memory sampling. Headless Chromium; not a compositor/GPU presentation measurement.'},results:[]};
const output=pilot?'docs/browser-benchmark-pilot.json':'docs/browser-benchmark-results.json';
try {
  browserServer=await chromium.launchServer();
  const browser=await chromium.connect(browserServer.wsEndpoint());
  report.environment.browser=browser.version();
  const pid=browserServer.process().pid;
  for(const [rows,columns,annotations] of fixtures) {
    const context=await browser.newContext({viewport:report.method.viewport});
    const page=await context.newPage(),errors=[];let workers=0;
    page.on('pageerror',error=>errors.push(error.message));page.on('worker',()=>workers++);
    await page.goto('http://127.0.0.1:4180/scripts/browser-benchmark.html');
    await page.waitForFunction(()=>!!window.alignmentBenchmark);
    const cdp=await context.newCDPSession(page);
    await page.evaluate(([r,c,a])=>window.alignmentBenchmark.prepare(r,c,a),[rows,columns,annotations]);
    const runs=[];
    for(let run=0;run<=repetitions;run++) {
      if(run){await page.evaluate(()=>window.alignmentBenchmark.dispose());await page.evaluate(()=>window.alignmentBenchmark.mount());}
      await cdp.send('HeapProfiler.collectGarbage');
      const measured=await sampleMemory(pid,async()=>({startupMs:await page.evaluate(()=>window.alignmentBenchmark.load()),...await page.evaluate(()=>window.alignmentBenchmark.pan(10000))}));
      if(errors.length)throw new Error(errors.join('\n'));
      if(run)runs.push({...measured.value,memory:measured.memory});
      console.log(`${rows} × ${columns}, ${annotations} annotations: ${run?'run '+run:'warm-up'} ${measured.value.startupMs.toFixed(0)} ms; p95 ${measured.value.p95FrameMs.toFixed(1)} ms; RSS +${measured.memory.increaseMiB.toFixed(1)} MiB`);
    }
    if(!workers)throw new Error('No module workers ran');
    report.results.push({rows,columns,annotations,workers,runs});
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
    if(rows===10000&&annotations===0&&!pilot) {
      const cycles=[];
      for(let i=0;i<10;i++) {
        if(await page.evaluate(()=>window.alignmentBenchmark.dispose())!==0)throw new Error('Viewer DOM survives destroy');
        await cdp.send('HeapProfiler.collectGarbage');
        const heap=await cdp.send('Runtime.getHeapUsage');cycles.push({cycle:i+1,usedHeapMiB:heap.usedSize/2**20,rssMiB:await browserRss(pid),workers:page.workers().length});
        if(i<9){await page.evaluate(()=>window.alignmentBenchmark.mount());await page.evaluate(()=>window.alignmentBenchmark.load());}
      }
      report.lifecycle={cycles,method:'Ten destroy/GC samples with the same input retained; reload between samples. Worker count and DOM removal checked each cycle.'};
      if(cycles.some(c=>c.workers!==0))throw new Error('Worker survives destroy');
    }
    await context.close();
  }
  report.acceptance={primary:report.results[0].runs.every(r=>r.startupMs<5000&&r.p95FrameMs<33&&r.memory.increaseMiB<512)};
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Report: ${output}`);
  if(!report.acceptance.primary)process.exitCode=1;
} finally {await browserServer?.close();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
