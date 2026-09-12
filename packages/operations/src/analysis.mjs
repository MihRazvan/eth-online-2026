import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root=new URL('../../../',import.meta.url);
/** Optional analytics use committed contract/Graph/package identities, never env overrides. */
export function hostedAnalysisConfig({env=process.env,directory,retention}){
 if(env.ANALYSIS_ENABLED&&!['true','false'].includes(env.ANALYSIS_ENABLED))throw new Error('INVALID_ANALYSIS_ENABLED');
 if(env.ANALYSIS_ENABLED!=='true')return null;
 const graph=JSON.parse(readFileSync(new URL('deployments/subgraph-sepolia.json',root),'utf8'));
 if(graph.chainId!==retention.chainId||graph.feeStrip.toLowerCase()!==retention.feeStrip.toLowerCase())throw new Error('ANALYSIS_DEPLOYMENT_MISMATCH');
 const packagePath=new URL('packages/substreams/feestrip-pool-context-v0.1.1.spkg',root);
 return {rpcUrl:retention.rpcUrls[0],chainId:retention.chainId,subgraphUrl:graph.queryUrl,deployment:graph.deployment,
  database:resolve(directory,'analysis.sqlite'),packageIdentity:'0x'+createHash('sha256').update(readFileSync(packagePath)).digest('hex'),graphApiKey:env.GRAPH_API_KEY};
}
