import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,copyFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createPublicClient,createWalletClient,http,keccak256,parseAbi,parseTransaction} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {anvil} from 'viem/chains';
import {localRetentionConfig} from '../../settlement/src/local-config.mjs';
import {KeeperStore} from '../src/store.mjs';
import {CheckpointKeeper,checkpointAbi} from '../src/worker.mjs';
// This publicly known development key is usable ONLY against isolated localhost chain 31337.
const account=privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
test('actual isolated Anvil: pinned deployment, durable restart, checkpoint receipt and chain reorg', {skip:process.env.RUN_KEEPER_ANVIL!=='1',timeout:120000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'usufruct-keeper-anvil-'));let processAnvil,store;
 const rpcUrl='http://127.0.0.1:8562';
 try{
  mkdirSync(join(dir,'src'));
  copyFileSync('packages/keeper/test/Fixtures.sol',join(dir,'src/Fixtures.sol'));
  copyFileSync('contracts/src/proof/BlockHashCheckpoints.sol',join(dir,'src/BlockHashCheckpoints.sol'));
  writeFileSync(join(dir,'foundry.toml'),'[profile.default]\nsrc="src"\nout="out"\nsolc_version="0.8.26"\nevm_version="cancun"\n');
  execFileSync('forge',['build','--root',dir],{stdio:'pipe'});
  // Refuse to attach to any pre-existing node; this test owns its node and port.
  const {createServer}=await import('node:net');const probe=createServer();await new Promise((yes,no)=>{probe.once('error',no);probe.listen(8562,'127.0.0.1',yes);});await new Promise(yes=>probe.close(yes));
  processAnvil=spawn('anvil',['--port','8562','--host','127.0.0.1','--chain-id','31337','--silent'],{stdio:'ignore'});
  const client=createPublicClient({chain:anvil,transport:http(rpcUrl,{retryCount:0})});
  for(let i=0;;i++){try{assert.equal(await client.getChainId(),31337);break;}catch(error){if(i>=50)throw error;await delay(100);}}
  const wallet=createWalletClient({account,chain:anvil,transport:http(rpcUrl)});
  const deploy=async(file,name,args=[])=>{const artifact=JSON.parse(readFileSync(join(dir,'out',file,name+'.json')));const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args});return (await client.waitForTransactionReceipt({hash})).contractAddress;};
  const checkpoints=await deploy('BlockHashCheckpoints.sol','BlockHashCheckpoints');
  const poolManager=await deploy('Fixtures.sol','FixtureManager');
  const verifier=await deploy('Fixtures.sol','FixtureVerifier',[poolManager,checkpoints]);
  const usdc='0x0000000000000000000000000000000000000123';
  const feeStrip=await deploy('Fixtures.sol','FixtureFeeStrip',[verifier,poolManager,usdc]);
  const pins=await localRetentionConfig({chainId:31337,rpcUrl,checkpoints,poolManager,verifier,feeStrip,usdc},client);
  const config={...pins,enabled:true,expectedSigner:account.address,gasLimit:'80000',maxFeePerGas:'10000000000',maxPriorityFeePerGas:'5000000000',maxTxCostWei:'800000000000000',dailyBudgetWei:'8000000000000000',minBalanceWei:'100000000000000'};
  store=new KeeperStore(join(dir,'keeper.sqlite'));let worker=new CheckpointKeeper(config,store,{client,account});
  assert.equal((await worker.tick()).status,'observed');assert.equal(store.activeTxs().length,0);
  const endpoint=BigInt(store.jobs()[0].end_block);await client.request({method:'anvil_mine',params:['0x4']});
  assert.equal(await client.getBlockNumber({cacheTime:0}),endpoint+1n);
  await client.request({method:'evm_setAutomine',params:[false]});
  const snapshot=await client.request({method:'evm_snapshot',params:[]});
  // Simulate a process dying after durable signing but before any successful broadcast.
  const droppedClient={...client,sendRawTransaction:async()=>{throw new Error('simulated transport disconnect');}};
  worker=new CheckpointKeeper(config,store,{client:droppedClient,account});
  assert.equal((await worker.tick()).status,'observed');const signed=store.activeTxs()[0];assert.equal(signed.state,'signed');
  const tx=parseTransaction(signed.raw);assert.equal(tx.to.toLowerCase(),checkpoints.toLowerCase());assert.equal(tx.value??0n,0n);
  store.close();store=new KeeperStore(join(dir,'keeper.sqlite'));worker=new CheckpointKeeper(config,store,{client,account});
  assert.equal((await worker.tick()).status,'observed');assert.equal(store.activeTxs().length,1);assert.equal(store.activeTxs()[0].hash,signed.hash);
  await client.request({method:'anvil_mine',params:['0x1']});
  assert.equal((await worker.tick()).status,'observed');
  const stored=await client.readContract({address:checkpoints,abi:checkpointAbi,functionName:'hashes',args:[endpoint]});
  assert.equal(stored,(await client.getBlock({blockNumber:endpoint})).hash);
  const receipt=await client.getTransactionReceipt({hash:signed.hash});assert.equal(receipt.status,'success');
  assert.ok(worker.publicStatus().lastSuccess);
  // A real unfinalized receipt is removed. The keeper clears its success, preserves the nonce and rebroadcasts.
  await client.request({method:'evm_revert',params:[snapshot]});
  const afterReorg=await worker.tick();assert.equal(afterReorg.status,'observed');assert.equal(afterReorg.lastSuccess,null);
  assert.equal(store.nonceTxs(signed.nonce).length,1);
  await client.request({method:'anvil_mine',params:['0x1']});
  assert.equal((await worker.tick()).status,'observed');assert.equal(worker.publicStatus().lastSuccess.hash,signed.hash);
  assert.equal(await client.readContract({address:checkpoints,abi:checkpointAbi,functionName:'hashes',args:[endpoint]}),(await client.getBlock({blockNumber:endpoint})).hash);
  console.log(JSON.stringify({scope:'isolated-anvil-checkpoint-with-discovery-fixture',chainId:31337,endpoint:String(endpoint),checkpointTransaction:signed.hash,gasUsed:String(receipt.gasUsed),restartPreservedNonce:true,unfinalizedReorgRecovered:true}));
 }finally{store?.close();if(processAnvil){processAnvil.kill('SIGTERM');await new Promise(resolve=>processAnvil.once('exit',resolve));}rmSync(dir,{recursive:true,force:true});}
});
