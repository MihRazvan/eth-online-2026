import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {operationsStatus} from '../src/readiness.mjs';
import {operationsServer,readBounded} from '../src/http.mjs';
import {proxyFor} from '../../../scripts/deploy/api-proxy.mjs';
import {hostedConfig} from '../src/config.mjs';
import {recoveryAcquirer} from '../src/acquire.mjs';
const token='test-gateway-credential-32-characters-long',address='0x'+'ab'.repeat(20),now=1789218000000;
const good=()=>({config:{chainId:11155111,feeStrip:address,fundingCommitmentVersion:1},clock:()=>now,
 keeper:{chainId:11155111,feeStrip:address,observedAtMs:now,enabled:true,readyToSign:true,missedEndpoints:0,discoveryComplete:true,lastError:null},
 retention:{ready:true,observedAt:now},replication:{ready:true,observedAt:now},proof:{ready:true,observedAt:now}});
test('new commitments require bound fresh observations from every preservation component',()=>{
 assert.equal(operationsStatus(good()).readyForNewSales,true);
 const old=good();delete old.config.fundingCommitmentVersion;assert.equal(operationsStatus(old).checks.protocol.code,'CONTRACT_UPGRADE_REQUIRED');assert.equal(operationsStatus(old).readyForNewSales,false);
 for(const component of ['keeper','retention','replication','proof']){
  for(const mutation of ['missing','stale','future','failed']){
   const input=good(),at=component==='keeper'?'observedAtMs':'observedAt';
   if(mutation==='missing')input[component]=null;
   else if(mutation==='stale')input[component][at]=now-60001;
   else if(mutation==='future')input[component][at]=now+5001;
   else input[component][component==='keeper'?'readyToSign':'ready']=false;
   assert.equal(operationsStatus(input).readyForNewSales,false,component+mutation);
  }
 }
 for(const change of [{chainId:1},{feeStrip:'0x'+'cd'.repeat(20)},{missedEndpoints:1},{discoveryComplete:false},{lastError:'RPC_UNAVAILABLE'}]){
  const input=good();Object.assign(input.keeper,change);assert.equal(operationsStatus(input).readyForNewSales,false);
 }
});
async function listening(server,t){server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));return `http://127.0.0.1:${server.address().port}`;}
test('gateway restricts unauthenticated, mutating, ambiguous and arbitrary requests',async t=>{
 let recoveryCalls=0;
 const origin=await listening(operationsServer({token,status:()=>operationsStatus(good()),recoveryHandler:(_req,res)=>{recoveryCalls++;res.end('{}');}}),t);
 assert.equal((await fetch(origin+'/healthz')).status,200);
 assert.equal((await fetch(origin+'/api/operations')).status,401);
 const headers={authorization:`Bearer ${token}`};
 const status=await fetch(origin+'/api/operations',{headers});assert.equal((await status.json()).readyForNewSales,true);
 for(const target of ['/api/sign','/api/recovery?seriesId=1&seriesId=2','/api/operations?rpc=https://attacker.test'])assert.equal((await fetch(origin+target,{headers})).status,404);
 assert.equal((await fetch(origin+'/api/recovery',{method:'POST',headers})).status,404);
 assert.equal((await fetch(origin+'/api/analysis?seriesId=1',{headers})).status,503);
 assert.equal(recoveryCalls,0);
});
test('Vercel proxy fails closed and forwards no cookies or user-controlled upstream',async t=>{
 const calls=[],fetcher=async(url,options)=>{calls.push({url:String(url),options});return Response.json({safe:true});};
 const env={OPERATIONS_ORIGIN:'https://operations.example',OPERATIONS_GATEWAY_TOKEN:token};
 const origin=await listening(createServer(proxyFor('/api/recovery',{env,fetcher})),t);
 const result=await fetch(origin+'/api/recovery?seriesId=1',{headers:{cookie:'private=user',authorization:'Bearer attacker'}});
 assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal(calls[0].url,'https://operations.example/api/recovery?seriesId=1');
 assert.deepEqual(calls[0].options.headers,{authorization:`Bearer ${token}`});assert.equal(calls[0].options.redirect,'error');
 assert.equal((await fetch(origin+'/api/operations')).status,404);
 for(const bad of ['http://internal','https://user:password@example.com','https://example.com/path']){
  env.OPERATIONS_ORIGIN=bad;assert.equal((await fetch(origin+'/api/recovery?seriesId=1')).status,503);
 }
 env.OPERATIONS_ORIGIN='https://operations.example';env.OPERATIONS_GATEWAY_TOKEN='';assert.equal((await fetch(origin+'/api/recovery?seriesId=1')).status,503);
 assert.equal(calls.length,1);
});
test('proxy bounds streamed bodies even without Content-Length',async()=>{
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(11));controller.close();}}));
 await assert.rejects(()=>readBounded(response,10),/RESPONSE_TOO_LARGE/);
});
test('remote recovery tries another canonical series sharing identical endpoint slots',async()=>{
 const terms={endBlock:'10',manager:address,managerCodeHash:'code',chainId:'11155111',slots:['slot']};
 const jobs=[{key:'missing',terms},{key:'retained',terms}],calls=[];
 const acquire=recoveryAcquirer({store:{jobs:()=>jobs},scope:()=>'',config:{chainId:11155111,poolManager:address,managerCodeHash:'code'},
  acquire:async()=>{throw new Error('provider offline');},replica:()=>({restore:async(job,{endpointHash})=>{calls.push(job.key);assert.equal(endpointHash,'hash');if(job.key==='missing')throw new Error();return {witness:'verified'};}})});
 assert.deepEqual(await acquire({getBlock:async()=>({hash:'hash'})},{blockNumber:10n,slots:['slot'],manager:address}),{witness:'verified'});
 assert.deepEqual(calls,['missing','retained']);
});
test('host configuration pins public contracts and never falls back to a deployer key or RPC',()=>{
 const env={SEPOLIA_RPC_URL:'https://rpc.example/secret',OPERATIONS_GATEWAY_TOKEN:token,PRIVATE_KEY:'secret'};
 const config=hostedConfig(env);assert.equal(config.retention.chainId,11155111);assert.equal(config.keeper,null);assert.equal(config.remote,null);
 assert(!JSON.stringify(config).includes('PRIVATE_KEY'));
 assert.throws(()=>hostedConfig({...env,SEPOLIA_RPC_URL:undefined}));
 assert.throws(()=>hostedConfig({...env,KEEPER_ENABLED:'true'}),/EXPECTED_KEEPER_SIGNER_REQUIRED/);
 assert.throws(()=>hostedConfig({...env,KEEPER_ENABLED:'1'}));
});

