#!/usr/bin/env node
/** Initial Sepolia keeper top-up only. Default --plan never reads a private key.
 * node scripts/deploy/fund-keeper.mjs [--plan]
 * After independent review: node scripts/deploy/fund-keeper.mjs --broadcast --env .env
 * Plan RPC: SEPOLIA_RPC_URL or public Sepolia RPC. Broadcast RPC: explicit env file.
 * A failed genesis read stops the run. No fallback to weaker chain identification.
 * No automatic fee replacement, nonce reset, repeat funding or lock stealing.
 * After a hard crash: stop all runners, independently establish they are offline,
 * preserve plan/journal and remove ONLY .scratch/keeper-funding/runner.lock.
 * The root operator must qualify hosted retention/bucket configuration before funding.
 * A receipt is reported as included or finalized, never as whole-product acceptance.
 */
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs,parseEnv} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {createPublicClient,http,keccak256,parseTransaction,recoverTransactionAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {privateDirectory,privateJSON} from '../../packages/operations/src/config.mjs';

export const LIMITS=Object.freeze({chainId:11155111,sender:'0x92AAe0857979a139344f5b6F008e71F27A507522',keeper:'0xFfaa5fE1C38Aa538fd9B1A28D8CF8516fa3728Ad',
 genesisHash:'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',target:10000000000000000n,gas:21000n,maxFeePerGas:30000000000n});
const directory=resolve('.scratch/keeper-funding'),planFile=resolve(directory,'plan.json'),journalFile=resolve(directory,'journal.json'),lockFile=resolve(directory,'runner.lock');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const uint=value=>{assert(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value),'Invalid integer');return BigInt(value);};
let stage='configuration';
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort(),'Unexpected persisted fields');
function boundedFile(path,max=65536){const stat=lstatSync(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=max,'Unsafe input file');return readFileSync(path,'utf8');}
const readJSON=path=>JSON.parse(boundedFile(path));
export function validatePlan(plan,expectedSender=LIMITS.sender){
 keys(plan,['chainId','sender','keeper','genesisHash','nonce','value','balanceBefore','gas','maxFeePerGas','maxPriorityFeePerGas','maximumCost','observedBlock','observedHash','observedAt']);
 assert.equal(plan.chainId,LIMITS.chainId);assert(same(plan.sender,expectedSender));assert(same(plan.keeper,LIMITS.keeper));assert.equal(plan.genesisHash,LIMITS.genesisHash);
 assert(Number.isSafeInteger(plan.nonce)&&plan.nonce>=0);const value=uint(plan.value),before=uint(plan.balanceBefore);
 assert(value<=LIMITS.target&&before+value===LIMITS.target,'Top-up must reach only reviewed target');
 assert.equal(uint(plan.gas),LIMITS.gas);const fee=uint(plan.maxFeePerGas),priority=uint(plan.maxPriorityFeePerGas);
 assert(fee>0n&&fee<=LIMITS.maxFeePerGas&&priority<=fee,'Invalid fee caps');assert.equal(uint(plan.maximumCost),value+LIMITS.gas*fee);
 assert(uint(plan.observedBlock)>0n);assert(/^0x[0-9a-f]{64}$/i.test(plan.observedHash));assert(Number.isSafeInteger(plan.observedAt)&&plan.observedAt>0);
 return plan;
}
/** Validate bytes and every duplicate field, never trust a journal nonce/hash alone. */
export async function validateSignedEntry(entry,plan,expectedSender=LIMITS.sender){
 validatePlan(plan,expectedSender);assert(uint(plan.value)>0n,'Zero payment is not authorized');
 keys(entry,['raw','hash','nonce','value','gas','maxFeePerGas','maxPriorityFeePerGas','maximumCost']);
 assert(typeof entry.raw==='string'&&/^0x[0-9a-f]+$/i.test(entry.raw)&&entry.raw.length<2048);assert.equal(keccak256(entry.raw),entry.hash);
 assert(same(await recoverTransactionAddress({serializedTransaction:entry.raw}),expectedSender),'Wrong signed sender');
 const tx=parseTransaction(entry.raw);assert.equal(tx.type,'eip1559');assert.equal(tx.chainId,LIMITS.chainId);assert.equal(tx.nonce,plan.nonce);
 assert(same(tx.to,LIMITS.keeper),'Wrong payment recipient');assert.equal(tx.data??'0x','0x');assert.equal(tx.accessList?.length??0,0);
 for(const key of ['value','gas','maxFeePerGas','maxPriorityFeePerGas']){assert.equal(tx[key]??0n,uint(plan[key]),`Wrong signed ${key}`);assert.equal(entry[key],plan[key]);}
 assert.equal(entry.nonce,plan.nonce);assert.equal(entry.maximumCost,plan.maximumCost);return tx;
}
/** Fresh, canonical read-only observation. Provider errors propagate; never substitute another chain. */
export async function inspect(client,{now=Date.now()}={}){
 const [chain,genesis,head]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n}),client.getBlock({blockTag:'latest'})]);
 assert.equal(chain,LIMITS.chainId);assert.equal(genesis?.hash?.toLowerCase(),LIMITS.genesisHash);
 assert(head?.hash&&typeof head.number==='bigint'&&typeof head.timestamp==='bigint');assert(now/1000-Number(head.timestamp)<120&&Number(head.timestamp)<=now/1000+15,'Stale RPC head');
 const [keeperCode,senderCode,balance,senderBalance,latestNonce,pendingNonce]=await Promise.all([
  client.getBytecode({address:LIMITS.keeper,blockNumber:head.number}),client.getBytecode({address:LIMITS.sender,blockNumber:head.number}),
  client.getBalance({address:LIMITS.keeper,blockNumber:head.number}),client.getBalance({address:LIMITS.sender,blockNumber:head.number}),
  client.getTransactionCount({address:LIMITS.sender,blockTag:'latest'}),client.getTransactionCount({address:LIMITS.sender,blockTag:'pending'})]);
 assert(!keeperCode||keeperCode==='0x','Keeper must be an undelegated EOA');assert(!senderCode||senderCode==='0x','Sender must be an undelegated EOA');
 assert.equal((await client.getBlock({blockNumber:head.number})).hash,head.hash,'Observation reorg');
 assert(Number.isSafeInteger(latestNonce)&&Number.isSafeInteger(pendingNonce)&&latestNonce>=0&&pendingNonce>=latestNonce);
 return {head,balance,senderBalance,latestNonce,pendingNonce};
}
export function makePlan(observed,fees,now=Date.now()){
 assert.equal(observed.latestNonce,observed.pendingNonce,'Another wallet transaction is pending');assert(observed.balance<LIMITS.target,'Keeper already funded');
 const value=LIMITS.target-observed.balance;
 const plan={chainId:LIMITS.chainId,sender:LIMITS.sender,keeper:LIMITS.keeper,genesisHash:LIMITS.genesisHash,nonce:observed.latestNonce,value:String(value),balanceBefore:String(observed.balance),
  gas:String(LIMITS.gas),maxFeePerGas:String(fees.maxFeePerGas),maxPriorityFeePerGas:String(fees.maxPriorityFeePerGas),maximumCost:String(value+LIMITS.gas*fees.maxFeePerGas),
  observedBlock:String(observed.head.number),observedHash:observed.head.hash,observedAt:now};
 validatePlan(plan);assert(observed.senderBalance>=uint(plan.maximumCost),'Insufficient sender ETH');return plan;
}
export function authorizeNewSignature(plan,observed,now=Date.now()){
 validatePlan(plan);assert(now>=plan.observedAt&&now-plan.observedAt<=10*60*1000,'Plan expired; review a fresh plan');
 assert.equal(observed.latestNonce,plan.nonce);assert.equal(observed.pendingNonce,plan.nonce);assert.equal(observed.balance,uint(plan.balanceBefore),'Keeper balance changed; review a fresh top-up');
 assert(observed.senderBalance>=uint(plan.maximumCost),'Insufficient sender ETH');
 assert(typeof observed.head.baseFeePerGas==='bigint'&&observed.head.baseFeePerGas<=uint(plan.maxFeePerGas),'Base fee exceeds signed fee cap');
}
export async function receiptStatus(client,entry,plan){
 let receipt;try{receipt=await client.getTransactionReceipt({hash:entry.hash});}catch(error){if(error.name==='TransactionReceiptNotFoundError')return null;throw error;}
 assert.equal(receipt.transactionHash,entry.hash);assert(same(receipt.from,plan.sender)&&same(receipt.to,plan.keeper));
 assert(['success','reverted'].includes(receipt.status));assert(receipt.gasUsed>0n&&receipt.gasUsed<=LIMITS.gas&&receipt.effectiveGasPrice>=0n&&receipt.effectiveGasPrice<=uint(plan.maxFeePerGas));
 assert.equal((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash,'Receipt reorg');
 let finalized=false;try{const block=await client.getBlock({blockTag:'finalized'});finalized=block.number>=receipt.blockNumber;}catch{}
 assert.equal((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash,'Receipt changed during finality check');
 return {transactionHash:entry.hash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,status:receipt.status,gasUsed:String(receipt.gasUsed),effectiveGasPrice:String(receipt.effectiveGasPrice),finalized};
}
export async function reconcile(client,entry,plan,observed){
 const receipt=await receiptStatus(client,entry,plan);if(receipt)return {action:'receipt',receipt};
 assert.equal(observed.latestNonce,plan.nonce,'Nonce consumed without this receipt; preserve journal and investigate');
 assert(observed.pendingNonce<=plan.nonce+1,'Unrelated pending wallet transactions');
 let known;try{known=await client.getTransaction({hash:entry.hash});}catch(error){if(error.name!=='TransactionNotFoundError')throw error;}
 if(known){assert.equal(known.hash,entry.hash);assert.equal(known.nonce,plan.nonce);assert(same(known.from,plan.sender));return {action:'pending'};}
 assert.equal(observed.pendingNonce,plan.nonce,'Unknown pending nonce; no replacement is authorized');
 assert(observed.balance+uint(plan.value)<=LIMITS.target,'Keeper topped up elsewhere; do not rebroadcast');
 assert(observed.senderBalance>=uint(plan.maximumCost),'Insufficient sender ETH');
 return {action:'rebroadcast-exact'};
}
async function main(){
 const {values}=parseArgs({options:{plan:{type:'boolean',default:false},broadcast:{type:'boolean',default:false},env:{type:'string'}}});
 assert(!(values.plan&&values.broadcast));assert(!values.env||values.broadcast,'Key file only accepted for broadcast');
 const implementationHash=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
 let signer,rpc=process.env.SEPOLIA_RPC_URL??'https://ethereum-sepolia-rpc.publicnode.com';
 if(values.broadcast){
  stage='deployer-key-binding';assert(values.env,'Explicit --env file required');const env=parseEnv(boundedFile(values.env));signer=privateKeyToAccount(env.PRIVATE_KEY);assert(same(signer.address,LIMITS.sender));
  stage='prepared-keeper-key-binding';const prepared=readJSON('.scratch/operations/host-secrets.json');assert(same(privateKeyToAccount(prepared.KEEPER_PRIVATE_KEY).address,LIMITS.keeper));assert(same(prepared.KEEPER_EXPECTED_SIGNER,LIMITS.keeper));
  rpc=env.SEPOLIA_RPC_URL??env.ENDPOINT_URL;assert(typeof rpc==='string','Explicit Sepolia RPC required');
 }
 stage='rpc-configuration';const endpoint=new URL(rpc);assert(endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password,'HTTPS RPC required');
 const client=createPublicClient({transport:http(rpc,{timeout:6000,retryCount:0})});
 privateDirectory(directory);let lock;const lockToken=randomUUID();
 const checkLock=()=>assert(readJSON(lockFile).token===lockToken,'Runner lock lost');
 try{
  // Plans also lock so a concurrent planner cannot overwrite the reviewed funding intent.
  stage='exclusive-lock';lock=openSync(lockFile,'wx',0o600);writeFileSync(lock,json({token:lockToken,pid:process.pid}));fsyncSync(lock);
  stage='fresh-chain-genesis-and-account-readback';const observed=await inspect(client);let journal=existsSync(journalFile)?readJSON(journalFile):null;
  if(journal){
   stage='signed-journal-validation';keys(journal,['schemaVersion','purpose','implementationHash','plan','entry','receipt']);assert.equal(journal.schemaVersion,1);assert.equal(journal.purpose,'initial-keeper-top-up');assert.equal(journal.implementationHash,implementationHash);
   await validateSignedEntry(journal.entry,journal.plan);
   // Never trust persisted receipt success after a restart; observe the exact hash again.
  }else if(!values.broadcast){
   if(observed.balance>=LIMITS.target){console.log(json({status:'already-funded',keeper:LIMITS.keeper,balanceWei:observed.balance,transactionSent:false}));return;}
   stage='read-only-plan';const plan=makePlan(observed,await client.estimateFeesPerGas({type:'eip1559'}));checkLock();privateJSON(planFile,{implementationHash,plan});
   console.log(json({status:'review-required',scope:'Read-only plan; no key read or transaction sent',plan}));return;
  }else{
   stage='reviewed-plan-authorization';const reviewed=readJSON(planFile);assert.equal(reviewed.implementationHash,implementationHash,'Review this exact helper first');const plan=validatePlan(reviewed.plan);authorizeNewSignature(plan,observed);
   // The recorded planning block must still be canonical before this intent is signed.
   assert.equal((await client.getBlock({blockNumber:uint(plan.observedBlock)})).hash,plan.observedHash,'Planning block reorg');
   stage='sign-and-persist';checkLock();const raw=await signer.signTransaction({chainId:LIMITS.chainId,type:'eip1559',to:LIMITS.keeper,value:uint(plan.value),gas:LIMITS.gas,nonce:plan.nonce,maxFeePerGas:uint(plan.maxFeePerGas),maxPriorityFeePerGas:uint(plan.maxPriorityFeePerGas)});
   const entry={raw,hash:keccak256(raw),...Object.fromEntries(['nonce','value','gas','maxFeePerGas','maxPriorityFeePerGas','maximumCost'].map(key=>[key,plan[key]]))};
   await validateSignedEntry(entry,plan);journal={schemaVersion:1,purpose:'initial-keeper-top-up',implementationHash,plan,entry,receipt:null};
   checkLock();privateJSON(journalFile,journal); // exact signed bytes + nonce durable before broadcast
  }
  const {entry,plan}=journal;
  stage='exact-payment-reconciliation';const state=await reconcile(client,entry,plan,await inspect(client));
  if(state.action==='receipt'){
   journal.receipt=state.receipt;checkLock();privateJSON(journalFile,journal);
   console.log(json({status:state.receipt.status==='success'?'payment-included':'payment-reverted',keeper:LIMITS.keeper,valueWei:plan.value,receipt:state.receipt,scope:'Exact payment receipt; hosted lifecycle acceptance is separate'}));
   if(state.receipt.status!=='success')process.exitCode=2;return;
  }
  if(!values.broadcast){console.log(json({status:state.action,transactionHash:entry.hash,transactionSent:false,note:'Existing signed payment retained; no new payment may be created'}));return;}
  if(state.action==='rebroadcast-exact'){
   stage='exact-raw-broadcast';checkLock();assert.equal(await client.sendRawTransaction({serializedTransaction:entry.raw}),entry.hash,'Unexpected broadcast hash');
  }
  // Bounded observation only. Timeout preserves the signed journal for a later exact-hash read.
  stage='bounded-receipt-observation';try{await client.waitForTransactionReceipt({hash:entry.hash,timeout:45000,pollingInterval:3000});}catch(error){if(error.name!=='WaitForTransactionReceiptTimeoutError')throw error;}
  const receipt=await receiptStatus(client,entry,plan);
  if(receipt){journal.receipt=receipt;checkLock();privateJSON(journalFile,journal);}
  console.log(json({status:receipt?(receipt.status==='success'?'payment-included':'payment-reverted'):'payment-pending',keeper:LIMITS.keeper,valueWei:plan.value,transactionHash:entry.hash,receipt,scope:'One initial payment only; pending/included does not mean finalized or full-product acceptance'}));
  if(!receipt||receipt.status!=='success')process.exitCode=2;
 }finally{if(lock!==undefined){closeSync(lock);if(existsSync(lockFile)&&readJSON(lockFile).token===lockToken)unlinkSync(lockFile);}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(json({status:'blocked',error:'KEEPER_FUNDING_CHECK_FAILED',stage,action:'Preserve plan/journal and inspect privately; do not reset nonce or delete the signed payment'}));process.exitCode=1;});
