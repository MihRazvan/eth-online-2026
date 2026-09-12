import {breakEven,rangeOccupancy} from '../../core/src/economics.mjs';
const key=x=>`${x.chainId}:${x.poolManager.toLowerCase()}:${x.poolId.toLowerCase()}`;
/** Join only data observed at the same authenticated block hash. Analytics never settle claims. */
export function composeAnalysis({series,stream,subgraph,chainHead,chainFinalizedHead,quantity,price,executionCost=0n,maxLag=32}) {
  if(key(series)!==key(stream))throw new Error('Pool or chain mismatch');
  if(subgraph.hasIndexingErrors)throw new Error('Subgraph indexing errors');
  if(subgraph.block!==stream.toBlock||subgraph.hash.toLowerCase()!==stream.blockHash.toLowerCase())throw new Error('Sources must agree on common block and hash');
  if(subgraph.block<series.activationBlock||chainHead<subgraph.block)throw new Error('Invalid source head');
  if(stream.fromBlock>series.activationBlock)throw new Error('Incomplete earning-window history');
  const toBlock=Math.min(subgraph.block+1,series.endBlock+1);
  const occupancy=rangeOccupancy({samples:stream.samples,fromBlock:series.activationBlock,toBlock,tickLower:series.tickLower,tickUpper:series.tickUpper});
  if(chainFinalizedHead!==undefined&&(!Number.isSafeInteger(chainFinalizedHead)||chainFinalizedHead<0||chainFinalizedHead>chainHead))throw new Error('Invalid finalized head');
  const providerFinalized=stream.finalBlockHeight!==undefined&&subgraph.block<=stream.finalBlockHeight;
  const sourceFinalized=providerFinalized&&(chainFinalizedHead===undefined||subgraph.block<=chainFinalizedHead);
  const finalityLagBlocks=chainFinalizedHead===undefined?0:chainHead-chainFinalizedHead;
  const indexingLagBlocks=(sourceFinalized&&chainFinalizedHead!==undefined?chainFinalizedHead:chainHead)-subgraph.block;
  return {
    seriesId:series.id,poolKey:key(series),sourceBlock:subgraph.block,sourceHash:subgraph.hash,
    subgraphDeployment:subgraph.deployment,substreamsPackage:stream.package,substreamsCursor:stream.cursor,substreamsFinalBlock:stream.finalBlockHeight??null,sourceFinalized,
    lagBlocks:chainHead-subgraph.block,indexingLagBlocks,finalityLagBlocks,stale:indexingLagBlocks>maxLag,
    grossBreakEvenUSDC:breakEven({price,quantity,originalSupply:BigInt(series.originalSupply)}).toString(),
    netBreakEvenUSDC:breakEven({price,quantity,originalSupply:BigInt(series.originalSupply),executionCost}).toString(),
    ...occupancy,allocationAuthority:'contract-only',
    caveats:['Historical occupancy is block-weighted end-state context, not within-swap fee attribution.','Pool donations and wash trading can inflate past income. Future income is uncertain.']
  };
}
/** Query at the caller's retained source hash; credentials stay in headers, never results or error text. */
export async function querySubgraph({url,deployment,block,hash,headers={},fetchImpl=fetch}) {
  if(!Number.isSafeInteger(block)||block<0||!/^0x[0-9a-f]{64}$/i.test(hash??''))throw new Error('Expected source block and hash required');
  const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({query:`query FeeStrip($hash: Bytes!) { _meta(block: {hash: $hash}) { block { number hash } deployment hasIndexingErrors } series_collection(first: 100, block: {hash: $hash}, orderBy: id) { id chainId poolManager poolId activationBlock endBlock tickLower tickUpper originalSupply } }`,variables:{hash}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Subgraph HTTP ${response.status}`);
  const body=await response.json();if(body.errors?.length)throw new Error('Subgraph query failed');
  const meta=body.data?._meta;
  if(!meta||meta.deployment!==deployment||meta.block?.number!==block||meta.block?.hash?.toLowerCase()!==hash.toLowerCase()||meta.hasIndexingErrors!==false)throw new Error('Unexpected subgraph deployment or block');
  return {series:body.data.series_collection,meta:{block:meta.block.number,hash:meta.block.hash,deployment:meta.deployment,hasIndexingErrors:meta.hasIndexingErrors}};
}
