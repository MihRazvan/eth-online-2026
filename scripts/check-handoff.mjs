import { readFileSync } from 'node:fs';
for (const file of ['START_HERE.md', 'PRODUCT_CONTRACT.md', 'README.md']) {
  const text = readFileSync(new URL(`../feestrip-handoff/${file}`, import.meta.url), 'utf8');
  if (text.length < 500) throw new Error(`Incomplete handoff: ${file}`);
}
console.log('Baseline packet preserved. Financial acceptance gates remain pending.');
