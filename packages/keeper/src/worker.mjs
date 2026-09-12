import {encodeFunctionData,keccak256,parseAbi,zeroHash} from 'viem';
import {keeperConfig,fail,safeError} from './config.mjs';
import {clientsFor,observe,assertObservation,feeStripAbi} from '../../settlement/src/chain.mjs';
export const checkpointAbi=parseAbi(['function checkpoint(uint256) returns (bytes32)','function hashes(uint256) view returns (bytes32)']);
const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
const max=(a,b)=>a>b?a:b;
const receiptJSON=r=>({blockNumber:String(r.blockNumber),blockHash:r.blockHash,status:r.status,transactionHash:r.transactionHash,gasUsed:String(r.gasUsed),effectiveGasPrice:String(r.effectiveGasPrice)});
/** One fixed permissionless call. This worker never holds or moves sale assets. */
export class CheckpointKeeper {
 constructor(config,store,{client,account,observe:observer=observe}={}){
  this.config=keeperConfig(config);this.store=store;this.client=client??clientsFor(this.config)[0];this.account=account;this.observe=observer;
  if(account&&!same(account.address,this.config.expectedSigner))fail('KEEPER_SIGNER_MISMATCH');
  if(this.config.enabled&&!account)fail('KEEPER_PRIVATE_KEY_REQUIRED');
  store.bind(this.config.fingerprint);this.busy=false;
 }
 publicStatus(){return this.store.get('publicStatus')??{status:'not-observed',chainId:this.config.chainId,signer:this.config.expectedSigner};}
 async tick(){
  if(this.busy)return {status:'busy'};this.busy=true;
  const c=this.config,s=this.store;
  let result={...this.publicStatus(),status:'unavailable',readyToSign:false};
  try{
   s.assertLock();let observation=await this.observe(this.client,c);await this.checkFinality(observation);
   const [balance,fees]=await Promise.all([this.client.getBalance({address:c.expectedSigner}),this.client.estimateFeesPerGas({type:'eip1559'})]);
   const feeCost=fees.maxFeePerGas*BigInt(c.gasLimit);
   const gasReady=fees.maxFeePerGas<=BigInt(c.maxFeePerGas)&&fees.maxPriorityFeePerGas<=BigInt(c.maxPriorityFeePerGas)&&feeCost<=BigInt(c.maxTxCostWei)&&s.reserveCost()+feeCost<=BigInt(c.dailyBudgetWei);
   const headFresh=Number(observation.head.timestamp)*1000>=s.clock()-c.maxHeadAgeSeconds*1000;
   result={...result,status:c.enabled?'observed':'disabled',chainId:c.chainId,checkpoints:c.checkpoints,feeStrip:c.feeStrip,signer:c.expectedSigner,enabled:c.enabled,observedHead:String(observation.head.number),observedAt:new Date(s.clock()).toISOString(),observedAtMs:s.clock(),headTimestamp:String(observation.head.timestamp),headFresh,gasReady,balanceWei:String(balance),lowBalance:balance<feeCost+BigInt(c.minBalanceWei),lastError:null,configFingerprint:c.fingerprint};
   result.discoveryComplete=await this.discover(observation);
   const pending=await this.reconcile(observation);
   const due=s.db.prepare("SELECT * FROM jobs WHERE state IN ('waiting','due') AND end_block<? ORDER BY end_block,id LIMIT ?").all(Number(observation.head.number),c.pageSize);
   // Recheck terminal observations in bounded rotating pages so reorgs cannot freeze stale success.
   const maintenanceCursor=s.get('maintenanceCursor')??0;
   let maintenance=s.db.prepare("SELECT * FROM jobs WHERE state IN ('missed','checkpointed') AND id>? ORDER BY id LIMIT ?").all(maintenanceCursor,c.pageSize);
   if(!maintenance.length)maintenance=s.db.prepare("SELECT * FROM jobs WHERE state IN ('missed','checkpointed') ORDER BY id LIMIT ?").all(c.pageSize);
   s.set('maintenanceCursor',maintenance.at(-1)?.id??0);
   due.push(...maintenance);
   let candidate=null;
   for(const job of due){
    const valid=await this.inspect(job,observation);if(valid&&!candidate)candidate=job;
   }
   result.pendingEndpoints=s.db.prepare("SELECT count(*) AS n FROM jobs WHERE state IN ('waiting','due')").get().n;
   result.missedEndpoints=s.db.prepare("SELECT count(*) AS n FROM jobs WHERE state='missed'").get().n;
   result.checkpointedEndpoints=s.db.prepare("SELECT count(*) AS n FROM jobs WHERE state='checkpointed'").get().n;
   result.pendingTransactions=s.activeTxs().filter(t=>t.state!=='mined').length;
   result.dailyReservedWei=String(s.reserveCost());
   result.readyToSign=c.enabled&&!result.lowBalance&&gasReady&&headFresh&&result.discoveryComplete;
   if(c.enabled){
    if(pending){
     if(observation.head.number-BigInt(pending.head)>=BigInt(c.replaceAfterBlocks))await this.send(BigInt(pending.endpoint),observation,pending);
    }else if(candidate){await this.send(BigInt(candidate.end_block),observation);}
   }
   result.pendingTransactions=s.activeTxs().filter(t=>t.state!=='mined').length;
   result.dailyReservedWei=String(s.reserveCost());
   // Readiness describes capacity after this tick's signatures and receipts.
   const [latestNonce,pendingNonce,currentBalance]=await Promise.all([this.client.getTransactionCount({address:c.expectedSigner,blockTag:'latest'}),this.client.getTransactionCount({address:c.expectedSigner,blockTag:'pending'}),this.client.getBalance({address:c.expectedSigner})]);
   const outstanding=new Map();
   for(const tx of s.activeTxs().filter(t=>t.state!=='mined'))outstanding.set(tx.nonce,max(outstanding.get(tx.nonce)??0n,BigInt(tx.reserved)));
   if(pendingNonce>latestNonce&&(!outstanding.has(latestNonce)||pendingNonce>latestNonce+1))fail('SIGNER_NONCE_NOT_EXCLUSIVE');
   const reservedBalance=[...outstanding.values()].reduce((sum,value)=>sum+value,0n);
   result.gasReady=gasReady&&s.reserveCost()+feeCost<=BigInt(c.dailyBudgetWei);
   result.balanceWei=String(currentBalance);result.lowBalance=currentBalance<reservedBalance+feeCost+BigInt(c.minBalanceWei);
   result.readyToSign=c.enabled&&!result.lowBalance&&result.gasReady&&headFresh&&result.discoveryComplete;
   result.lastSuccess=s.get('lastSuccess');
   s.set('publicStatus',result);return result;
  }catch(error){
   result={...result,status:'unavailable',readyToSign:false,lastError:safeError(error),observationErrorAt:new Date(s.clock()).toISOString()};
   try{s.set('publicStatus',result);}catch{}
   return result;
  }finally{this.busy=false;}
 }
 async checkFinality(observation){
  const previous=this.store.get('finalized');
  if(previous){
   if(observation.head.number<BigInt(previous.number)||(observation.finalized&&observation.finalized.number<BigInt(previous.number)))fail('FINALITY_REGRESSION');
   if(!same((await this.client.getBlock({blockNumber:BigInt(previous.number)})).hash,previous.hash))fail('FINALITY_CONFLICT');
  }
  await assertObservation(this.client,observation);
  if(observation.finalized)this.store.set('finalized',{number:String(observation.finalized.number),hash:observation.finalized.hash});
 }
 async discover(observation){
  const c=this.config,s=this.store,head=observation.head.number;
  const next=await this.client.readContract({address:c.feeStrip,abi:feeStripAbi,functionName:'nextSeriesId',blockNumber:head});
  if(next<1n||next>1000000000n)fail('SERIES_DISCOVERY_LIMIT');
  let cursor=BigInt(s.get('cursor')??'1'),through=BigInt(s.get('discoveredThrough')??'0');
  const prior=s.get('discoveryHead');
  if(prior&&(head<BigInt(prior.number)||!same((await this.client.getBlock({blockNumber:BigInt(prior.number)})).hash,prior.hash))){cursor=1n;through=0n;}
  if(cursor>=next)cursor=1n;
  const records=[];
  for(let i=0;i<c.pageSize&&cursor<next;i++,cursor++){
   const series=await this.client.readContract({address:c.feeStrip,abi:feeStripAbi,functionName:'series',args:[cursor],blockNumber:head});
   this.validateSeries(series,head);records.push([cursor,series]);
  }
  await assertObservation(this.client,observation);s.assertLock();
  s.db.prepare("UPDATE jobs SET state='orphaned' WHERE id>=?").run(Number(next));
  for(const [id,series] of records){
   // Even allocated/closed series can harmlessly receive a checkpoint. Avoid relying on mutable closure observations.
   const old=s.db.prepare('SELECT * FROM jobs WHERE id=?').get(Number(id));
   s.upsert(id,series.endBlock,old&&old.state!=='orphaned'&&old.end_block===Number(series.endBlock)?old.state:'waiting');
  }
  through=max(through,cursor-1n);s.set('cursor',String(cursor));s.set('discoveredThrough',String(through));
  s.set('discoveryHead',{number:String(head),hash:observation.head.hash});
  return through>=next-1n;
 }
 validateSeries(series,head){if(series.quantity===0n||series.liquidity===0n||series.endBlock<=series.activationBlock||series.activationBlock>head||series.endBlock>BigInt(Number.MAX_SAFE_INTEGER))fail('INVALID_SERIES_TERMS');}
 async inspect(job,observation){
  const c=this.config,n=BigInt(job.end_block),head=observation.head.number;
  const current=await this.client.readContract({address:c.feeStrip,abi:feeStripAbi,functionName:'series',args:[BigInt(job.id)],blockNumber:head});
  if(current.quantity===0n){this.store.state(job.id,'orphaned');return false;}
  this.validateSeries(current,head);
  if(current.endBlock!==n){this.store.upsert(job.id,current.endBlock,'waiting');return false;}
  if(head<=n){this.store.state(job.id,'waiting');return false;}
  const [stored,block]=await Promise.all([this.client.readContract({address:c.checkpoints,abi:checkpointAbi,functionName:'hashes',args:[n],blockNumber:head}),this.client.getBlock({blockNumber:n})]);
  await assertObservation(this.client,observation);
  if(stored!==zeroHash){if(!same(stored,block.hash))fail('CHECKPOINT_CONFLICT');this.store.state(job.id,'checkpointed',block.hash);return false;}
  if(head>=n+256n){this.store.state(job.id,'missed');return false;}
  this.store.state(job.id,'due');return head>n&&head<=n+256n-BigInt(c.broadcastMarginBlocks);
 }
 async reconcile(observation){
  const s=this.store,client=this.client,groups=new Map();
  for(const tx of s.activeTxs()){if(!groups.has(tx.nonce))groups.set(tx.nonce,[]);groups.get(tx.nonce).push(tx);}
  if(groups.size>128)fail('TRANSACTION_RECONCILIATION_LIMIT');
  let pending=null;
  for(const [nonce] of groups){
   const txs=s.nonceTxs(nonce);
   let mined=null;
   for(const tx of txs){
    let receipt;try{receipt=await client.getTransactionReceipt({hash:tx.hash});}catch(error){if(error.name!=='TransactionReceiptNotFoundError')throw error;}
    if(!receipt)continue;
    if(!same((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash))continue;
    mined={tx,receipt};break;
   }
   if(mined){
    const {tx,receipt}=mined;
    for(const other of txs)if(other.hash!==tx.hash)s.txState(other.hash,'replaced');
    const finalized=observation.finalized&&observation.finalized.number>=receipt.blockNumber;
    s.txState(tx.hash,finalized?(receipt.status==='success'?'confirmed':'failed'):'mined',receiptJSON(receipt));
    if(receipt.status==='success'){
     const stored=await client.readContract({address:this.config.checkpoints,abi:checkpointAbi,functionName:'hashes',args:[BigInt(tx.endpoint)],blockNumber:observation.head.number});
     const endpoint=await client.getBlock({blockNumber:BigInt(tx.endpoint)});
     if(!same(stored,endpoint.hash))fail('CHECKPOINT_RECEIPT_MISMATCH');
     s.set('lastSuccess',{endpoint:String(tx.endpoint),hash:tx.hash,blockNumber:String(receipt.blockNumber),finalized:Boolean(finalized)});
    }
    continue;
   }
   if(txs.some(t=>t.hash===s.get('lastSuccess')?.hash))s.set('lastSuccess',null);
   const latest=await client.getTransactionCount({address:this.config.expectedSigner,blockTag:'latest'});
   if(latest>nonce)fail('NONCE_CONSUMED_WITHOUT_KNOWN_RECEIPT');
   if(latest<nonce)fail('NONCE_GAP');
   const current=txs.sort((a,b)=>BigInt(a.max_fee)>BigInt(b.max_fee)?-1:1)[0];
   if(pending)fail('MULTIPLE_PENDING_NONCES');
   pending=current;
   // A journaled signature survives a crash before broadcast. Rebroadcast identical bytes only in its valid window.
   if(this.config.enabled&&observation.head.number>BigInt(current.endpoint)&&observation.head.number<=BigInt(current.endpoint)+256n-BigInt(this.config.broadcastMarginBlocks)){
    await this.broadcast(current,observation);
   }else if(observation.head.number>=BigInt(current.endpoint)+256n)fail('EXPIRED_PENDING_NONCE_REQUIRES_OPERATOR');
  }
  return pending;
 }
 async broadcast(tx,observation){
  this.store.assertLock();await assertObservation(this.client,observation);
  const latest=await this.client.getBlock({blockTag:'latest'});
  if(Number(latest.timestamp)*1000<this.store.clock()-this.config.maxHeadAgeSeconds*1000)fail('RPC_HEAD_STALE');
  if(latest.number<=BigInt(tx.endpoint)||latest.number>BigInt(tx.endpoint)+256n-BigInt(this.config.broadcastMarginBlocks))fail('CHECKPOINT_WINDOW_CLOSED');
  try{
   const hash=await this.client.sendRawTransaction({serializedTransaction:tx.raw});
   if(!same(hash,tx.hash))fail('BROADCAST_HASH_MISMATCH');
   this.store.txState(tx.hash,'broadcast');
  }catch(error){if(error?.code==='BROADCAST_HASH_MISMATCH')throw error;/* ambiguous RPC response: journal remains retryable */}
 }
 async send(n,observation,previous=null){
  const c=this.config,s=this.store;
  if(!c.enabled)return;
  if(observation.head.number<=n||observation.head.number>n+256n-BigInt(c.broadcastMarginBlocks))fail('CHECKPOINT_WINDOW_CLOSED');
  const versions=previous?s.nonceTxs(previous.nonce):[];
  if(versions.length>c.maxReplacements)fail('REPLACEMENT_LIMIT');
  // Re-observe every immutable pin immediately before preparing a signature.
  const fresh=await this.observe(this.client,c);await this.checkFinality(fresh);
  if(Number(fresh.head.timestamp)*1000<s.clock()-c.maxHeadAgeSeconds*1000)fail('RPC_HEAD_STALE');
  if(fresh.head.number<=n||fresh.head.number>n+256n-BigInt(c.broadcastMarginBlocks))fail('CHECKPOINT_WINDOW_CLOSED');
  const job=s.db.prepare('SELECT * FROM jobs WHERE end_block=? AND state IN (\'due\',\'waiting\') LIMIT 1').get(Number(n));
  if(!job||!await this.inspect(job,fresh))return;
  const [latest,pending,fees,balance]=await Promise.all([this.client.getTransactionCount({address:c.expectedSigner,blockTag:'latest'}),this.client.getTransactionCount({address:c.expectedSigner,blockTag:'pending'}),this.client.estimateFeesPerGas({type:'eip1559'}),this.client.getBalance({address:c.expectedSigner})]);
  const nonce=previous?previous.nonce:latest;
  if(latest!==nonce||(!previous&&pending!==latest)||(previous&&pending>nonce+1))fail('SIGNER_NONCE_NOT_EXCLUSIVE');
  const bump=value=>(BigInt(value)*113n+99n)/100n;
  const fee=previous?max(fees.maxFeePerGas,bump(previous.max_fee)):fees.maxFeePerGas;
  const tip=previous?max(fees.maxPriorityFeePerGas,bump(previous.priority_fee)):fees.maxPriorityFeePerGas;
  if(fee>BigInt(c.maxFeePerGas)||tip>BigInt(c.maxPriorityFeePerGas))fail('GAS_PRICE_CAP');
  const cost=BigInt(c.gasLimit)*fee;
  if(cost>BigInt(c.maxTxCostWei))fail('TRANSACTION_COST_CAP');
  if(s.reserveCost()+cost>BigInt(c.dailyBudgetWei))fail('DAILY_BUDGET_CAP');
  if(balance<cost+BigInt(c.minBalanceWei))fail('LOW_KEEPER_BALANCE');
  const data=encodeFunctionData({abi:checkpointAbi,functionName:'checkpoint',args:[n]});
  const transaction={chainId:c.chainId,type:'eip1559',to:c.checkpoints,data,value:0n,nonce,gas:BigInt(c.gasLimit),maxFeePerGas:fee,maxPriorityFeePerGas:tip};
  const estimate=await this.client.estimateGas({...transaction,account:c.expectedSigner});
  if(estimate>transaction.gas)fail('GAS_LIMIT_CAP');
  await assertObservation(this.client,fresh);s.assertLock();
  const raw=await this.account.signTransaction(transaction);s.assertLock();
  const tx={hash:keccak256(raw),nonce,endpoint:Number(n),raw,max_fee:String(fee),priority_fee:String(tip),reserved:String(cost),head:Number(fresh.head.number)};
  s.journal(tx); // FULL synchronous SQLite durability precedes every broadcast.
  await this.broadcast(tx,fresh);
 }
}
