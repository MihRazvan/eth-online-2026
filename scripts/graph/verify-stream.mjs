import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createPublicClient, http, parseAbi } from 'viem';
import { DatabaseSync } from 'node:sqlite';
import { SubstreamsHistorySink } from '../../packages/data/src/substreams.mjs';
import { createSubstream } from '@substreams/core';
import { configurePackage } from '../../packages/substreams/sink/run.mjs';
import { validateConfig } from './stream-service.mjs';
import { querySubgraph } from '../../packages/data/src/compose.mjs';

export function readRetainedWindow(db,tail){
  assert.ok(tail===undefined||Number.isSafeInteger(tail)&&tail>=1&&tail<=100,'Tail must be between1and100');
  const extent=db.prepare('SELECT count(*) AS count,min(number) AS first,max(number) AS last FROM blocks').get();
  assert.ok(extent.count>0,'No retained history');
  assert.equal(extent.count,extent.last-extent.first+1,'Retained history contains a gap');
  assert.ok(tail!==undefined||extent.count<=100,'Qualification expects1–100savedblocks; use explicit --tail for longer history');
  const rows = db.prepare('SELECT number,hash,cursor FROM blocks ORDER BY number DESC LIMIT ?').all(tail??100).reverse();
  return {extent,rows};
}

// Verify a bounded saved stream without reading any credential or signing.
export async function main(){
const { values } = parseArgs({ options: { db: { type: 'string' }, tail: { type: 'string' }, config: { type: 'string' } } });
if (!values.db) throw new Error('Pass the saved --db path');
const tail=values.tail===undefined?undefined:Number(values.tail);
assert.ok(tail===undefined||/^\d+$/.test(values.tail)&&Number.isSafeInteger(tail)&&tail>=1&&tail<=100,'--tail must be between1and100');
const graph = JSON.parse(await readFile('deployments/subgraph-sepolia.json', 'utf8'));
const contracts = JSON.parse(await readFile('deployments/sepolia.json', 'utf8'));
const db = new DatabaseSync(values.db, { readOnly: true });
try {
  db.exec('BEGIN');
  const {extent,rows}=readRetainedWindow(db,tail);
  const head = rows.at(-1);
  const checkpoint = JSON.parse(head.cursor);
  assert.equal(checkpoint.version, 1);
  const expected=values.config?validateConfig(JSON.parse(await readFile(values.config,'utf8'))):undefined;
  const currentPackage = await readFile(expected?.packagePath??'packages/substreams/feestrip-pool-context-v0.1.1.spkg');
  assert.equal(checkpoint.identity.packageHash, '0x' + createHash('sha256').update(currentPackage).digest('hex'), 'Saved stream uses a different package; resync explicitly');
  assert.equal(checkpoint.identity.chainId, contracts.chainId);
  assert.equal(graph.chainId, contracts.chainId);
  assert.equal(graph.feeStrip.toLowerCase(), contracts.feeStrip.toLowerCase());
  assert.equal(checkpoint.identity.poolManager, contracts.poolManager.toLowerCase());
  assert.ok(checkpoint.providerCursor);
  let anchors;
  if(checkpoint.identity.history){
    const history=checkpoint.identity.history;
    const initialization=Object.fromEntries(history.initialization.map(({pool,...anchor})=>[pool,anchor]));
    const identity=expected?configurePackage(createSubstream(currentPackage),expected.network,expected.pools):checkpoint.identity;
    const readable={db,head:()=>db.prepare('SELECT * FROM blocks ORDER BY number DESC LIMIT 1').get(),first:()=>db.prepare('SELECT * FROM blocks ORDER BY number LIMIT 1').get(),block:number=>db.prepare('SELECT * FROM blocks WHERE number=?').get(number)};
    const sink=new SubstreamsHistorySink(readable,{...identity,packageHash:expected?.packageHash??checkpoint.identity.packageHash,poolIds:expected?.pools??checkpoint.identity.poolIds,startBlock:expected?.start??history.startBlock,initialization:expected?.initialization??initialization});
    assert.ok(sink.historyStatus().seeded,'Every selected pool anchor must be retained');
    anchors={expectedConfigMatched:!!expected,records:history.initialization,retained:true};
  }else assert.ok(!expected&&!tail,'Anchored history is required for configured or tail qualification');
  assert.ok(checkpoint.finalBlockHeight >= head.number, 'Qualification requires finalized data');
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].number, rows[0].number + i, 'Saved stream is not contiguous');
    const saved = JSON.parse(rows[i].cursor);
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.identity, checkpoint.identity);
    assert.ok(saved.providerCursor);
  }
  db.exec('COMMIT');
  const rpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com';
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15000, retryCount: 1 }) });
  assert.equal(await client.getChainId(), graph.chainId);
  for(const anchor of anchors?.records??[])assert.equal((await client.getBlock({blockNumber:BigInt(anchor.block)})).hash,anchor.hash,'Anchor RPC block hash mismatch');
  for (const row of rows) {
    assert.equal((await client.getBlock({ blockNumber: BigInt(row.number) })).hash, row.hash, 'RPC hash mismatch');
  }
  // Fail if Studio cannot serve this block. Never replace it with latest data.
  const source = await querySubgraph({ url: graph.queryUrl, deployment: graph.deployment, block: head.number, hash: head.hash });
  const nextSeriesId = await client.readContract({ address: contracts.feeStrip,
    abi: parseAbi(['function nextSeriesId() view returns(uint256)']), functionName: 'nextSeriesId', blockNumber: BigInt(head.number) });
  if (nextSeriesId === 1n) assert.equal(source.series.length, 0);
  else assert.ok(source.series.length > 0, 'Activated series missing from Studio');
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    scope: 'Retained Substreams tail / RPC / Studio block agreement; not joined buyer analysis or settlement acceptance',
    retainedExtent:extent,qualifiedTail:rows.length,anchors:anchors?{...anchors,allBlockHashesMatchRpc:true}:undefined,
    identity: checkpoint.identity,
    blocks: rows.map(({ number, hash }) => ({ number, hash })),
    allBlockHashesMatchRpc: true, rpcUrl, rpcHead: Number(await client.getBlockNumber()),
    finalBlockHeight: checkpoint.finalBlockHeight,
    providerCursorSha256: createHash('sha256').update(checkpoint.providerCursor).digest('hex'),
    subgraph: { url: graph.queryUrl, ...source.meta, seriesCount: source.series.length },
    nextSeriesId: nextSeriesId.toString(),
    storedTickObservations: db.prepare('SELECT count(*) AS count FROM swaps').get().count,
  }, null, 2));
} finally { db.close(); }

}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error(JSON.stringify({status:'failed',code:'stream-verification-failed'}));process.exitCode=1;});
