// Two-contract Sepolia replacement only. Default --plan is read-only onchain and never loads a key.
// Usage: node scripts/public/upgrade-commitment.mjs [--plan]
// Then, only after review: node scripts/public/upgrade-commitment.mjs --broadcast --env .env
// Requires the exact matching prepare-commitment-upgrade.mjs fork plan and current build.
// Hard-crash recovery: stop all deployment sessions, establish the recorded PID is dead,
// preserve journal.json, and remove only runner.lock offline. Never delete the journal
// to bypass nonce/rehearsal checks. There is no automatic fee replacement or lock stealing.
// Candidate outputs need independent public readback before promotion; two confirmations
// are not finality. No manifest, original evidence, NFT, offer or sale is mutated here.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs,parseEnv} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {createPublicClient,http,encodeDeployData,getContractAddress,keccak256,parseAbi,parseTransaction,recoverTransactionAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sepolia} from 'viem/chains';
import {artifact} from '../chain/common.mjs';

export const LIMITS=Object.freeze({chainId:11155111,maxFeePerGas:50000000000n,totalCost:250000000000000000n,gas:{FeeStrip:6000000n,FeeStripMarket:3000000n}});
const RPC='https://ethereum-sepolia-rpc.publicnode.com';
const DIRECTORY='.scratch/commitment-upgrade',JOURNAL=`${DIRECTORY}/journal.json`,PLAN=`${DIRECTORY}/plan.json`;
const REHEARSAL='.scratch/operations/commitment-upgrade-plan.json';
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b,label)=>assert.equal(String(a).toLowerCase(),String(b).toLowerCase(),label);
function readJSON(path){const stat=lstatSync(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<2*1024*1024,'Unsafe input file');return JSON.parse(readFileSync(path,'utf8'));}
function privateDirectory(){for(const path of ['.scratch',DIRECTORY]){mkdirSync(path,{recursive:true,mode:0o700});const stat=lstatSync(path);assert(stat.isDirectory()&&!stat.isSymbolicLink(),'Unsafe output directory');}}
function save(path,value){assert.equal(resolve(dirname(path)),resolve(DIRECTORY),'Output is outside ignored upgrade directory');
 const temp=`${path}.${randomUUID()}.tmp`,fd=openSync(temp,'wx',0o600);
 try{writeFileSync(fd,json(value));fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temp,path);const parent=openSync(DIRECTORY,'r');try{fsyncSync(parent);}finally{closeSync(parent);}
}
/** Pure authorization check shared by new and resumed signatures, before any broadcast. */
export async function validateSignedEntry(entry,transaction,account){
 assert.equal(entry.name,transaction.name,'Wrong journal deployment');assert.equal(entry.nonce,transaction.nonce,'Wrong journal nonce');
 assert.equal(entry.initCodeHash,keccak256(transaction.data),'Changed initcode');same(entry.address,transaction.address,'Changed CREATE address');
 assert.equal(keccak256(entry.raw),entry.hash,'Signed transaction digest mismatch');same(await recoverTransactionAddress({serializedTransaction:entry.raw}),account,'Wrong persisted signer');
 const tx=parseTransaction(entry.raw);
 assert.equal(tx.type,'eip1559','Wrong transaction type');assert.equal(tx.chainId,LIMITS.chainId,'Wrong signed chain');assert.equal(tx.nonce,transaction.nonce,'Wrong signed nonce');
 assert.equal(tx.to,undefined,'Only CREATE deployments are authorized');assert.equal(tx.value??0n,0n,'Deployment must send zero value');assert.equal(tx.data,transaction.data,'Changed signed initcode');
 assert(tx.gas>0n&&tx.gas<=LIMITS.gas[transaction.name],'Gas limit exceeded');assert(tx.maxFeePerGas>0n&&tx.maxFeePerGas<=LIMITS.maxFeePerGas,'Fee cap exceeded');
 assert(tx.maxPriorityFeePerGas>=0n&&tx.maxPriorityFeePerGas<=tx.maxFeePerGas,'Invalid priority fee');
 assert.equal(String(tx.gas),entry.gas,'Changed gas');assert.equal(String(tx.maxFeePerGas),entry.maxFeePerGas,'Changed maximum fee');
 assert.equal(String(tx.maxPriorityFeePerGas),entry.maxPriorityFeePerGas,'Changed priority fee');
 assert.equal(String(tx.gas*tx.maxFeePerGas),entry.maximumCost,'Changed cost reservation');
 assert(BigInt(entry.maximumCost)<=LIMITS.totalCost,'Authorization budget exceeded');return tx;
}

