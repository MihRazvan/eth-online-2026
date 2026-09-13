import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {LIMITS,validatePlan,validateSignedEntry,inspect,makePlan,authorizeNewSignature,receiptStatus,reconcile} from './fund-keeper.mjs';
const account=privateKeyToAccount('0x'+'01'.repeat(32));
const other=privateKeyToAccount('0x'+'02'.repeat(32));
const hash='0x'+'ab'.repeat(32),now=1789300800000;
const observed=()=>({head:{number:123n,hash,timestamp:BigInt(now/1000),baseFeePerGas:1n},balance:0n,senderBalance:10n**18n,latestNonce:7,pendingNonce:7});
const fees={maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n};
const plan=()=>makePlan(observed(),fees,now);
async function signed(overrides={},signer=account){
 const p={...plan(),sender:account.address};
 const raw=await signer.signTransaction({chainId:LIMITS.chainId,type:'eip1559',to:LIMITS.keeper,value:LIMITS.target,gas:LIMITS.gas,nonce:7,...fees,...overrides});
 return {p,entry:{raw,hash:keccak256(raw),...Object.fromEntries(['nonce','value','gas','maxFeePerGas','maxPriorityFeePerGas','maximumCost'].map(key=>[key,p[key]]))}};
}
const missing=name=>Object.assign(new Error(name),{name});
function client(){
 const o=observed();return {
  getChainId:async()=>LIMITS.chainId,
  getBlock:async ({blockNumber,blockTag})=>blockNumber===0n?{hash:LIMITS.genesisHash}:blockTag==='finalized'?{number:124n,hash}:o.head,
  getBytecode:async()=>'0x',getBalance:async({address})=>address===LIMITS.keeper?0n:o.senderBalance,
  getTransactionCount:async()=>7,
  getTransactionReceipt:async()=>{throw missing('TransactionReceiptNotFoundError');},getTransaction:async()=>{throw missing('TransactionNotFoundError');},
 };
}
test('exact serialized signed payment remains valid after private journal JSON round-trip',async()=>{
 const {entry,p}=await signed();const restored=JSON.parse(JSON.stringify({entry,p}));
 const tx=await validateSignedEntry(restored.entry,restored.p,account.address);
 assert.equal(tx.to.toLowerCase(),LIMITS.keeper.toLowerCase());assert.equal(tx.value,LIMITS.target);
 await assert.rejects(validateSignedEntry(entry,p)); // CLI uses its fixed reviewed deployer, never the test signer.
});
test('authenticated bytes reject wrong chain, nonce, recipient, value, data, gas, fees, access list, sender and transaction type',async()=>{
 const bad=[{chainId:1},{nonce:8},{to:other.address},{value:LIMITS.target+1n},{value:0n},{data:'0x1234'},{gas:21001n},{maxFeePerGas:30000000001n},{maxPriorityFeePerGas:2n},{accessList:[{address:other.address,storageKeys:[]}]}];
 for(const patch of bad){const {entry,p}=await signed(patch);await assert.rejects(validateSignedEntry(entry,p,account.address),JSON.stringify(patch,(_,v)=>typeof v==='bigint'?String(v):v));}
 const wrong=await signed({},other);await assert.rejects(validateSignedEntry(wrong.entry,wrong.p,account.address));
 const {entry,p}=await signed();const raw=await account.signTransaction({chainId:LIMITS.chainId,type:'legacy',to:LIMITS.keeper,value:LIMITS.target,gas:21000n,nonce:7,gasPrice:fees.maxFeePerGas});
 await assert.rejects(validateSignedEntry({...entry,raw,hash:keccak256(raw)},p,account.address));
});
test('no journal metadata field can silently override authenticated bytes',async()=>{
 const {entry,p}=await signed();
 for(const [field,value] of Object.entries({hash:'0x'+'00'.repeat(32),nonce:8,value:'999',gas:'21001',maxFeePerGas:'1',maxPriorityFeePerGas:'0',maximumCost:'1',extra:'not allowed'}))await assert.rejects(validateSignedEntry({...entry,[field]:value},p,account.address),field);
 for(const field of Object.keys(entry)){const copy={...entry};delete copy[field];await assert.rejects(validateSignedEntry(copy,p,account.address),field);}
});
test('reviewed plan rejects target overshoot, unknown fields, malformed integers, mismatched identity and fee excess',()=>{
 const p=plan();
 for(const patch of [{chainId:1},{sender:other.address},{keeper:other.address},{genesisHash:hash},{nonce:-1},{nonce:1.5},{value:'010000000000000000'},{value:String(LIMITS.target+1n)},{balanceBefore:'1'},{gas:'21001'},{maxFeePerGas:'30000000001'},{maxPriorityFeePerGas:'30000000001'},{maximumCost:'1'},{observedBlock:'0'},{observedHash:'bad'},{extra:true}])assert.throws(()=>validatePlan({...p,...patch}));
});
test('partial balance produces exact capped top-up and signature requires unchanged balance/nonce, affordable fee and recent plan',()=>{
 const o={...observed(),balance:3000000000000000n};const p=makePlan(o,fees,now);assert.equal(p.value,'7000000000000000');authorizeNewSignature(p,o,now+1);
 for(const patch of [{balance:o.balance+1n},{latestNonce:8},{pendingNonce:8},{senderBalance:0n},{head:{...o.head,baseFeePerGas:fees.maxFeePerGas+1n}}])assert.throws(()=>authorizeNewSignature(p,{...o,...patch},now+1));
 assert.throws(()=>authorizeNewSignature(p,o,now+600001));assert.throws(()=>authorizeNewSignature(p,o,now-1));
 assert.throws(()=>makePlan({...o,balance:LIMITS.target},fees,now));assert.throws(()=>makePlan({...o,pendingNonce:8},fees,now));
});
test('fresh chain read validates genesis, canonical head, both EOA codes and nonce ordering',async()=>{
 assert.equal((await inspect(client(),{now})).balance,0n);
 const wrongChain=client();wrongChain.getChainId=async()=>1;await assert.rejects(inspect(wrongChain,{now}));
 for(const override of [async()=>({hash}),async({blockNumber})=>blockNumber===0n?{hash:LIMITS.genesisHash}:{...observed().head,timestamp:BigInt(now/1000)-121n}]){const c=client();c.getBlock=override;await assert.rejects(inspect(c,{now}));}
 const code=client();code.getBytecode=async()=>'0xef0100';await assert.rejects(inspect(code,{now}));
 const reorg=client();const get=reorg.getBlock;reorg.getBlock=async args=>args.blockNumber===123n?{...observed().head,hash:'0x'+'cd'.repeat(32)}:get(args);await assert.rejects(inspect(reorg,{now}));
});
test('dropped exact payment may rebroadcast only its original nonce; foreign pending/consumed nonce and outside top-up block it',async()=>{
 const {p,entry}=await signed();const c=client();
 assert.equal((await reconcile(c,entry,p,observed())).action,'rebroadcast-exact');
 for(const patch of [{latestNonce:8,pendingNonce:8},{pendingNonce:8},{pendingNonce:9},{balance:1n},{senderBalance:0n}])await assert.rejects(reconcile(c,entry,p,{...observed(),...patch}));
 c.getTransactionReceipt=async()=>{throw new Error('RPC unavailable');};await assert.rejects(reconcile(c,entry,p,observed()));
});
test('known pending exact transaction is observed without replacement or another payment',async()=>{
 const {p,entry}=await signed();const c=client();c.getTransaction=async()=>({hash:entry.hash,nonce:7,from:account.address});
 assert.equal((await reconcile(c,entry,p,{...observed(),pendingNonce:8})).action,'pending');
 c.getTransaction=async()=>({hash:entry.hash,nonce:8,from:account.address});await assert.rejects(reconcile(c,entry,p,observed()));
});
test('resume authenticates receipt inclusion afresh and distinguishes finalized, nonfinal and reverted',async()=>{
 const {p,entry}=await signed();const c=client();const receipt={transactionHash:entry.hash,from:account.address,to:LIMITS.keeper,gasUsed:21000n,effectiveGasPrice:2n,blockNumber:123n,blockHash:hash,status:'success'};
 c.getTransactionReceipt=async()=>receipt;
 assert.equal((await receiptStatus(c,entry,p)).finalized,true);
 const get=c.getBlock;c.getBlock=async args=>args.blockTag==='finalized'?{number:122n,hash}:get(args);
 assert.equal((await receiptStatus(c,entry,p)).finalized,false);
 receipt.status='reverted';assert.equal((await reconcile(c,entry,p,{...observed(),latestNonce:8,pendingNonce:8})).receipt.status,'reverted');
 receipt.blockHash='0x'+'cd'.repeat(32);await assert.rejects(receiptStatus(c,entry,p));
});
test('a reorg during finality observation is rejected rather than recording success',async()=>{
 const {p,entry}=await signed();const c=client();let checks=0;
 c.getTransactionReceipt=async()=>({transactionHash:entry.hash,from:account.address,to:LIMITS.keeper,gasUsed:21000n,effectiveGasPrice:2n,blockNumber:123n,blockHash:hash,status:'success'});
 c.getBlock=async args=>args.blockTag==='finalized'?{number:124n,hash}:{number:123n,hash:++checks===1?hash:'0x'+'cd'.repeat(32)};
 await assert.rejects(receiptStatus(c,entry,p));
});
