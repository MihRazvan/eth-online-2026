#!/usr/bin/env node
/** Fresh local restoration from remote GETs only. No RPC witness fallback or remote mutation. */
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {hostedConfig} from '../../packages/operations/src/config.mjs';
import {RetentionStore} from '../../packages/settlement/src/store.mjs';
import {OffhostReplica,S3Remote} from '../../packages/settlement/src/offhost.mjs';
import {clientsFor,observe,discover,endpointObservation,assertObservation} from '../../packages/settlement/src/chain.mjs';
import {expectedFor} from '../../packages/settlement/src/worker.mjs';
import {validateWitness} from '../../packages/settlement/src/validate.mjs';

export async function restoreProof({client,config,store,remote,seriesId,chain={observe,discover,endpointObservation,assertObservation}}){
 if(!/^[1-9]\d{0,77}$/.test(String(seriesId)))throw new Error('INVALID_SERIES_ID');
 for(const table of ['deployments','jobs','artifacts'])if(store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n)throw new Error('FRESH_RESTORE_STORE_REQUIRED');
 const scope=store.bind(config.identity);
 const observation=await chain.observe(client,config);
 const discovered=await chain.discover(client,config,observation,{known:[],pageSize:100});
 if(!discovered.complete)throw new Error('RESTORE_DISCOVERY_LIMIT');
 await chain.assertObservation(client,observation);
 const lease=store.lease(scope);if(!lease)throw new Error('RESTORE_BUSY');
 try{store.reconcile(lease,discovered.terms,observation);}finally{store.release(lease);}
 const job=store.jobs(scope).find(j=>j.series_id===String(seriesId));
 if(!job)throw new Error('SERIES_NOT_DISCOVERED');
 if(!observation.finalized||BigInt(job.terms.endBlock)>observation.finalized.number)throw new Error('ENDPOINT_NOT_FINALIZED');
 const endpoint=await chain.endpointObservation(client,config,job,observation);
 if(!endpoint.finalized)throw new Error('ENDPOINT_NOT_FINALIZED');
 let reads=0,validated;
 const replica=new OffhostReplica({store,scope,remote:{get:async key=>{reads++;return remote.get(key);},put:async()=>{throw new Error('REMOTE_WRITES_FORBIDDEN');}},
  validate:async(artifact,expected)=>{validated=await validateWitness(artifact,expected);return validated;}});
 const artifact=await replica.restore(job,{endpointHash:endpoint.hash});
 // Remote metadata has no canonicality authority. Recheck both endpoint/activation and head.
 const current=await chain.endpointObservation(client,config,job,observation);
 await chain.assertObservation(client,observation);
 if(current.hash!==endpoint.hash||!current.finalized||!validated)throw new Error('RESTORE_REORG');
 const commit=store.lease(scope);if(!commit)throw new Error('RESTORE_BUSY');
 let artifactDigest;
 try{
  artifactDigest=store.stage(commit,job,artifact,expectedFor(job.terms),validated);
  store.replicate(commit,artifactDigest);
  store.update(commit,job.key,{state:'retained',artifact_digest:artifactDigest,endpoint_hash:endpoint.hash,finalized:1});
 }finally{store.release(commit);}
 if(!store.healthy(artifactDigest))throw new Error('LOCAL_RESTORE_INCOMPLETE');
 return {scope:'Fresh local database and proof copies restored exclusively from remote GETs; no public transaction or hosted failover claimed.',chainId:config.chainId,feeStrip:config.feeStrip,seriesId:String(seriesId),endpoint:job.terms.endBlock,endpointHash:endpoint.hash,
  artifactDigest,authenticated:true,remoteReads:reads,remoteWrites:0,rpcWitnessFallback:false,localCopiesHealthy:true};
}

async function main(){
 const {values}=parseArgs({options:{series:{type:'string'}}});
 if(!values.series)throw new Error('SERIES_REQUIRED');
 // The verifier needs RPC and bucket credentials only. Never pass signer secrets to its validator.
 for(const key of ['PRIVATE_KEY','KEEPER_PRIVATE_KEY','SUBSTREAMS_API_TOKEN','GRAPH_API_KEY'])delete process.env[key];
 const directory=mkdtempSync(join(tmpdir(),'usufruct-restore-check-'));
 const config=hostedConfig({...process.env,OPERATIONS_DATA_DIR:directory,OPERATIONS_GATEWAY_TOKEN:'read-only-verifier-placeholder-token',KEEPER_ENABLED:'false',KEEPER_EXPECTED_SIGNER:undefined});
 if(!config.remote)throw new Error('REMOTE_CONFIGURATION_REQUIRED');
 const store=new RetentionStore(config.retention.database,{artifactRoots:config.retention.artifactRoots}),remote=new S3Remote(config.remote);
 try{
  const result=await restoreProof({client:clientsFor(config.retention)[0],config:config.retention,store,remote,seriesId:values.series});
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),...result,isolatedDirectory:directory},null,2));
 }finally{remote.close();store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error(JSON.stringify({error:'REMOTE_RESTORE_NOT_VERIFIED',scope:'No RPC witness fallback, remote write or public transaction was attempted.'}));process.exitCode=1;});
