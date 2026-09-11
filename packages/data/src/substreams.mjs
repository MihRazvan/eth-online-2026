/** Durable bridge from Substreams RPC BlockScopedData/BlockUndoSignal into HistoryStore.
 * The public CLI jsonl renderer omits provider cursors and is intentionally rejected here.
 * No events, estimates, checkpoints, or this store authorize fee allocation.
 */
const HASH=/^0x[0-9a-f]{64}$/;
const ADDRESS=/^0x[0-9a-f]{40}$/;
function hex(value,pattern,label){if(typeof value!=='string')throw new Error(`Missing ${label}`);const v=(value.startsWith('0x')?value:`0x${value}`).toLowerCase();if(!pattern.test(v))throw new Error(`Invalid ${label}`);return v;}
function integer(value,label,{signed=false,defaultValue}={}){if(value===undefined&&defaultValue!==undefined)return defaultValue;if(!['number','string','bigint'].includes(typeof value))throw new Error(`Invalid ${label}`);if(typeof value==='bigint')value=value.toString();if(typeof value==='string'&&!/^-?\d+$/.test(value))throw new Error(`Invalid ${label}`);const v=Number(value);if(!Number.isSafeInteger(v)||(!signed&&v<0))throw new Error(`Invalid ${label}`);return v;}
function tick(value){const n=integer(value,'tick',{signed:true,defaultValue:0});if(n< -887272||n>887272)throw new Error('Invalid tick');return n;}
function cursor(value){if(typeof value!=='string'||value.length===0)throw new Error('Missing provider cursor');return value;}
function amount(value,signed=false){if(typeof value!=='string'||!(signed?/^-?\d+$/:/^\d+$/).test(value))throw new Error('Invalid exact integer amount');return value;}
function array(value){if(value===undefined)return [];if(!Array.isArray(value))throw new Error('Invalid event collection');return value;}
function record(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid context record');return value;}

export class SubstreamsHistorySink {
 constructor(store,{chainId,poolManager,poolIds,packageHash,finalBlocksOnly=true}){
  this.store=store;
  this.identity={chainId:integer(chainId,'chain ID'),poolManager:hex(poolManager,ADDRESS,'pool manager'),poolIds:[...new Set(poolIds.map(p=>hex(p,HASH,'pool ID')))].sort(),packageHash:hex(packageHash,HASH,'package hash')};
  if(!this.identity.chainId||this.identity.poolIds.length===0)throw new Error('Explicit nonempty pool selection required');
  this.finalBlocksOnly=finalBlocksOnly;this.checkpoint();
 }
 checkpoint(){const head=this.store.head();if(!head)return undefined;let saved;try{saved=JSON.parse(head.cursor);}catch{throw new Error('Incompatible checkpoint; explicit resync required');}
  if(saved.version!==1||JSON.stringify(saved.identity)!==JSON.stringify(this.identity))throw new Error('Stream identity changed; explicit resync required');
  cursor(saved.providerCursor);integer(saved.finalBlockHeight,'final height');return {...saved,number:head.number,hash:head.hash};
 }
 encodedCheckpoint(providerCursor,finalBlockHeight){return JSON.stringify({version:1,identity:this.identity,providerCursor:cursor(providerCursor),finalBlockHeight:integer(finalBlockHeight,'final height')});}
 applyBlock({clock,providerCursor,finalBlockHeight,output,module='map_pool_context',partial=false}){
  if(partial)throw new Error('Partial blocks are unsupported');
  if(module!=='map_pool_context')throw new Error('Unexpected Substreams output module');
  const c=record(output);const number=integer(c.number,'block number');const hash=hex(c.hash,HASH,'block hash');const parentHash=hex(c.parentHash,HASH,'parent hash');
  const finalHeight=integer(finalBlockHeight,'final height');
  if(this.finalBlocksOnly&&number>finalHeight)throw new Error('Unfinalized block rejected');
  if(integer(clock?.number,'clock number')!==number||hex(clock?.id,HASH,'clock hash')!==hash)throw new Error('Output/transport clock mismatch');
  if(integer(c.chainId,'chain ID')!==this.identity.chainId||hex(c.poolManager,ADDRESS,'pool manager')!==this.identity.poolManager)throw new Error('Chain or manager mismatch');
  if(c.donationsIncluded===true||c.allocationAuthority!=='contract-only')throw new Error('Unexpected analytics authority or donation coverage');
  integer(c.timestamp,'timestamp');cursor(providerCursor);
  const checkpoint=this.checkpoint();
  if(checkpoint&&finalHeight<checkpoint.finalBlockHeight)throw new Error('Finality regressed');
  const seen=new Set();const samples=[];
  const event=e=>{record(e);const pool=hex(e.poolId,HASH,'pool ID');const logIndex=integer(e.logIndex,'log index',{defaultValue:0});
   if(seen.has(logIndex))throw new Error('Duplicate context log index');seen.add(logIndex);hex(e.transactionHash,HASH,'transaction hash');return {pool,logIndex,selected:this.identity.poolIds.includes(pool)};};
  for(const e of array(c.initialized)){const m=event(e);hex(e.currency0,ADDRESS,'currency0');hex(e.currency1,ADDRESS,'currency1');hex(e.hooks,ADDRESS,'hooks');integer(e.fee,'fee',{defaultValue:0});integer(e.tickSpacing,'tick spacing',{signed:true});amount(e.sqrtPriceX96);const t=tick(e.tick);if(m.selected)samples.push({chainId:this.identity.chainId,manager:this.identity.poolManager,pool:m.pool,logIndex:m.logIndex,tick:t});}
  for(const e of array(c.swaps)){const m=event(e);amount(e.amount0,true);amount(e.amount1,true);amount(e.liquidity);amount(e.sqrtPriceX96);integer(e.fee,'fee',{defaultValue:0});const t=tick(e.tick);if(m.selected)samples.push({chainId:this.identity.chainId,manager:this.identity.poolManager,pool:m.pool,logIndex:m.logIndex,tick:t});}
  for(const e of array(c.liquidityChanges)){event(e);if(tick(e.tickLower)>=tick(e.tickUpper))throw new Error('Invalid liquidity interval');amount(e.liquidityDelta,true);hex(e.sender,ADDRESS,'liquidity sender');hex(e.salt,HASH,'position salt');}
  samples.sort((a,b)=>a.logIndex-b.logIndex);
  const savedCursor=this.encodedCheckpoint(providerCursor,finalHeight);
  if(checkpoint?.number===number&&checkpoint.hash===hash)this.store.undo(number,hash,savedCursor);
  else this.store.apply({number,hash,parentHash,cursor:savedCursor,swaps:samples});
  return {number,hash,sampleCount:samples.length,finalBlockHeight:finalHeight,allocationAuthority:'contract-only'};
 }
 undo({number,hash,providerCursor}){
  const checkpoint=this.checkpoint();if(!checkpoint)throw new Error('Cannot undo an empty stream');
  number=integer(number,'undo number');hash=hex(hash,HASH,'undo hash');
  if(number<checkpoint.finalBlockHeight)throw new Error('Undo crosses finality; explicit resync required');
  this.store.undo(number,hash,this.encodedCheckpoint(providerCursor,checkpoint.finalBlockHeight));
  return this.checkpoint();
 }
 analysisStream({poolId,fromBlock,toBlock}){
  const checkpoint=this.checkpoint();if(!checkpoint)throw new Error('No observed stream data');
  const pool=hex(poolId,HASH,'pool ID');if(!this.identity.poolIds.includes(pool))throw new Error('Pool is outside the retained selection');
  const target=toBlock??checkpoint.number;const row=this.store.db.prepare('SELECT hash,cursor FROM blocks WHERE number=?').get(target);
  if(!row)throw new Error('Common source block is not retained');const metadata=JSON.parse(row.cursor);
  return {chainId:this.identity.chainId,poolManager:this.identity.poolManager,poolId:pool,fromBlock,toBlock:target,blockHash:row.hash,
   cursor:metadata.providerCursor,package:this.identity.packageHash,finalBlockHeight:metadata.finalBlockHeight,
   samples:this.store.samples({chainId:this.identity.chainId,manager:this.identity.poolManager,pool,fromBlock,toBlock:target})};
 }
}
