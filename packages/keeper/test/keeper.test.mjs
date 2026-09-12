import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {privateKeyToAccount} from 'viem/accounts';
import {parseTransaction,decodeFunctionData,keccak256,zeroHash} from 'viem';
import {keeperConfig} from '../src/config.mjs';
import {KeeperStore,readKeeperStatus,recoverDeadLock} from '../src/store.mjs';
import {CheckpointKeeper,checkpointAbi} from '../src/worker.mjs';
const hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const account=privateKeyToAccount('0x'+'11'.repeat(32));
const fixtureConfig={chainId:31337,genesisHash:hash(1),feeStrip:address(1),verifier:address(2),checkpoints:address(3),poolManager:address(4),usdc:address(5),managerCodeHash:keccak256('0x6000'),codeHashes:Object.fromEntries(['feeStrip','verifier','checkpoints','poolManager'].map(k=>[k,keccak256('0x6000')])),rpcUrls:['http://127.0.0.1:8562'],expectedSigner:account.address,enabled:true,gasLimit:'80000',maxFeePerGas:'10000000000',maxPriorityFeePerGas:'5000000000',maxTxCostWei:'800000000000000',dailyBudgetWei:'8000000000000000',minBalanceWei:'100000000000000'};
function setup(t,overrides={}){
 const dir=mkdtempSync(join(tmpdir(),'usufruct-keeper-')),path=join(dir,'keeper.sqlite');
 const store=new KeeperStore(path);t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});
 const state={head:102n,end:101n,stored:zeroHash,nonce:0,pendingNonce:0,receipts:new Map(),broadcasts:[],balance:10n**18n,fee:2n*10n**9n,tip:10n**9n,bytecode:'0x6000',next:2n};
 const block=n=>({number:n,hash:n===0n?hash(1):hash(n+1000n),timestamp:BigInt(Math.floor(Date.now()/1000))});
 const client={getChainId:async()=>31337,getBytecode:async()=>state.bytecode,getBlock:async({blockNumber,blockTag})=>block(blockNumber??(blockTag==='finalized'?0n:state.head)),getBalance:async()=>state.balance,estimateFeesPerGas:async()=>({maxFeePerGas:state.fee,maxPriorityFeePerGas:state.tip}),estimateGas:async()=>40000n,getTransactionCount:async({blockTag})=>blockTag==='pending'?state.pendingNonce:state.nonce,
  getTransactionReceipt:async({hash:h})=>{if(state.receipts.has(h))return state.receipts.get(h);const error=new Error('RPC secret must never appear');error.name='TransactionReceiptNotFoundError';throw error;},
  readContract:async({functionName})=>({nextSeriesId:state.next,series:{quantity:10000n,liquidity:100n,activationBlock:99n,endBlock:state.end},hashes:state.stored,verifier:fixtureConfig.verifier,poolManager:fixtureConfig.poolManager,usdc:fixtureConfig.usdc,chainId:31337n,managerCodeHash:fixtureConfig.managerCodeHash,checkpoints:fixtureConfig.checkpoints}[functionName]),
  sendRawTransaction:async({serializedTransaction})=>{assert.equal(store.activeTxs().some(tx=>tx.raw===serializedTransaction),true,'durable journal exists before broadcast');state.broadcasts.push(serializedTransaction);state.pendingNonce=state.nonce+1;return keccak256(serializedTransaction);},
 };
 const config={...fixtureConfig,...overrides};const worker=new CheckpointKeeper(config,store,{client,account});
 return {dir,path,store,state,block,client,config,worker};
}
test('config is immutable, strictly pinned, requires dedicated signer and explicit enablement',()=>{
 const c=keeperConfig(fixtureConfig);assert.ok(Object.isFrozen(c.codeHashes));assert.equal(keeperConfig(c).fingerprint,c.fingerprint);
 assert.throws(()=>keeperConfig({...fixtureConfig,chainId:1}),/UNSUPPORTED_CHAIN/);
 assert.throws(()=>keeperConfig({...fixtureConfig,enabled:undefined}),/EXPLICIT_ENABLED/);
 assert.throws(()=>keeperConfig({...fixtureConfig,gasLimit:'200000'}),/INVALID_BUDGET/);
});
test('receipt observation retains daily spend after an old signature confirms or remine changes receipt',t=>{
 const f=setup(t);let now=1000;f.store.clock=()=>now;
 f.store.journal({hash:hash(555),nonce:0,endpoint:101,raw:'0x',max_fee:'1',priority_fee:'1',reserved:'200',head:100});
 now+=86400001;assert.equal(f.store.reserveCost(),200n);
 f.store.txState(hash(555),'confirmed',{blockHash:hash(600)});assert.equal(f.store.reserveCost(),200n);
 now+=86400001;assert.equal(f.store.reserveCost(),0n);
 f.store.txState(hash(555),'confirmed',{blockHash:hash(600)});assert.equal(f.store.reserveCost(),0n,'same receipt does not extend forever');
 f.store.txState(hash(555),'confirmed',{blockHash:hash(601)});assert.equal(f.store.reserveCost(),200n);
});
test('legacy receipt migration conservatively retains spend and does not reset its window on restart',t=>{
 const dir=mkdtempSync(join(tmpdir(),'usufruct-keeper-migration-')),path=join(dir,'keeper.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const old=new DatabaseSync(path);
 old.exec(`CREATE TABLE transactions (hash TEXT PRIMARY KEY,nonce INTEGER NOT NULL,endpoint INTEGER NOT NULL,raw TEXT NOT NULL,max_fee TEXT NOT NULL,priority_fee TEXT NOT NULL,reserved TEXT NOT NULL,created INTEGER NOT NULL,head INTEGER NOT NULL,state TEXT NOT NULL,receipt TEXT)`);
 old.prepare('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(hash(777),0,101,'0x','1','1','200',0,100,'confirmed',JSON.stringify({blockHash:hash(600)}));old.close();
 let now=86400001;
 const migrated=new KeeperStore(path,{clock:()=>now});assert.equal(migrated.reserveCost(),200n);migrated.close();
 now+=86400001;
 const reopened=new KeeperStore(path,{clock:()=>now});try{assert.equal(reopened.reserveCost(),0n);}finally{reopened.close();}
});
test('post-signature readiness fails when budget is exhausted; unknown pending nonce fails before a sale exists',async t=>{
 const f=setup(t,{maxTxCostWei:'160000000000000',dailyBudgetWei:'160000000000000'});
 const status=await f.worker.tick();assert.equal(status.status,'observed');assert.equal(f.state.broadcasts.length,1);assert.equal(status.readyToSign,false);assert.equal(status.gasReady,false);
 const other=setup(t);other.state.next=1n;other.state.pendingNonce=1;
 const blocked=await other.worker.tick();assert.equal(blocked.readyToSign,false);assert.equal(blocked.lastError,'SIGNER_NONCE_NOT_EXCLUSIVE');assert.equal(other.state.broadcasts.length,0);
});
test('fixed call, value, signer and budgets are journaled before broadcast; restart keeps same nonce',async t=>{
 const f=setup(t);let result=await f.worker.tick();assert.equal(result.status,'observed');assert.equal(f.state.broadcasts.length,1);
 const tx=parseTransaction(f.state.broadcasts[0]);assert.equal(tx.to,f.config.checkpoints);assert.equal(tx.value??0n,0n);assert.equal(tx.chainId,31337);assert.equal(tx.nonce,0);
 const decoded=decodeFunctionData({abi:checkpointAbi,data:tx.data});assert.equal(decoded.functionName,'checkpoint');assert.deepEqual(decoded.args,[101n]);
 const prior=f.store.activeTxs()[0];f.store.close();const reopened=new KeeperStore(f.path);t.after(()=>reopened.close());
 const worker=new CheckpointKeeper(f.config,reopened,{client:{...f.client,sendRawTransaction:async({serializedTransaction})=>{f.state.broadcasts.push(serializedTransaction);return keccak256(serializedTransaction);}},account});
 result=await worker.tick();assert.equal(result.status,'observed');assert.equal(reopened.activeTxs().length,1);assert.equal(f.state.broadcasts.at(-1),prior.raw);
 assert.equal(readKeeperStatus(f.path).signer,account.address.toLowerCase());assert.ok(!JSON.stringify(readKeeperStatus(f.path)).includes(prior.raw));
});
test('never signs at N or after N+255; missed deadline is explicit',async t=>{
 const f=setup(t);f.state.head=101n;await f.worker.tick();assert.equal(f.state.broadcasts.length,0);
 f.state.head=357n;const status=await f.worker.tick();assert.equal(f.state.broadcasts.length,0);assert.equal(status.missedEndpoints,1);
});
test('canonical stored checkpoint skips signing; conflicting hash fails closed',async t=>{
 const f=setup(t);f.state.stored=f.block(101n).hash;await f.worker.tick();assert.equal(f.state.broadcasts.length,0);assert.equal(f.store.jobs()[0].state,'checkpointed');
 f.state.stored=hash(999);const result=await f.worker.tick();assert.equal(result.lastError,'CHECKPOINT_CONFLICT');assert.equal(f.state.broadcasts.length,0);
});
test('code changes, signer mismatch, config changes and exclusive locks fail closed',async t=>{
 const f=setup(t);assert.throws(()=>new KeeperStore(f.path),/KEEPER_ALREADY_LOCKED/);assert.throws(()=>recoverDeadLock(f.path),/LOCK_OWNER_ALIVE/);
 assert.throws(()=>new CheckpointKeeper({...f.config,expectedSigner:address(8)},f.store,{account,client:f.client}),/SIGNER_MISMATCH/);
 assert.throws(()=>new CheckpointKeeper({...f.config,dailyBudgetWei:'9000000000000000'},f.store,{account,client:f.client}),/CONFIG_CHANGED/);
 f.state.bytecode='0x6001';assert.equal((await f.worker.tick()).status,'unavailable');assert.equal(f.state.broadcasts.length,0);
});
test('gas, balance and rolling daily reservation caps prevent signatures',async t=>{
 const f=setup(t);f.state.balance=1n;assert.equal((await f.worker.tick()).lastError,'LOW_KEEPER_BALANCE');
 f.state.balance=10n**18n;f.state.fee=11n*10n**9n;assert.equal((await f.worker.tick()).lastError,'GAS_PRICE_CAP');assert.equal(f.state.broadcasts.length,0);
 f.state.fee=2n*10n**9n;f.store.journal({hash:hash(999),nonce:42,endpoint:1,raw:'0x',max_fee:'1',priority_fee:'1',reserved:f.config.dailyBudgetWei,head:1});f.store.txState(hash(999),'confirmed');
 assert.equal((await f.worker.tick()).lastError,'DAILY_BUDGET_CAP');assert.equal(f.state.broadcasts.length,0);
});
test('ambiguous broadcast survives crash and bounded replacement retains every signed variant',async t=>{
 const f=setup(t,{maxReplacements:1});let attempts=0;f.client.sendRawTransaction=async()=>{attempts++;throw new Error('secret RPC URL');};
 await f.worker.tick();assert.equal(f.store.activeTxs()[0].state,'signed');assert.equal(attempts,1);
 f.state.head=106n;await f.worker.tick();assert.equal(f.store.activeTxs().length,2);assert.equal(f.store.nonceTxs(0).length,2);
 f.state.head=110n;const result=await f.worker.tick();assert.equal(result.lastError,'REPLACEMENT_LIMIT');assert.equal(f.store.nonceTxs(0).length,2);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('receipt canonicality is checked and a mined transaction reorg rebroadcasts only its journal',async t=>{
 const f=setup(t);await f.worker.tick();const tx=f.store.activeTxs()[0];
 f.state.head=103n;f.state.nonce=1;f.state.pendingNonce=1;f.state.stored=f.block(101n).hash;
 f.state.receipts.set(tx.hash,{blockNumber:103n,blockHash:f.block(103n).hash,status:'success',transactionHash:tx.hash,gasUsed:40000n,effectiveGasPrice:2n*10n**9n});
 await f.worker.tick();assert.equal(f.store.activeTxs()[0].state,'mined');assert.equal(f.worker.publicStatus().lastSuccess.endpoint,'101');
 f.state.receipts.clear();f.state.nonce=0;f.state.pendingNonce=0;f.state.stored=zeroHash;
 await f.worker.tick();assert.equal(f.state.broadcasts.at(-1),tx.raw);assert.equal(f.store.nonceTxs(0).length,1);
});
test('unknown nonce use and expired pending transactions require operator action',async t=>{
 const f=setup(t);await f.worker.tick();f.state.nonce=1;assert.equal((await f.worker.tick()).lastError,'NONCE_CONSUMED_WITHOUT_KNOWN_RECEIPT');
 f.state.nonce=0;f.state.head=358n;assert.equal((await f.worker.tick()).lastError,'EXPIRED_PENDING_NONCE_REQUIRES_OPERATOR');
});
test('disabled observation has no signer and due discovery is bounded',async t=>{
 const f=setup(t,{enabled:false,pageSize:2});const worker=new CheckpointKeeper(f.config,f.store,{client:f.client});f.state.next=100n;
 const result=await worker.tick();assert.equal(result.status,'disabled');assert.equal(f.store.jobs().length,2);assert.equal(f.state.broadcasts.length,0);
 await worker.tick();assert.equal(f.store.jobs().length,4);
});
test('stale head blocks signatures and removed live lock fences signing',async t=>{
 const f=setup(t);const real=f.client.getBlock;f.client.getBlock=async args=>({...await real(args),timestamp:1n});
 assert.equal((await f.worker.tick()).lastError,'RPC_HEAD_STALE');assert.equal(f.state.broadcasts.length,0);
 writeFileSync(f.store.lock+'/owner.json',JSON.stringify({token:'other'}));assert.equal((await f.worker.tick()).lastError,'KEEPER_LOCK_LOST');
});
