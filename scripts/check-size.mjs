// Gzip size of each built entry plus its static chunks against scripts/size-budget.json (bytes). Run after `npm run build`.
import { readFileSync } from 'node:fs';
import { sizeRows, sizeTable, overBudget } from './package-tools.mjs';
const rows=sizeRows(JSON.parse(readFileSync('scripts/size-budget.json','utf8')),path=>readFileSync(`dist/${path}`)),over=overBudget(rows);
console.log(sizeTable(rows));
if(over.length){console.error(`Over the gzip budget: ${over.map(row=>`${row.entry} by ${row.gzip-row.limit} bytes`).join(', ')}. Shrink the entry or raise its limit in scripts/size-budget.json.`);process.exit(1);}
console.log(`All ${rows.length} entries are within their gzip budgets.`);
