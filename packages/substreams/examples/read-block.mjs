// A minimal consumer of the reusable map, independent of fee-sale state.
// The host supplies only SUBSTREAMS_API_TOKEN; output never includes auth or cursors.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createConnectTransport } from '@connectrpc/connect-node';
import { proto3 } from '@bufbuild/protobuf';
import { createAuthInterceptor, createRegistry, createRequest, createSubstream, streamBlocks, unpackMapOutput } from '@substreams/core';
import { configurePackage } from '../sink/run.mjs';

const { values } = parseArgs({ options: { block: { type: 'string' }, pools: { type: 'string' } } });
if (!/^\d+$/.test(values.block ?? '') || !values.pools?.split(',').every(pool => /^0x[0-9a-f]{64}$/i.test(pool)))
  throw new Error('Pass an absolute --block and explicit --pools list');
const token = process.env.SUBSTREAMS_API_TOKEN;
if (!token) throw new Error('SUBSTREAMS_API_TOKEN is required in the secret environment');
const bytes = readFileSync(new URL('../feestrip-pool-context-v0.1.1.spkg', import.meta.url));
const pkg = createSubstream(bytes);
configurePackage(pkg, 'sepolia', values.pools.split(','));
const registry = createRegistry(pkg);
const transport = createConnectTransport({ baseUrl: 'https://sepolia.eth.streamingfast.io', httpVersion: '1.1',
  useBinaryFormat: true, interceptors: [createAuthInterceptor(token)], jsonOptions: { typeRegistry: registry } });
const request = createRequest({ substreamPackage: pkg, outputModule: 'map_pool_context', productionMode: true,
  startBlockNum: BigInt(values.block), stopBlockNum: BigInt(values.block) + 1n, finalBlocksOnly: true });
let result;
try {
  for await (const response of streamBlocks(transport, request, { signal: AbortSignal.timeout(60000) })) {
    if (response.message.case === 'blockScopedData') {
      const block = response.message.value;
      if (result || block.clock.number !== BigInt(values.block) || block.finalBlockHeight < block.clock.number ||
          proto3.bin.listUnknownFields(block).some(field => [13, 14, 15].includes(field.no))) throw new Error('Unexpected or partial block');
      result = unpackMapOutput(response, registry)?.toJson({ typeRegistry: registry });
      if (!result || BigInt(result.number) !== block.clock.number ||
          result.hash.replace(/^0x/, '').toLowerCase() !== block.clock.id.replace(/^0x/, '').toLowerCase()) throw new Error('Output clock mismatch');
    } else if (!['session', 'progress'].includes(response.message.case)) throw new Error('Unexpected stream response');
  }
  if (!result) throw new Error('Requested block was not received');
  console.log(JSON.stringify({ packageSha256: createHash('sha256').update(bytes).digest('hex'), context: result }, null, 2));
} catch {
  console.error('Block inspection failed; no auth or provider metadata emitted');
  process.exitCode = 1;
}
