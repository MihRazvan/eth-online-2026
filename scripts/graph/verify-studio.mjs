import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createPublicClient, http, parseAbi } from 'viem';

// Read-only verification: no .env access, signing or authenticated RPC required.
const deployed = JSON.parse(await readFile('deployments/subgraph-sepolia.json', 'utf8'));
const contracts = JSON.parse(await readFile('deployments/sepolia.json', 'utf8'));
assert.equal(deployed.chainId, contracts.chainId);
assert.equal(deployed.feeStrip.toLowerCase(), contracts.feeStrip.toLowerCase());
assert.equal(String(deployed.startBlock), contracts.deploymentBlock);
async function query(query, variables = {}) {
  const response = await fetch(deployed.queryUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'Studio HTTP status');
  const body = await response.json();
  assert.ok(!body.errors?.length, 'Studio GraphQL errors');
  assert.ok(body.data, 'Studio returned no data');
  return body.data;
}
const head = await query('{ _meta { deployment hasIndexingErrors block { number hash } } }');
const blockNumber = head._meta.block.number;
assert.ok(Number.isSafeInteger(blockNumber) && blockNumber >= deployed.startBlock);
assert.equal(head._meta.deployment, deployed.deployment);
assert.equal(head._meta.hasIndexingErrors, false);
const request = `query VerifyStudio($hash: Bytes!) {
  _meta(block: {hash: $hash}) { deployment hasIndexingErrors block { number hash } }
  series_collection(first: 5, orderBy: id, block: {hash: $hash}) {
    id chainId poolManager poolId positionManager tokenId activationBlock endBlock
  }
  lifecycleEvents(first: 5, orderBy: blockNumber, block: {hash: $hash}) {
    id kind blockNumber blockHash transactionHash
  }
}`;
const data = await query(request, { hash: head._meta.block.hash });
assert.deepEqual(data._meta, head._meta, 'Pinned query metadata changed');
const rpcUrl = 'https://ethereum-sepolia-rpc.publicnode.com';
const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15000, retryCount: 1 }) });
assert.equal(await client.getChainId(), deployed.chainId);
const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
assert.equal(data._meta.block.hash.toLowerCase(), block.hash.toLowerCase(), 'Canonical RPC hash mismatch');
const nextSeriesId = await client.readContract({
  address: deployed.feeStrip, abi: parseAbi(['function nextSeriesId() view returns(uint256)']),
  functionName: 'nextSeriesId', blockNumber: BigInt(blockNumber),
});
assert.ok(Array.isArray(data.series_collection) && Array.isArray(data.lifecycleEvents));
if (nextSeriesId === 1n) {
  assert.equal(data.series_collection.length, 0);
  assert.equal(data.lifecycleEvents.length, 0);
} else {
  assert.ok(data.series_collection.length > 0, 'Activated series missing from Subgraph');
  assert.ok(data.lifecycleEvents.length > 0, 'Lifecycle events missing from Subgraph');
}
const rpcHead = await client.getBlockNumber();
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), scope: 'Live Studio query and canonical RPC block agreement; no financial acceptance or Substreams composition',
  deployment: deployed, request: { query: request, variables: { hash: head._meta.block.hash } }, response: { data },
  rpc: { url: rpcUrl, chainId: deployed.chainId, blockNumber, blockHash: block.hash, head: Number(rpcHead), lagBlocks: Number(rpcHead) - blockNumber, nextSeriesId: nextSeriesId.toString() },
  hashMatches: true, emptySeriesExpected: nextSeriesId === 1n,
}, null, 2));
