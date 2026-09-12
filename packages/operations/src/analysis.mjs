import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

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

/** Bulk history is separately opt-in: catching up must not fill proof storage. */
export function hostedStreamConfig({env=process.env,analysis}){
 if(env.GRAPH_STREAM_ENABLED&&!['true','false'].includes(env.GRAPH_STREAM_ENABLED))throw new Error('INVALID_GRAPH_STREAM_ENABLED');
 if(env.GRAPH_STREAM_ENABLED!=='true')return null;
 if(!analysis)throw new Error('STREAM_REQUIRES_ANALYSIS');
 const history=JSON.parse(readFileSync(new URL('deployments/substreams-sepolia.json',root),'utf8'));
 if(history.packageHash!==analysis.packageIdentity)throw new Error('STREAM_PACKAGE_MISMATCH');
 return {...history,db:analysis.database,packagePath:fileURLToPath(new URL('packages/substreams/feestrip-pool-context-v0.1.1.spkg',root))};
}
