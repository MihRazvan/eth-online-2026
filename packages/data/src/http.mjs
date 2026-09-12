import {createPublicClient,http} from 'viem';
import {HistoryStore} from './store.mjs';
import {loadBuyerAnalysis} from './buyer-analysis.mjs';

const unavailable={error:'Verified historical activity is not available yet. The project operator needs to check the history service and indexing status. No estimate has been substituted.',allocationAuthority:'contract-only'};
function reply(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));}
const keys=['seriesId','quantity','price','executionCost'];
const uint256=(1n<<256n)-1n;
/** Local read-only SQLite + pinned Graph deployment. Never receives signing or storage credentials. */
export function analysisHandler(config,{client=createPublicClient({transport:http(config.rpcUrl,{timeout:4000,retryCount:0})}),fetchImpl=fetch}={}){
 for(const key of ['rpcUrl','subgraphUrl','deployment','database','packageIdentity'])if(!config[key])throw new Error(`Missing analysis configuration: ${key}`);
 if(!/^0x[0-9a-f]{64}$/i.test(config.packageIdentity))throw new Error('Invalid analysis package identity');
 const headers=config.graphApiKey?{Authorization:`Bearer ${config.graphApiKey}`}:{ };
 let active=0;
 return async(req,res)=>{
  let url;try{url=new URL(req.url,'http://localhost');}catch{return reply(res,400,{error:'Invalid request'});}
  if(req.method!=='GET'||url.pathname!=='/api/analysis')return reply(res,404,{error:'Not found'});
  const values=keys.map(key=>url.searchParams.get(key)??(key==='executionCost'?'0':''));
  if(req.url.length>1024||[...url.searchParams.keys()].some(key=>!keys.includes(key)||url.searchParams.getAll(key).length!==1)||values.some(v=>!/^\d{1,78}$/.test(v)||BigInt(v)>uint256)||BigInt(values[0])===0n||BigInt(values[1])===0n)return reply(res,400,{error:'Choose a series, a positive claim quantity and nonnegative USDC costs.'});
  if(active>=4)return reply(res,429,{error:'Historical activity is busy. Try again shortly.'});
  active++;
  let store;
  try{
   // An absent history database must not be created by HTTP. Reopen each request
   // so a stopped/restarted sink can recover without restarting this API.
   const deadline=AbortSignal.timeout(8000);
   store=new HistoryStore(config.database,{readOnly:true});
   const [chainId,chainHead]=await Promise.all([client.getChainId(),client.getBlockNumber({cacheTime:0})]);
   if(config.chainId!==undefined&&chainId!==config.chainId)throw new Error('Unexpected chain');
   const result=await loadBuyerAnalysis({store,url:config.subgraphUrl,deployment:config.deployment,headers,seriesId:BigInt(values[0]).toString(),chainId,chainHead,packageIdentity:config.packageIdentity,quantity:BigInt(values[1]),price:BigInt(values[2]),executionCost:BigInt(values[3]),fetchImpl:(url,options)=>fetchImpl(url,{...options,signal:AbortSignal.any([options.signal,deadline])})});
   // Two Graph products can agree while both retain an orphaned block.
   const canonical=await client.getBlock({blockNumber:BigInt(result.sourceBlock)});
   if(canonical.hash?.toLowerCase()!==result.sourceHash.toLowerCase()||store.block(result.sourceBlock)?.hash.toLowerCase()!==result.sourceHash.toLowerCase())throw new Error('Source changed');
   // Provider cursors are operational resume tokens, not public provenance.
   const {substreamsCursor,...publicResult}=result;
   return reply(res,200,publicResult);
  }catch{return reply(res,503,unavailable);}
  finally{store?.close();active--;}
 };
}
