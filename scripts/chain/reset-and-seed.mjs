import {execFileSync} from 'node:child_process';
import {readdirSync,rmSync} from 'node:fs';
import {client,assertLocal,rpcURL} from './common.mjs';
await assertLocal();
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(rpcURL).hostname))throw new Error('Reset restricted to loopback development RPC');
if(!process.argv.includes('--reset'))throw new Error('Use --reset to explicitly reset the dedicated local FeeStrip chain');
await client.request({method:'anvil_reset',params:[]});
// Reset preserves Anvil's startup genesis time. Fresh service observations must
// not inherit an hours-old head when multiple suites reuse this local process.
const resetHead=await client.getBlock();
await client.request({method:'evm_setNextBlockTimestamp',params:[Math.max(Math.floor(Date.now()/1000),Number(resetHead.timestamp)+1)]});
// Forge simulates against latest, not the pending timestamp. Mine it before
// constructing deadline-bound liquidity calls on a long-running Anvil process.
await client.request({method:'evm_mine',params:[]});
for(const file of readdirSync('apps/web/public'))if(/^witness-\d+\.json$/.test(file))rmSync(`apps/web/public/${file}`);
const actors=await client.request({method:'eth_accounts'});
execFileSync('forge',['script','contracts/script/DeployLocalNative.s.sol:DeployLocalNative','--sig','run(address,address)',actors[0],actors[1],'--rpc-url',rpcURL,'--unlocked','--sender',actors[0],'--broadcast','--slow'],{stdio:'pipe'});
execFileSync('forge',['build','-q'],{stdio:'inherit'});
execFileSync('node',['scripts/generate-abis.mjs'],{stdio:'inherit'});
execFileSync('node',['scripts/chain/seed.mjs'],{stdio:'inherit'});
