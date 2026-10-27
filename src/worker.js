import { parseAlignment } from './parsers';
import { calculateStats, pairwiseIdentity, pairwiseMatrix } from './analysis';
self.onmessage = ({data}) => {
  try {
    let result;
    if(data.kind==='parse') result=parseAlignment(data.text,data.options);
    else if(data.kind==='stats') result=calculateStats(data.alignment,data.rows);
    else if(data.kind==='pairwise') result=pairwiseMatrix(data.alignment,data.rows);
    else if(data.kind==='identity') result=data.rows.map(row=>pairwiseIdentity(data.alignment,data.reference,row));
    else throw new Error('Unknown worker request.');
    const transfer=[];
    for(const value of Object.values(result)) if(ArrayBuffer.isView(value)) transfer.push(value.buffer);
    self.postMessage({result},transfer);
  } catch(error) { self.postMessage({error:error instanceof Error?error.message:String(error)}); }
};
