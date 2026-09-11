import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const names=['FeeStrip','FeeClaim','HistoricalFeeVerifier','BlockHashCheckpoints','FeeStripMarket','FeeStripRouter','Aqua','PositionManager','PoolManager','LocalToken'];
const folder=n=>n==='LocalToken'?'LocalFixtures':n;
const file=n=>`contracts/out/${folder(n)}.sol/${n}${existsSync(`contracts/out/${folder(n)}.sol/${n}.json`)?'':'.0.8.26'}.json`;
mkdirSync('apps/web/src/generated',{recursive:true});
let output='// Generated from pinned Foundry artifacts. Run pnpm generate:abis.\n';
for(const name of names){const a=JSON.parse(readFileSync(file(name)));output+=`export const ${name[0].toLowerCase()+name.slice(1)}Abi = ${JSON.stringify(a.abi)} as const;\n`;}
writeFileSync('apps/web/src/generated/contracts.ts',output);
const abi=JSON.parse(readFileSync('contracts/out/FeeStrip.sol/FeeStrip.json')).abi;
writeFileSync('packages/subgraph/abis/FeeStrip.json',JSON.stringify(abi,null,2)+'\n');