async function main(){
 const {values}=parseArgs({options:{plan:{type:'boolean',default:false},broadcast:{type:'boolean',default:false},env:{type:'string'}}});
 assert(!(values.plan&&values.broadcast),'Choose plan or broadcast');assert(!values.env||values.broadcast,'A key file is only accepted with --broadcast');
 const mode=values.broadcast?'broadcast':'plan';let stage='configuration',lock;const lockToken=randomUUID();
 const assertLock=()=>{assert(lock!==undefined&&readJSON(`${DIRECTORY}/runner.lock`).token===lockToken,'Upgrade runner lock lost');};
 try{
  privateDirectory();
  // Keep the two artifacts and original public evidence immutable throughout this run.
  const manifest=readJSON('deployments/sepolia.json'),evidence=readJSON('docs/evidence/sepolia-deployment.json'),rehearsal=readJSON(REHEARSAL);
  assert.equal(manifest.chainId,LIMITS.chainId);assert.equal(manifest.mode,'testnet');assert.equal(evidence.chainId,LIMITS.chainId);assert.equal(rehearsal.chainId,LIMITS.chainId);
  same(rehearsal.account,evidence.account,'Rehearsal signer changed');same(rehearsal.oldFeeStrip,manifest.feeStrip,'Old FeeStrip changed');same(rehearsal.oldMarket,manifest.market,'Old market changed');
  assert.equal(rehearsal.transactions.length,2,'Exactly two rehearsal deployments required');
  const account=evidence.account;assert(/^0x[0-9a-f]{40}$/i.test(account),'Malformed account');
  const names=['FeeStrip','FeeStripMarket'],compiled=names.map(name=>artifact(name));
  const fund=compiled[0].abi.filter(item=>item.type==='function'&&item.name==='fundOffer');
  assert.equal(fund.length,1);assert.equal(fund[0].inputs.length,8,'Rehearse the commitment-aware implementation');assert.equal(fund[0].inputs.at(-1).type,'bytes32');
  assert(compiled[0].abi.some(item=>item.type==='function'&&item.name==='positionCommitment'),'Commitment getter missing');
  const transactions=[];
  for(let i=0;i<2;i++){
   const name=names[i],nonce=rehearsal.initialNonce+i;assert(Number.isSafeInteger(nonce)&&nonce>=0,'Invalid rehearsal nonce');
   const address=getContractAddress({from:account,nonce:BigInt(nonce)});
   const args=i===0?[manifest.positionManager,manifest.usdc,manifest.verifier]:[transactions[0].address,manifest.swapRouter];
   const data=encodeDeployData({abi:compiled[i].abi,bytecode:compiled[i].bytecode.object,args}),prior=rehearsal.transactions[i];
   assert.equal(prior.name,name);assert.equal(prior.nonce,nonce);same(prior.address,address,'Rehearsal CREATE address mismatch');
   assert.deepEqual(prior.constructorArgs.map(String).map(x=>x.toLowerCase()),args.map(x=>x.toLowerCase()),'Rehearsal constructors changed');
   assert.equal(prior.calldataHash,keccak256(data),'Current build was not rehearsed');assert(/^0x[0-9a-f]{64}$/i.test(prior.runtimeHash),'Missing rehearsed runtime hash');
   transactions.push({name,nonce,address,args,data,expectedRuntimeHash:prior.runtimeHash});
  }
  const implementationHash=sha(json({source:readFileSync(new URL(import.meta.url),'utf8'),manifest,evidence,rehearsal,artifacts:compiled.map(a=>({abi:a.abi,bytecode:a.bytecode.object}))}));
  let signer,rpc=RPC;
  if(values.broadcast){
   assert(values.env,'Explicit --env path required for broadcast');
   const approved=readJSON(PLAN);assert.equal(approved.implementationHash,implementationHash,'Run --plan for this exact implementation first');
   const stat=lstatSync(values.env);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<65536,'Unsafe key file');
   const env=parseEnv(readFileSync(values.env,'utf8'));assert(/^0x[0-9a-f]{64}$/i.test(env.PRIVATE_KEY??''),'Deployment key missing');
   signer=privateKeyToAccount(env.PRIVATE_KEY);same(signer.address,account,'Key differs from original public deployer');
   rpc=env.SEPOLIA_RPC_URL??env.ENDPOINT_URL;const endpoint=new URL(rpc);assert.equal(endpoint.protocol,'https:','HTTPS Sepolia RPC required');
   lock=openSync(`${DIRECTORY}/runner.lock`,'wx',0o600);writeFileSync(lock,json({pid:process.pid,token:lockToken}));fsyncSync(lock);
  }
  const client=createPublicClient({chain:sepolia,transport:http(rpc,{retryCount:0,timeout:20000})});
  const read=(address,abi,functionName,args=[],blockNumber)=>client.readContract({address,abi,functionName,args,blockNumber});
  const erc20=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)']);
  let journal=existsSync(JOURNAL)?readJSON(JOURNAL):null;
  if(journal){assert.equal(journal.schemaVersion,1);assert.equal(journal.implementationHash,implementationHash,'Journal implementation changed');same(journal.account,account);assert.equal(journal.chainId,LIMITS.chainId);assert.equal(journal.initialNonce,rehearsal.initialNonce);assert(journal.transactions.length<=2);for(let i=0;i<journal.transactions.length;i++)await validateSignedEntry(journal.transactions[i],transactions[i],account);assert(journal.transactions.reduce((sum,t)=>sum+BigInt(t.maximumCost),0n)<=LIMITS.totalCost,'Journal exceeds aggregate budget');}
  async function qualify(){
   stage='canonical Sepolia and old deployment qualification';assert.equal(await client.getChainId(),LIMITS.chainId);
   stage='fresh head qualification';const head=await client.getBlock();assert(Date.now()/1000-Number(head.timestamp)<120&&Number(head.timestamp)<=Date.now()/1000+15,'RPC head is not fresh');
   stage='rehearsal block qualification';assert.equal((await client.getBlock({blockNumber:BigInt(rehearsal.baseBlock)})).hash,rehearsal.baseHash,'Rehearsal fork hash changed');
   if(journal)assert.equal((await client.getBlock({blockNumber:BigInt(journal.startBlock)})).hash,journal.startHash,'Journal start block reorged');
   stage='runtime pins';const pins={...Object.fromEntries(['poolManager','positionManager','usdc'].map(name=>[name,evidence.pins[name]])),...Object.fromEntries(['checkpoints','verifier','feeStrip','aqua','swapRouter','market'].map(name=>{same(evidence.contracts[name].address,manifest[name],'Manifest/evidence address mismatch');return [name,evidence.contracts[name].observedRuntimeHash];}))};
   for(const [name,pin] of Object.entries(pins)){assert(/^0x[0-9a-f]{64}$/i.test(pin),'Missing infrastructure pin');const code=await client.getCode({address:manifest[name],blockNumber:head.number});assert(code&&code!=='0x','Infrastructure missing');same(keccak256(code),pin,'Runtime pin mismatch');}
   stage='reused immutable bindings';for(const [address,abi,key,expected] of [
    [manifest.verifier,artifact('HistoricalFeeVerifier').abi,'poolManager',manifest.poolManager],[manifest.verifier,artifact('HistoricalFeeVerifier').abi,'checkpoints',manifest.checkpoints],[manifest.verifier,artifact('HistoricalFeeVerifier').abi,'managerCodeHash',evidence.pins.poolManager],
    [manifest.feeStrip,compiled[0].abi,'positionManager',manifest.positionManager],[manifest.feeStrip,compiled[0].abi,'poolManager',manifest.poolManager],[manifest.feeStrip,compiled[0].abi,'usdc',manifest.usdc],[manifest.feeStrip,compiled[0].abi,'verifier',manifest.verifier],
    [manifest.swapRouter,artifact('FeeStripRouter').abi,'AQUA',manifest.aqua],[manifest.swapRouter,artifact('FeeStripRouter').abi,'WETH',manifest.other],[manifest.swapRouter,artifact('FeeStripRouter').abi,'owner',account],
    [manifest.market,compiled[1].abi,'feeStrip',manifest.feeStrip],[manifest.market,compiled[1].abi,'router',manifest.swapRouter],
   ])same(await read(address,abi,key,[],head.number),expected,'Infrastructure binding mismatch');
   assert.equal(await read(manifest.verifier,artifact('HistoricalFeeVerifier').abi,'chainId',[],head.number),11155111n);
   assert.equal(await read(manifest.usdc,erc20,'decimals',[],head.number),6);
   stage='old asset and liability emptiness';for(const fn of ['fundedOfferUSDC','reservedUSDC'])assert.equal(await read(manifest.feeStrip,compiled[0].abi,fn,[],head.number),0n,'Old liabilities must be zero');
   assert.equal(await read(manifest.feeStrip,compiled[0].abi,'nextSeriesId',[],head.number),1n,'Active series require a separate migration');
   for(const token of [manifest.usdc,manifest.other,manifest.positionManager])assert.equal(await read(token,erc20,'balanceOf',[manifest.feeStrip],head.number),0n,'Old FeeStrip retains assets');
   assert.equal(await client.getBalance({address:manifest.feeStrip,blockNumber:head.number}),0n,'Old FeeStrip retains native ETH');
   const next=await read(manifest.feeStrip,compiled[0].abi,'nextOfferId',[],head.number);assert(next>=1n&&next<=101n,'Large offer history requires separate review');
   for(let id=1n;id<next;id++){const offer=await read(manifest.feeStrip,compiled[0].abi,'offers',[id],head.number);assert.equal(offer[9],true,'A participant must refund an outstanding old offer');}
   stage='deployer nonce qualification';const latest=await client.getTransactionCount({address:account,blockTag:'latest'}),pending=await client.getTransactionCount({address:account,blockTag:'pending'}),upper=rehearsal.initialNonce+(journal?.transactions.length??0);
   assert(latest>=rehearsal.initialNonce&&latest<=upper,'Wallet nonce changed; preserve journal and review');assert(pending>=latest&&pending<=upper,'Unknown pending wallet transaction');
   assert.equal((await client.getBlock({blockNumber:head.number})).hash,head.hash,'Qualification block changed');
   return {number:head.number,hash:head.hash,latestNonce:latest,pendingNonce:pending,oldNextOfferId:next,balance:await client.getBalance({address:account})};
  }
  const qualified=await qualify();
  if(!journal){assert.equal(qualified.latestNonce,rehearsal.initialNonce,'Rehearse the current nonce');assert.equal(qualified.pendingNonce,qualified.latestNonce,'Wallet has a pending transaction');}
  const fees=await client.estimateFeesPerGas({type:'eip1559'});assert(fees.maxFeePerGas>0n&&fees.maxFeePerGas<=LIMITS.maxFeePerGas&&fees.maxPriorityFeePerGas>=0n&&fees.maxPriorityFeePerGas<=fees.maxFeePerGas,'Current fee estimate exceeds cap');
  const estimates=[];
  stage='deployment cost estimates';
  for(let i=0;i<transactions.length;i++){
   const tx=transactions[i];
   // Market creation checks the new FeeStrip's code. Before it exists, use
   // authenticated exact-initcode fork gas for planning, never a doomed RPC call.
   const dependencyCode=i===0?null:await client.getCode({address:transactions[0].address});
   const dependencyPresent=i===0||!!(dependencyCode&&dependencyCode!=='0x');
   if(dependencyCode&&dependencyCode!=='0x')same(keccak256(dependencyCode),transactions[0].expectedRuntimeHash,'Existing replacement runtime changed');
   const estimate=dependencyPresent?await client.estimateGas({account,data:tx.data,value:0n}):BigInt(rehearsal.transactions[i].gasUsed);
   const gas=estimate*120n/100n;assert(gas>0n&&gas<=LIMITS.gas[tx.name],'Estimated gas exceeds deployment cap');
   estimates.push({gas,maximumCost:gas*fees.maxFeePerGas,source:dependencyPresent?'fresh-public-rpc':'matching-fork-rehearsal-gas-plus-20-percent'});
  }
  const totalEstimate=estimates.reduce((sum,t)=>sum+t.maximumCost,0n);assert(totalEstimate<=LIMITS.totalCost,'Two deployments exceed total authorization');
  if(mode==='plan'){
   const remainingEstimate=estimates.reduce((sum,t,i)=>sum+(journal?.transactions[i]?.receipt?0n:t.maximumCost),0n);assert(qualified.balance>=remainingEstimate,'Insufficient test ETH for remaining deployments');
   const result={scope:'Read-only public qualification; no signature, transaction, or public manifest change',implementationHash,chainId:LIMITS.chainId,account,qualifiedAt:new Date().toISOString(),block:String(qualified.number),blockHash:qualified.hash,latestNonce:qualified.latestNonce,pendingNonce:qualified.pendingNonce,balanceWei:String(qualified.balance),oldFeeStrip:manifest.feeStrip,oldMarket:manifest.market,oldDeploymentEmpty:true,oldNextOfferId:String(qualified.oldNextOfferId),rehearsalFile:REHEARSAL,maximumBudgetWei:String(LIMITS.totalCost),maxFeePerGas:String(fees.maxFeePerGas),transactions:transactions.map(({data,...tx},i)=>({...tx,initCodeHash:keccak256(data),gas:String(estimates[i].gas),maximumCost:String(estimates[i].maximumCost),estimateSource:estimates[i].source})),estimatedTotalMaximumCostWei:String(totalEstimate),resumeEntries:journal?.transactions.length??0};
   save(PLAN,result);console.log(json(result));return;
  }
  if(!journal){journal={schemaVersion:1,chainId:LIMITS.chainId,account,implementationHash,initialNonce:rehearsal.initialNonce,startBlock:String(qualified.number),startHash:qualified.hash,transactions:[]};assertLock();save(JOURNAL,journal);}
  const persist=()=>{assertLock();save(JOURNAL,journal);};
  for(let i=0;i<2;i++){
   const tx=transactions[i];stage=`deploy ${tx.name}`;let entry=journal.transactions[i];
   if(!entry){
    const fresh=await qualify();assert.equal(fresh.latestNonce,tx.nonce,'Unexpected fresh deployment nonce');assert.equal(fresh.pendingNonce,tx.nonce,'Another wallet transaction is pending');
    const fee=await client.estimateFeesPerGas({type:'eip1559'}),gas=(await client.estimateGas({account,data:tx.data,value:0n}))*120n/100n;
    assert(gas>0n&&gas<=LIMITS.gas[tx.name]&&fee.maxFeePerGas>0n&&fee.maxFeePerGas<=LIMITS.maxFeePerGas&&fee.maxPriorityFeePerGas>=0n&&fee.maxPriorityFeePerGas<=fee.maxFeePerGas,'Fee or gas cap exceeded');
    const cost=gas*fee.maxFeePerGas,committed=journal.transactions.reduce((sum,t)=>sum+BigInt(t.maximumCost),0n);
    // Before the first signature reserve sufficient budget/balance for both creations.
    const remaining=i===0?estimates[1].gas*fee.maxFeePerGas:0n;
    assert(committed+cost+remaining<=LIMITS.totalCost,'Total maximum authorization exceeded');assert(fresh.balance>=cost+remaining,'Insufficient deployment ETH');
    assertLock();const raw=await signer.signTransaction({chainId:LIMITS.chainId,type:'eip1559',data:tx.data,value:0n,nonce:tx.nonce,gas,maxFeePerGas:fee.maxFeePerGas,maxPriorityFeePerGas:fee.maxPriorityFeePerGas});
    entry={name:tx.name,nonce:tx.nonce,address:tx.address,initCodeHash:keccak256(tx.data),gas:String(gas),maxFeePerGas:String(fee.maxFeePerGas),maxPriorityFeePerGas:String(fee.maxPriorityFeePerGas),maximumCost:String(cost),raw,hash:keccak256(raw)};
    await validateSignedEntry(entry,tx,account);journal.transactions.push(entry);persist();
   }
   await validateSignedEntry(entry,tx,account);assert(journal.transactions.reduce((sum,t)=>sum+BigInt(t.maximumCost),0n)<=LIMITS.totalCost);
   let receipt;try{receipt=await client.getTransactionReceipt({hash:entry.hash});}catch(error){if(error.name!=='TransactionReceiptNotFoundError')throw error;}
   if(!receipt){
    const fresh=await qualify();assert.equal(fresh.latestNonce,entry.nonce,'Nonce was consumed without the exact receipt');
    let known;try{known=await client.getTransaction({hash:entry.hash});}catch(error){if(error.name!=='TransactionNotFoundError')throw error;}
    if(!known){assert.equal(fresh.pendingNonce,entry.nonce,'Unknown pending replacement; inspect exact nonce');assertLock();const submitted=await client.sendRawTransaction({serializedTransaction:entry.raw});same(submitted,entry.hash,'Broadcast hash mismatch');}
   }
   receipt=await client.waitForTransactionReceipt({hash:entry.hash,confirmations:2,timeout:180000,pollingInterval:3000});
   same(receipt.transactionHash,entry.hash,'Replacement transaction is not authorized');assert.equal(receipt.status,'success','Deployment reverted; do not skip its nonce');same(receipt.from,account,'Wrong receipt sender');assert.equal(receipt.to,null,'Receipt must be contract creation');same(receipt.contractAddress,tx.address,'Wrong deployed address');
   same((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash,'Deployment receipt reorged');
   entry.receipt={transactionHash:receipt.transactionHash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,contractAddress:receipt.contractAddress,gasUsed:String(receipt.gasUsed),effectiveGasPrice:String(receipt.effectiveGasPrice)};persist();
   const code=await client.getCode({address:tx.address});same(keccak256(code),tx.expectedRuntimeHash,'Deployed runtime differs from rehearsal');
   console.log(json({status:'deployment-verified',name:tx.name,address:tx.address,hash:entry.hash}));
  }
  stage='candidate binding verification';const end=await qualify(),feeStrip=transactions[0].address,market=transactions[1].address;
  for(const [address,abi,fn,expected] of [
   ...Object.entries({positionManager:manifest.positionManager,poolManager:manifest.poolManager,usdc:manifest.usdc,verifier:manifest.verifier,positionManagerCodehash:evidence.pins.positionManager,poolManagerCodehash:evidence.pins.poolManager}).map(([fn,value])=>[feeStrip,compiled[0].abi,fn,value]),
   [market,compiled[1].abi,'feeStrip',feeStrip],[market,compiled[1].abi,'router',manifest.swapRouter],
  ])same(await read(address,abi,fn,[],end.number),expected,'New binding mismatch');
  assert.equal(await read(feeStrip,compiled[0].abi,'nextSeriesId',[],end.number),1n);assert.equal(await read(feeStrip,compiled[0].abi,'nextOfferId',[],end.number),1n);
  for(const fn of ['fundedOfferUSDC','reservedUSDC'])assert.equal(await read(feeStrip,compiled[0].abi,fn,[],end.number),0n);
  const commitment=await read(feeStrip,compiled[0].abi,'positionCommitment',[BigInt(manifest.nftIds[0])],end.number);assert(/^0x[0-9a-f]{64}$/i.test(commitment)&&commitment!=='0x'+'00'.repeat(32),'New commitment getter failed');
  same((await client.getBlock({blockNumber:end.number})).hash,end.hash,'Final verification block changed');
  const contracts={...evidence.contracts};for(let i=0;i<2;i++){const tx=transactions[i],a=compiled[i];contracts[i===0?'feeStrip':'market']={name:tx.name,address:tx.address,constructorArgs:tx.args,compiler:a.metadata?.compiler??JSON.parse(a.rawMetadata??'{}').compiler,creationBytecodeHash:keccak256(a.bytecode.object),initCodeHash:keccak256(tx.data),observedRuntimeHash:tx.expectedRuntimeHash};}
  const candidate={...manifest,feeStrip,market,fundingCommitmentVersion:1,deploymentBlock:journal.transactions[0].receipt.blockNumber};
  assertLock();save(`${DIRECTORY}/deployment.candidate.json`,candidate);
  save(`${DIRECTORY}/evidence.candidate.json`,{scope:'Public Sepolia replacement of FeeStrip and FeeStripMarket only; infrastructure reused; no sale activation or settlement acceptance',implementationHash,chainId:LIMITS.chainId,account,pins:evidence.pins,contracts,position:evidence.position,previousDeployment:{manifest:'deployments/sepolia.json',evidence:'docs/evidence/sepolia-deployment.json',feeStrip:manifest.feeStrip,market:manifest.market,oldDeploymentEmptyAt:String(end.number),oldDeploymentEmptyHash:end.hash},transactions:journal.transactions.map(({raw,...entry})=>({...entry,to:null,value:'0',calldataHash:entry.initCodeHash})),commitment,verifiedAt:new Date().toISOString(),verificationBlock:String(end.number),verificationHash:end.hash});
  console.log(json({status:'candidate-files-ready',directory:DIRECTORY,feeStrip,market,publicManifestChanged:false}));
 }catch(error){console.error(json({error:'COMMITMENT_UPGRADE_STOPPED',stage,check:error instanceof assert.AssertionError?error.message.split('\n')[0]:'Network or local input unavailable',note:'No secret diagnostics emitted. Preserve the journal; inspect with a public RPC before resuming.'}));process.exitCode=1;}
 finally{if(lock!==undefined){closeSync(lock);try{if(readJSON(`${DIRECTORY}/runner.lock`).token===lockToken)unlinkSync(`${DIRECTORY}/runner.lock`);}catch{}}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
