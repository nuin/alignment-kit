import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { parseAlignment, calculateStats } from '../dist/index.js';

const catalog=JSON.parse(await readFile(new URL('../demo/public/alignments.json',import.meta.url),'utf8'));
for(const dataset of catalog){
  const packed=await readFile(new URL('../demo/public/'+dataset.file,import.meta.url));
  const bytes=packed[0]===31&&packed[1]===139?gunzipSync(packed):packed;
  assert.equal(packed.length,dataset.bytes,`${dataset.id}: file size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),dataset.source.sha256,`${dataset.id}: source hash`);
  const alignment=parseAlignment(bytes.toString('utf8'),{alphabet:dataset.alphabet,source:dataset.source});
  assert.equal(alignment.rows.length,dataset.rows);assert.equal(alignment.width,dataset.columns);
  assert.ok(alignment.metadata.stockholm.GF.AC.includes(dataset.accession));
  const stats=calculateStats(alignment);assert.equal(stats.total,dataset.rows);
  if(dataset.alphabet==='rna')assert.ok(alignment.rows.some(row=>row.sequence.toUpperCase().includes('U')));
  console.log(`${dataset.id}: verified ${dataset.rows.toLocaleString()} × ${dataset.columns} (${dataset.accession})`);
}