test('optional in-process analytics are authenticated but never alter preservation readiness',async t=>{
 let calls=0;
 const origin=await listening(operationsServer({token,status:()=>operationsStatus({...good(),keeper:null}),recoveryHandler:()=>{},analysisHandler:(_req,res)=>{calls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({sourceBlock:13,allocationAuthority:'contract-only'}));}}),t);
 const query='/api/analysis?seriesId=1&quantity=10&price=20';
 assert.equal((await fetch(origin+query)).status,401);assert.equal(calls,0);
 const headers={authorization:`Bearer ${token}`};assert.equal((await fetch(origin+query,{headers})).status,200);assert.equal(calls,1);
 const status=await(await fetch(origin+'/api/operations',{headers})).json();assert.equal(status.readyForNewSales,false);
});

test('hosted analysis pins Graph deployment and package independently of environment provider substitutions',async()=>{
 const {hostedAnalysisConfig}=await import('../src/analysis.mjs');
 const base=hostedConfig({SEPOLIA_RPC_URL:'https://rpc.example/private',OPERATIONS_GATEWAY_TOKEN:token});
 assert.equal(hostedAnalysisConfig({...base,env:{}}),null);
 const config=hostedAnalysisConfig({...base,env:{ANALYSIS_ENABLED:'true',SUBGRAPH_URL:'https://attacker.invalid',PACKAGE_HASH:'0xwrong'}});
 assert.equal(config.chainId,11155111);assert.equal(config.database,'/data/analysis.sqlite');assert.match(config.subgraphUrl,/api.studio.thegraph.com/);assert.match(config.packageIdentity,/^0x[0-9a-f]{64}$/);
 assert.throws(()=>hostedAnalysisConfig({...base,retention:{...base.retention,feeStrip:address},env:{ANALYSIS_ENABLED:'true'}}),/MISMATCH/);
 assert.throws(()=>hostedAnalysisConfig({...base,env:{ANALYSIS_ENABLED:'yes'}}),/INVALID/);
});

test('history catch-up requires a separate explicit opt-in and uses the pinned local analysis database',async()=>{
 const {hostedAnalysisConfig,hostedStreamConfig}=await import('../src/analysis.mjs');
 const {validateConfig}=await import('../../../scripts/graph/stream-service.mjs');
 const base=hostedConfig({SEPOLIA_RPC_URL:'https://rpc.example/private',OPERATIONS_GATEWAY_TOKEN:token});
 const analysis=hostedAnalysisConfig({...base,env:{ANALYSIS_ENABLED:'true'}});
 assert.equal(hostedStreamConfig({analysis,env:{}}),null);
 assert.throws(()=>hostedStreamConfig({analysis:null,env:{GRAPH_STREAM_ENABLED:'true'}}),/REQUIRES_ANALYSIS/);
 const stream=validateConfig(hostedStreamConfig({analysis,env:{GRAPH_STREAM_ENABLED:'true'}}));
 assert.equal(stream.db,analysis.database);assert.equal(stream.packageHash,analysis.packageIdentity);assert.equal(stream.minFreeBytes,256*1024*1024);
 assert(!JSON.stringify(stream).includes('private'));assert(stream.initialization[stream.pools[0]].kind==='swap');
 assert.throws(()=>hostedStreamConfig({analysis,env:{GRAPH_STREAM_ENABLED:'yes'}}),/INVALID/);
});
