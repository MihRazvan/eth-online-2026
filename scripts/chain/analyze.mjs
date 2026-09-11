import {readFileSync} from 'node:fs';
import {createPublicClient,http} from 'viem';
import {HistoryStore} from '../../packages/data/src/store.mjs';
import {loadBuyerAnalysis} from '../../packages/data/src/buyer-analysis.mjs';
const path=process.argv[2];if(!path)throw new Error('Usage: node scripts/chain/analyze.mjs CONFIG.json SERIES_ID CLAIM_BASE_UNITS PRICE_USDC_BASE_UNITS [GAS_USDC_BASE_UNITS]');
const config=JSON.parse(readFileSync(path));
for(const name of ['rpcUrl','subgraphUrl','deployment','database','packageIdentity'])if(!config[name])throw new Error(`Missing ${name}`);
const rpc=createPublicClient({transport:http(config.rpcUrl)});const store=new HistoryStore(config.database);
try{
 const headers=process.env.GRAPH_API_KEY?{Authorization:`Bearer ${process.env.GRAPH_API_KEY}`}:{ };
 const result=await loadBuyerAnalysis({store,url:config.subgraphUrl,deployment:config.deployment,headers,seriesId:process.argv[3],chainId:await rpc.getChainId(),chainHead:await rpc.getBlockNumber(),packageIdentity:config.packageIdentity,quantity:BigInt(process.argv[4]),price:BigInt(process.argv[5]),executionCost:BigInt(process.argv[6]??'0')});
 console.log(JSON.stringify(result,null,2));
}catch{process.exitCode=1;console.error('Live buyer analysis failed. Check configured source identity, retained history, provider access and indexing status. No estimate substituted.');}finally{store.close();}
