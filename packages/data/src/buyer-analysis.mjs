import {composeAnalysis} from './compose.mjs';
const safeInt=value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Source integer exceeds supported range');return n;};
async function query(url,headers,query,variables,fetchImpl){
 const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Subgraph HTTP ${response.status}`);
 const body=await response.json();if(body.errors?.length||!body.data)throw new Error('Subgraph query failed');return body.data;
}
function meta(data,deployment){const m=data._meta;if(!m||m.deployment!==deployment||m.hasIndexingErrors||!/^0x[0-9a-f]{64}$/i.test(m.block?.hash??''))throw new Error('Subgraph deployment, hash or indexing status invalid');return {block:safeInt(m.block.number),hash:m.block.hash,deployment,hasIndexingErrors:false};}
function checkpoint(row,series,expectedPackage){
 let saved;try{saved=JSON.parse(row.cursor);}catch{throw new Error('Persisted Substreams identity unavailable');}
 const id=saved.identity;
 if(saved.version!==1||!id||id.chainId!==series.chainId||id.poolManager?.toLowerCase()!==series.poolManager.toLowerCase()||!id.poolIds?.some(pool=>pool.toLowerCase()===series.poolId.toLowerCase())||!/^0x[0-9a-f]{64}$/i.test(id.packageHash??'')||id.packageHash.toLowerCase()!==expectedPackage.toLowerCase()||typeof saved.providerCursor!=='string'||!saved.providerCursor||(!Number.isSafeInteger(saved.finalBlockHeight)||saved.finalBlockHeight<0))throw new Error('Persisted Substreams identity or pool selection mismatch');
 return saved;
}
/** Actual persisted Substreams history + pinned live Subgraph at a shared block. No synthetic fallback. */
export async function loadBuyerAnalysis({store,url,deployment,headers={},seriesId,chainId,chainHead,packageIdentity,quantity,price,executionCost=0n,fetchImpl=fetch}){
 const streamHead=store.head(),first=store.first();if(!streamHead||!first)throw new Error('Substreams history unavailable');
 const latest=meta(await query(url,headers,'query { _meta { block { number hash } deployment hasIndexingErrors } }',{},fetchImpl),deployment);
 const block=Math.min(streamHead.number,latest.block,safeInt(chainHead));
 const data=await query(url,headers,'query BuyerAnalysis($block: Int!, $id: ID!) { _meta(block: {number: $block}) { block { number hash } deployment hasIndexingErrors } series(id: $id, block: {number: $block}) { id chainId poolManager poolId activationBlock endBlock tickLower tickUpper originalSupply closed redeemedQuantity } }',{block,id:String(seriesId)},fetchImpl);
 const source=meta(data,deployment);if(source.block!==block||!data.series)throw new Error('Series unavailable at common source block');
 const raw=data.series;const series={...raw,chainId:safeInt(raw.chainId),activationBlock:safeInt(raw.activationBlock),endBlock:safeInt(raw.endBlock),tickLower:safeInt(raw.tickLower),tickUpper:safeInt(raw.tickUpper)};
 if(raw.closed!==false||BigInt(raw.redeemedQuantity)>=BigInt(raw.originalSupply))throw new Error('Closed or fully redeemed series has no purchasable fee income');
 if(series.chainId!==safeInt(chainId))throw new Error('Configured chain differs from Subgraph');
 // Query metadata and ticks together AFTER the network await. A WAL read snapshot
 // prevents a concurrent sink reorg from attributing new-fork ticks to an old hash.
 const snapshot=store.snapshotSamples({number:block,chainId:series.chainId,manager:series.poolManager,pool:series.poolId,fromBlock:series.activationBlock});
 if(!snapshot.block||!snapshot.first)throw new Error('Common source block not retained');
 const saved=checkpoint(snapshot.block,series,packageIdentity);checkpoint(snapshot.first,series,packageIdentity);
 const stream={chainId:series.chainId,poolManager:series.poolManager,poolId:series.poolId,fromBlock:snapshot.first.number,toBlock:block,blockHash:snapshot.block.hash,package:saved.identity.packageHash,cursor:saved.providerCursor,finalBlockHeight:saved.finalBlockHeight,samples:snapshot.samples};
 return composeAnalysis({series,stream,subgraph:source,chainHead:safeInt(chainHead),quantity,price,executionCost});
}
