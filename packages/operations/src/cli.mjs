import {createPublicClient,http} from 'viem';
import {ListingStore} from '../../listings/src/store.mjs';
import {createListingService} from '../../listings/src/service.mjs';
import {createListingsHandler} from '../../listings/src/http.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {resolve} from 'node:path';
import {RetentionStore} from '../../settlement/src/store.mjs';
import {RetentionWorker} from '../../settlement/src/worker.mjs';
import {recoveryServer} from '../../settlement/src/server.mjs';
import {OffhostReplica,S3Remote} from '../../settlement/src/offhost.mjs';
import {readKeeperStatus} from '../../keeper/src/store.mjs';
import {acquireWitness} from '../../../scripts/chain/proof.mjs';
import {publicArtifact} from '../../settlement/src/artifact.mjs';
import {validateWitness} from '../../settlement/src/validate.mjs';
import {hostedConfig,privateDirectory,privateJSON} from './config.mjs';
import {operationsStatus,retentionStatus} from './readiness.mjs';
import {operationsServer} from './http.mjs';
import {recoveryAcquirer} from './acquire.mjs';
import {hostedAnalysisConfig,hostedStreamConfig} from './analysis.mjs';
import {analysisHandler} from '../../data/src/http.mjs';
import {childShutdown,drainServer} from './shutdown.mjs';

let server,store,listingStore,child,streamChild,stopping=false,proof={ready:false,observedAt:0};
const shutdown=childShutdown({children:()=>[child,streamChild]});
const idleAbort=new AbortController();
const stop=()=>{stopping=true;idleAbort.abort();shutdown.stop();};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
try{
 const config=hostedConfig();privateDirectory(config.directory);
 const analysis=hostedAnalysisConfig({...config});
 const stream=hostedStreamConfig({analysis});
 // This service never loads .env or uses the deployment wallet.
 const keeperKey=process.env.KEEPER_PRIVATE_KEY;
 const streamToken=process.env.SUBSTREAMS_API_TOKEN;
 delete process.env.KEEPER_PRIVATE_KEY;delete process.env.PRIVATE_KEY;
 delete process.env.SUBSTREAMS_API_TOKEN;delete process.env.GRAPH_API_KEY;
 if(stream){
  const file=resolve(config.directory,'stream.generated.json');privateJSON(file,stream);
  streamChild=spawn(process.execPath,['scripts/graph/stream-service.mjs'],{env:{PATH:process.env.PATH,GRAPH_STREAM_CONFIG:file,...(streamToken?{SUBSTREAMS_API_TOKEN:streamToken}:{})},stdio:['ignore','inherit','inherit']});
  // Analytics availability never stops the settlement worker or enables a sale.
  streamChild.once('error',()=>console.error('{"error":"GRAPH_STREAM_START_FAILED"}'));
  streamChild.once('exit',()=>{if(!stopping)console.error('{"error":"GRAPH_STREAM_STOPPED","action":"inspect-retained-history-before-restart"}');});
 }
 if(config.keeper){
  const file=resolve(config.directory,'keeper.generated.json');privateJSON(file,config.keeper);
  child=spawn(process.execPath,['packages/keeper/src/cli.mjs'],{env:{PATH:process.env.PATH,KEEPER_CONFIG:file,...(keeperKey?{KEEPER_PRIVATE_KEY:keeperKey}:{})},stdio:['ignore','inherit','inherit']});
  child.once('error',()=>{stop();});child.once('exit',()=>{if(!stopping){console.error('{"error":"KEEPER_PROCESS_EXITED"}');process.exitCode=1;stop();}});
 }
 store=new RetentionStore(config.retention.database,{artifactRoots:config.retention.artifactRoots});
 let replica;
 const worker=new RetentionWorker(config.retention,store,{acquireWitness:recoveryAcquirer({store,scope:()=>worker.scope,config:config.retention,replica:()=>replica})});
 if(config.remote)replica=new OffhostReplica({store,scope:worker.scope,remote:new S3Remote(config.remote)});
 listingStore=new ListingStore(resolve(config.directory,'listings.sqlite'),config.listings);
 const listingClient=createPublicClient({transport:http(config.retention.rpcUrls[0],{timeout:4000,retryCount:0})});
 const listingsHandler=createListingsHandler(createListingService({client:listingClient,scope:config.listings,store:listingStore}));
 const recovery=recoveryServer({store,scope:worker.scope});
 server=operationsServer({token:config.gatewayToken,listingsHandler,analysisHandler:analysis?analysisHandler(analysis):null,recoveryHandler:recovery.listeners('request')[0],status:()=>operationsStatus({config:config.retention,
  keeperEnabled:!stopping&&config.keeper?.enabled,keeper:config.keeper?.enabled?readKeeperStatus(config.keeper.database):null,retention:retentionStatus(store,worker.scope),replication:replica?.publicStatus(),proof})});
 server.listen(config.port,'0.0.0.0');await once(server,'listening');
 console.log(JSON.stringify({status:'operations-listening',port:config.port,chainId:config.retention.chainId,feeStrip:config.retention.feeStrip}));
 do{
  const tick=await worker.tick();
  if(stopping)break;
  // Test historical proof capability independently of whether a sale already exists.
  if(tick.status!=='observed')proof={ready:false,observedAt:Date.now()};
  else if(Date.now()-proof.observedAt>30000){
   try{
    const number=BigInt(tick.blockNumber)-1n,slots=['0x'+'00'.repeat(32)],client=worker.primary;
    const artifact=publicArtifact(await acquireWitness(client,{manager:config.retention.poolManager,slots,blockNumber:number}));
    const result=await validateWitness(artifact,{chainId:String(config.retention.chainId),manager:config.retention.poolManager,managerCodeHash:config.retention.managerCodeHash,blockNumber:String(number),slots});
    const block=await client.getBlock({blockNumber:number});if(result.blockHash!==block.hash.toLowerCase())throw new Error();
    proof={ready:Date.now()/1000-Number(block.timestamp)<120,observedAt:Date.now()};
   }catch{proof={ready:false,observedAt:Date.now()};}
  }
  if(stopping)break;
  if(replica)await replica.tick();
  if(!stopping)try{await delay(4000,undefined,{signal:idleAbort.signal});}
  catch(error){if(error.name!=='AbortError'||!stopping)throw error;}
 }while(!stopping);
}catch{console.error('{"error":"OPERATIONS_STARTUP_OR_LOOP_FAILED"}');process.exitCode=1;}
finally{
 stop();await Promise.all([drainServer(server),shutdown.drain()]);
 listingStore?.close();store?.close();
}
