import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlignmentViewer } from '../../src/react';
import { sample } from '../shared';
import type { Selection } from '../../src/types';
import '../../src/style.css';import '../../src/fonts.css';import '../style.css';
function App(){
  const [count,setCount]=useState(4),[dark,setDark]=useState(false),[mounted,setMounted]=useState(true),[selection,setSelection]=useState<Selection|null>(null);
  const alignment=useMemo(()=>sample(count),[count]);
  const options=useMemo(()=>({height:650,workerUrl:(window as any).__ALIGNMENT_PREVIEW__?.workerUrl,theme:dark?'dark' as const:'light' as const}),[dark]);
  return <main><a href="/">Alignment Kit</a><h1>React integration</h1><p>The same viewer, managed by React. This example runs in StrictMode and updates props without remounting the alignment.</p><div className="example-actions"><button onClick={()=>setCount(c=>c===4?6:4)}>Change dataset</button><button onClick={()=>setDark(d=>!d)}>Change theme</button><button onClick={()=>setMounted(m=>!m)}>{mounted?'Unmount viewer':'Mount viewer'}</button><output data-testid="selection">Selection: {selection?`${selection.start}–${selection.end}`:'none'}</output></div>{mounted&&<AlignmentViewer alignment={alignment} options={options} onSelectionChange={setSelection} onError={console.error}/>}<pre>{`<AlignmentViewer\n  alignment={alignment}\n  options={{ height: 650, theme: 'light' }}\n  onSelectionChange={setSelection}\n/>`}</pre><a href="/examples/svelte/">See the Svelte integration</a></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
