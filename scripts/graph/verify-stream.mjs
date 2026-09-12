import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPublicClient, http, parseAbi } from 'viem';
import { DatabaseSync } from 'node:sqlite';
import { querySubgraph } from '../../packages/data/src/compose.mjs';

// Verify a bounded saved stream without reading any credential or signing.
const { values } = parseArgs({ options: { db: { type: 'string' } } });
if (!values.db) throw new Error('Pass the saved --db path');
const graph = JSON.parse(await readFile('deployments/subgraph-sepolia.json', 'utf8'));
const contracts = JSON.parse(await readFile('deployments/sepolia.json', 'utf8'));
const db = new DatabaseSync(values.db, { readOnly: true });
try {
  const rows = db.prepare('SELECT number,hash,cursor FROM blocks ORDER BY number').all();
  assert.ok(rows.length > 0 && rows.length <= 100, 'Qualification expects 1–100 saved blocks');
  const head = rows.at(-1);
  const checkpoint = JSON.parse(head.cursor);
  assert.equal(checkpoint.version, 1);
  const currentPackage = await readFile('packages/substreams/feestrip-pool-context-v0.1.1.spkg');
  assert.equal(checkpoint.identity.packageHash, '0x' + createHash('sha256').update(currentPackage).digest('hex'), 'Saved stream uses a different package; resync explicitly');
  assert.equal(checkpoint.identity.chainId, contracts.chainId);
  assert.equal(graph.chainId, contracts.chainId);
  assert.equal(graph.feeStrip.toLowerCase(), contracts.feeStrip.toLowerCase());
  assert.equal(checkpoint.identity.poolManager, contracts.poolManager.toLowerCase());
  assert.ok(checkpoint.providerCursor);
  assert.ok(checkpoint.finalBlockHeight >= head.number, 'Qualification requires finalized data');
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].number, rows[0].number + i, 'Saved stream is not contiguous');
    const saved = JSON.parse(rows[i].cursor);
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.identity, checkpoint.identity);
    assert.ok(saved.providerCursor);
  }
  const rpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com';
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15000, retryCount: 1 }) });
  assert.equal(await client.getChainId(), graph.chainId);
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
    scope: 'Live provider / RPC / Studio block agreement; not joined buyer analysis or settlement acceptance',
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
