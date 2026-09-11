import {breakEven,rangeOccupancy} from '../../core/src/economics.mjs';
const key=x=>`${x.chainId}:${x.poolManager.toLowerCase()}:${x.poolId.toLowerCase()}`;
/** Join only data observed at the same authenticated block hash. Analytics never settle claims. */
export function composeAnalysis({series,stream,subgraph,chainHead,quantity,price,executionCost=0n,maxLag=32}) {
  if(key(series)!==key(stream))throw new Error('Pool or chain mismatch');
  if(subgraph.hasIndexingErrors)throw new Error('Subgraph indexing errors');
  if(subgraph.block!==stream.toBlock||subgraph.hash.toLowerCase()!==stream.blockHash.toLowerCase())throw new Error('Sources must agree on common block and hash');
  if(subgraph.block<series.activationBlock||chainHead<subgraph.block)throw new Error('Invalid source head');
  if(stream.fromBlock>series.activationBlock)throw new Error('Incomplete earning-window history');
  const toBlock=Math.min(subgraph.block+1,series.endBlock+1);
  const occupancy=rangeOccupancy({samples:stream.samples,fromBlock:series.activationBlock,toBlock,tickLower:series.tickLower,tickUpper:series.tickUpper});
  return {
    seriesId:series.id,poolKey:key(series),sourceBlock:subgraph.block,sourceHash:subgraph.hash,
    subgraphDeployment:subgraph.deployment,substreamsPackage:stream.package,substreamsCursor:stream.cursor,substreamsFinalBlock:stream.finalBlockHeight??null,sourceFinalized:stream.finalBlockHeight===undefined?false:subgraph.block<=stream.finalBlockHeight,
    lagBlocks:chainHead-subgraph.block,stale:chainHead-subgraph.block>maxLag,
    grossBreakEvenUSDC:breakEven({price,quantity,originalSupply:BigInt(series.originalSupply)}).toString(),
    netBreakEvenUSDC:breakEven({price,quantity,originalSupply:BigInt(series.originalSupply),executionCost}).toString(),
    ...occupancy,allocationAuthority:'contract-only',
    caveats:['Historical occupancy is block-weighted end-state context, not within-swap fee attribution.','Pool donations and wash trading can inflate past income. Future income is uncertain.']
  };
}
/** Query an immutable block selection; credentials stay in request headers, never results or error text. */
export async function querySubgraph({url,deployment,block,headers={},fetchImpl=fetch}) {
  const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({query:`query FeeStrip($block: Int!) { _meta(block: {number: $block}) { block { number hash } deployment hasIndexingErrors } series_collection(first: 100, block: {number: $block}, orderBy: id) { id chainId poolManager poolId activationBlock endBlock tickLower tickUpper originalSupply } }`,variables:{block}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Subgraph HTTP ${response.status}`);
  const body=await response.json();if(body.errors?.length)throw new Error('Subgraph query failed');
  const meta=body.data?._meta;
  if(!meta||meta.deployment!==deployment||meta.block.number!==block||!meta.block.hash)throw new Error('Unexpected subgraph deployment or block');
  return {series:body.data.series_collection,meta:{block:meta.block.number,hash:meta.block.hash,deployment:meta.deployment,hasIndexingErrors:meta.hasIndexingErrors}};
}
