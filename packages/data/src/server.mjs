import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {createPublicClient,http} from 'viem';
import {HistoryStore} from './store.mjs';
import {loadBuyerAnalysis} from './buyer-analysis.mjs';
const configPath=process.env.DATA_CONFIG;
if(!configPath)throw new Error('DATA_CONFIG must point to an existing private analysis configuration file; no fixture fallback');
const config=JSON.parse(readFileSync(configPath));
for(const key of ['rpcUrl','subgraphUrl','deployment','database','packageIdentity'])if(!config[key])throw new Error(`Missing analysis configuration: ${key}`);
if(!existsSync(config.database))throw new Error('Persisted Substreams database does not exist');
const store=new HistoryStore(config.database);
const client=createPublicClient({transport:http(config.rpcUrl)});
const headers=process.env.GRAPH_API_KEY?{Authorization:`Bearer ${process.env.GRAPH_API_KEY}`}:{ };
const server=createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
 const url=new URL(req.url,'http://localhost');
 if(req.method!=='GET'||url.pathname!=='/api/analysis'){res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));return;}
 const values=['seriesId','quantity','price','executionCost'].map(key=>url.searchParams.get(key)??(key==='executionCost'?'0':''));
 if(values.some(v=>!/^\d{1,78}$/.test(v))||BigInt(values[1])===0n){res.writeHead(400);res.end(JSON.stringify({error:'Expected series ID, positive claim base units and nonnegative USDC base units'}));return;}
 try{
  const result=await loadBuyerAnalysis({store,url:config.subgraphUrl,deployment:config.deployment,headers,seriesId:values[0],chainId:await client.getChainId(),chainHead:await client.getBlockNumber(),packageIdentity:config.packageIdentity,quantity:BigInt(values[1]),price:BigInt(values[2]),executionCost:BigInt(values[3])});
  res.end(JSON.stringify(result));
 }catch{res.writeHead(503);res.end(JSON.stringify({error:'Verified common-block analysis unavailable. Check provider access, retained history and indexing status. No estimate substituted.'}));}
});
server.listen(Number(process.env.DATA_PORT??8787),'127.0.0.1',()=>console.log('FeeStrip analysis API listening on loopback; configuration and credentials remain server-side.'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{store.close();process.exit(0);}));
