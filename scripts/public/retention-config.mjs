// Generate private, read-only operator configuration from the reviewed public deployment.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,chmodSync,openSync,closeSync,fsyncSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {createPublicClient,http,keccak256} from 'viem';
import {normalizeConfig} from '../../packages/settlement/src/chain.mjs';
let stage='configuration';
try {
  const env={...parseEnv(readFileSync('.env','utf8')),...process.env};
  const deployment=JSON.parse(readFileSync('.scratch/public-broadcast/deployment.json'));
  const evidence=JSON.parse(readFileSync('.scratch/public-broadcast/evidence.json'));
  assert.equal(deployment.mode,'testnet');assert.equal(deployment.chainId,11155111);assert.equal(evidence.chainId,11155111);
  const client=createPublicClient({transport:http(env.SEPOLIA_RPC_URL,{timeout:15_000,retryCount:0})});
  const independent=createPublicClient({transport:http('https://ethereum-sepolia-rpc.publicnode.com',{timeout:15_000,retryCount:0})});
  stage='network identity';
  assert.equal(await client.getChainId(),11155111);assert.equal(await independent.getChainId(),11155111);
  stage='genesis identity';
  const genesis=await client.getBlock({blockNumber:0n});
  // Independently pinned in go-ethereum params/config.go, SepoliaGenesisHash.
  // PublicNode does not serve block0; do not replace identity with a sampled head.
  // https://github.com/ethereum/go-ethereum/blob/master/params/config.go
  assert.equal(genesis.hash,'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9');
  const names=['feeStrip','verifier','checkpoints','poolManager'];
  const retained=JSON.parse(readFileSync('scripts/proof/sepolia-witness.json'));
  assert.equal(deployment.poolManager.toLowerCase(),retained.manager.toLowerCase());
  assert.equal(deployment.usdc.toLowerCase(),retained.usdc.toLowerCase());
  const codeHashes={poolManager:keccak256(retained.managerCode)};
  stage='deployed code';
  for(const name of names) {
    if(name!=='poolManager') {
      assert.equal(deployment[name],evidence.contracts[name].address);
      codeHashes[name]=evidence.contracts[name].observedRuntimeHash;
    }
    for(const rpc of [client,independent])assert.equal(keccak256(await rpc.getCode({address:deployment[name]})),codeHashes[name]);
  }
  stage='private directories';
  for(const path of ['.scratch','.scratch/retention','.scratch/retention/sepolia']) {
    try {mkdirSync(path,{mode:0o700});} catch(error) {if(error.code!=='EEXIST')throw error;}
    assert(lstatSync(path).isDirectory()&&!lstatSync(path).isSymbolicLink(),'Private output must use real directories');
    chmodSync(path,0o700);
  }
  const directory=resolve('.scratch/retention/sepolia');
  const config={chainId:11155111,genesisHash:genesis.hash,...Object.fromEntries([...names,'usdc'].map(n=>[n,deployment[n]])),managerCodeHash:codeHashes.poolManager,codeHashes,rpcUrls:[env.SEPOLIA_RPC_URL],database:resolve(directory,'keeper.sqlite'),artifactRoots:[resolve(directory,'primary'),resolve(directory,'secondary')],intervalMs:10000,port:8788};
  stage='configuration schema';normalizeConfig(config);
  const temporary=resolve(directory,`.operator-${randomUUID()}.tmp`),fd=openSync(temporary,'wx',0o600);
  try {writeFileSync(fd,JSON.stringify(config,null,2)+'\n');fsyncSync(fd);}finally {closeSync(fd);}
  renameSync(temporary,resolve(directory,'operator.generated.json'));
  console.log('Private Sepolia retention configuration written; canonical code checked through two providers. No checkpoint or settlement transaction sent.');
} catch {console.error(`Sepolia retention configuration failed during ${stage}; private diagnostics suppressed.`);process.exitCode=1;}
