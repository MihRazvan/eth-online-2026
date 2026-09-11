import {test} from 'node:test';
import {request} from 'node:http';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeAbiParameters,encodeAbiParameters,fromRlp,keccak256,toRlp} from 'viem';
import {RetentionStore,digest,fail} from '../src/store.mjs';
import {RetentionWorker} from '../src/worker.mjs';
import {publicArtifact} from '../src/artifact.mjs';
import {validateWitness} from '../src/validate.mjs';
import {recoveryServer} from '../src/server.mjs';

const raw=JSON.parse(readFileSync(new URL('../../../scripts/proof/sepolia-witness.json',import.meta.url)));
const artifact=publicArtifact(raw),n=BigInt(raw.blockNumber),hash=byte=>'0x'+byte.repeat(64);
const config={chainId:11155111,genesisHash:hash('1'),feeStrip:'0x'+'11'.repeat(20),verifier:'0x'+'22'.repeat(20),checkpoints:'0x'+'33'.repeat(20),poolManager:raw.manager.toLowerCase(),usdc:'0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',managerCodeHash:raw.proof.codeHash,
 codeHashes:{feeStrip:hash('a'),verifier:hash('b'),checkpoints:hash('c'),poolManager:raw.proof.codeHash},rpcUrls:['https://user:secret@rpc.invalid/api/private-token']};
const terms={chainId:'11155111',genesisHash:config.genesisHash,feeStrip:config.feeStrip,verifier:config.verifier,manager:config.poolManager,managerCodeHash:config.managerCodeHash,checkpoints:config.checkpoints,seriesId:'1',tokenId:'39005',claim:'0x'+'44'.repeat(20),originalSupply:'10000',liquidity:'100',baselineX128:'0',activationBlock:String(n-100n),activationHash:hash('4'),endBlock:String(n),poolId:raw.poolId,tickLower:raw.tickLower,tickUpper:raw.tickUpper,usdcIsCurrency0:raw.usdcIsCurrency0,slots:raw.slots,lifecycle:'active'};
function replacement(){
 const a=structuredClone(artifact),header=fromRlp(a.headerRlp,'hex');header[12]='0x0102';a.header.extraData='0x0102';a.headerRlp=toRlp(header);a.blockHash=a.header.hash=keccak256(a.headerRlp);
 const abi=[{type:'bytes'},{type:'bytes[]'},{type:'bytes[]'}],values=decodeAbiParameters(abi,a.witness);values[0]=a.headerRlp;a.witness=encodeAbiParameters(abi,values);return a;
}
function harness(t,{fault=()=>{},clock=Date.now}={}){
 const directory=mkdtempSync(join(tmpdir(),'feestrip-recovery-')),path=join(directory,'keeper.sqlite'),roots=[join(directory,'a'),join(directory,'b')];
 let store=new RetentionStore(path,{artifactRoots:roots,fault,clock});
 const state={head:n,artifact:structuredClone(artifact),terms:[structuredClone(terms)],offline:false,pruned:false,finalized:null,incoherent:false,acquires:0,checkpoint:null,cached:false};
 const client={getBlock:async({blockNumber})=>({number:blockNumber,hash:blockNumber===n?state.artifact.blockHash:hash('d')})};
 const observation=()=>({head:{number:state.head,hash:state.head===n?state.artifact.blockHash:hash('d')},finalized:state.finalized===null?null:{number:state.finalized,hash:state.finalized===n?state.artifact.blockHash:hash('d')}});
 const deps={clients:[client],validateWitness,assertNetwork:async()=>{},
  observe:async()=>{if(state.offline)throw new Error('RPC https://user:secret@rpc.invalid/api/private-token unavailable');return observation();},
  discover:async()=>{if(state.incoherent)fail('DISCOVERY_REORG');return state.terms;},
  assertObservation:async()=>{if(state.incoherent)fail('DISCOVERY_REORG');},
  endpointObservation:async(_client,_config,job)=>{if(!state.terms.some(x=>x.activationHash===job.terms.activationHash))fail('ACTIVATION_ORPHANED');return {hash:state.artifact.blockHash,finalized:state.finalized!==null&&state.finalized>=n,checkpointHash:state.checkpoint,growthCached:state.cached};},
  acquireWitness:async(_client,args)=>{state.acquires++;assert.equal(args.blockNumber,n);if(state.pruned)throw new Error('private-token historical proof pruned');return structuredClone(state.artifact);},
 };
 let worker=new RetentionWorker(config,store,deps);
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 return {state,deps,roots,directory,get store(){return store;},get worker(){return worker;},status:()=>store.publicStatus(worker.scope,'1'),restart:()=>{store.close();store=new RetentionStore(path,{artifactRoots:roots,clock});worker=new RetentionWorker(config,store,deps);}};
}

test('register before N, acquire exactly at N, retain two durable copies and preserve distinct canonical/checkpoint facts',async t=>{
 const h=harness(t);h.state.head=n-1n;await h.worker.tick();assert.equal(h.status().state,'scheduled');assert.equal(h.state.acquires,0);
 h.state.head=n;await h.worker.tick();const status=h.status();assert.equal(status.state,'retained');assert.equal(status.copies,2);assert.equal(status.finalized,false);assert.equal(status.checkpointSaved,false);assert.equal(h.state.acquires,1);
 for(const root of h.roots)assert.equal(digest(readFileSync(join(root,`${status.artifactDigest}.json`))),status.artifactDigest);
 h.state.head=n+1n;h.state.checkpoint=artifact.blockHash;h.state.finalized=n;await h.worker.tick();assert.equal(h.status().checkpointSaved,true);assert.equal(h.status().finalized,true);assert.equal(h.state.acquires,1);
});

for(const point of ['after-stage','after-copy-1','after-copy-2','after-replication'])test(`restart repairs ${point} interruption with no RPC and no new proof`,async t=>{
 let fired=false;const h=harness(t,{fault:p=>{if(!fired&&p===point){fired=true;throw new Error('simulated process interruption');}}});
 await h.worker.tick();assert.equal(h.state.acquires,1);assert.equal(h.store.candidates(h.store.jobs(h.worker.scope)[0]).length,1);
 h.restart();h.state.offline=true;h.state.pruned=true;assert.equal((await h.worker.tick()).status,'unavailable');
 const candidate=h.store.candidates(h.store.jobs(h.worker.scope)[0])[0];assert.equal(candidate.copies,2);for(const root of h.roots)assert.ok(existsSync(join(root,`${candidate.digest}.json`)));
 assert.equal(h.state.acquires,1);assert.equal(h.status().observationError,'OBSERVATION_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(h.status()),/secret|private-token|rpc\.invalid/);
 h.state.offline=false;await h.worker.tick();assert.equal(h.status().state,'retained');assert.equal(h.state.acquires,1);
});

test('corrupt file is quarantined and repaired from authenticated SQLite bytes while provider is offline',async t=>{
 const h=harness(t);await h.worker.tick();const id=h.status().artifactDigest,target=join(h.roots[0],`${id}.json`);writeFileSync(target,'corrupt');h.state.offline=true;
 await h.worker.tick();assert.equal(digest(readFileSync(target)),id);assert.equal(h.state.acquires,1);
});

test('endpoint reorg retains both hash variants and clears stale readiness when replacement proof is unavailable',async t=>{
 const h=harness(t);await h.worker.tick();const first=h.status().artifactDigest;h.state.artifact=replacement();h.state.pruned=true;
 await h.worker.tick();assert.equal(h.status().artifactDigest,null);assert.equal(h.status().state,'unavailable');assert.equal(h.status().error,'PROOF_ACQUISITION_FAILED');assert.ok(h.store.artifact(first));
 h.state.pruned=false;await h.worker.tick();assert.equal(h.status().state,'retained');assert.notEqual(h.status().artifactDigest,first);assert.equal(h.store.candidates(h.store.jobs(h.worker.scope)[0]).length,2);
});

test('inconsistent observation does not clear previously retained artifact; coherent activation reuse creates a new job',async t=>{
 const h=harness(t);await h.worker.tick();const first=h.status().artifactDigest,key=h.store.jobs(h.worker.scope)[0].key;
 h.state.artifact=replacement();h.state.incoherent=true;await h.worker.tick();assert.equal(h.status().artifactDigest,first);assert.equal(h.status().observationError,'DISCOVERY_REORG');
 h.state.incoherent=false;h.state.terms[0].activationHash=hash('5');await h.worker.tick();assert.notEqual(h.store.jobs(h.worker.scope)[0].key,key);const orphan=h.store.jobs(h.worker.scope,{all:true}).find(j=>j.key===key);assert.equal(orphan.current,0);assert.equal(orphan.state,'orphaned');
});

test('finality high-water mark survives unavailable finalized tag and rejects later regression',async t=>{
 const h=harness(t);h.state.finalized=n-10n;await h.worker.tick();h.state.finalized=null;await h.worker.tick();assert.equal(h.store.deployment(h.worker.scope).finalized_number,String(n-10n));assert.equal(h.status().finalityObserved,false);
 h.state.finalized=n-20n;const result=await h.worker.tick();assert.equal(result.error,'FINALITY_REGRESSION');
});

test('leases prevent concurrent/stale writers and bind otherwise identical jobs to deployment identity',t=>{
 let now=100;const h=harness(t,{clock:()=>now}),scope=h.worker.scope,first=h.store.lease(scope,10);assert.equal(h.store.lease(scope),null);now=111;const second=h.store.lease(scope);assert.ok(second);
 assert.throws(()=>h.store.reconcile(first,[terms],{head:{number:n,hash:artifact.blockHash}}),/LEASE_LOST/);
 h.store.reconcile(second,[terms],{head:{number:n,hash:artifact.blockHash}});h.store.release(first);assert.equal(h.store.lease(scope),null);
 const alternate=h.store.bind({...config.identity,anotherDeployment:'yes'}),other=h.store.lease(alternate);h.store.reconcile(other,[terms],{head:{number:n,hash:artifact.blockHash}});assert.notEqual(h.store.jobs(scope)[0].key,h.store.jobs(alternate)[0].key);
});

test('artifact export allowlist and budgets reject credential metadata and otherwise-valid duplicate-node bloat',()=>{
 const input=structuredClone(raw);input.rpcUrl='https://secret.invalid';input.header.secret='private';input.proof.rpcToken='secret';const clean=publicArtifact(input);assert.doesNotMatch(JSON.stringify(clean),/secret\.invalid|private|rpcToken/);
 const bloated=structuredClone(raw);bloated.proof.accountProof=Array.from({length:2049},()=>raw.proof.accountProof[0]);assert.throws(()=>publicArtifact(bloated),/ARTIFACT_LIMIT_EXCEEDED/);
});

test('same artifact roots and dangling database symlinks are rejected',t=>{
 const directory=mkdtempSync(join(tmpdir(),'feestrip-paths-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 assert.throws(()=>new RetentionStore(':memory:',{artifactRoots:[join(directory,'a'),join(directory,'a')]}),/ARTIFACT_ROOTS_NOT_DISTINCT/);
 const link=join(directory,'link.sqlite');symlinkSync(join(directory,'missing.sqlite'),link);assert.throws(()=>new RetentionStore(link,{artifactRoots:[join(directory,'a'),join(directory,'b')]}),/UNSAFE_DATABASE_PATH/);
});

test('recovery API exports validated current bytes, rejects writes and does not leak private configuration',async t=>{
 const h=harness(t);await h.worker.tick();const api=recoveryServer({store:h.store,scope:h.worker.scope});
 await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>api.close(resolve)));
 const base=`http://127.0.0.1:${api.address().port}`;
 const response=await fetch(`${base}/api/recovery?seriesId=1`);assert.equal(response.status,200);const status=await response.json();assert.equal(status.state,'retained');assert.doesNotMatch(JSON.stringify(status),/secret|private-token|rpc\.invalid|keeper\.sqlite/);
 const exported=await fetch(`${base}/api/recovery/artifact?seriesId=1&digest=${status.artifactDigest}`);assert.equal(exported.status,200);const bytes=await exported.text();assert.equal(digest(bytes),status.artifactDigest);assert.equal(JSON.parse(bytes).witness,artifact.witness);
 assert.equal((await fetch(`${base}/api/recovery?seriesId=1`,{method:'POST'})).status,404);
 assert.equal((await fetch(`${base}/api/recovery?seriesId=0`)).status,400);
 assert.equal((await fetch(`${base}/api/recovery/artifact?seriesId=1&digest=${'a'.repeat(64)}`)).status,409);
});

test('API will not publish an artifact orphaned while its validation was in flight',async t=>{
 const h=harness(t);await h.worker.tick();let release,started;
 const entered=new Promise(resolve=>started=resolve),blocked=new Promise(resolve=>release=resolve);
 const api=recoveryServer({store:h.store,scope:h.worker.scope,validate:async()=>{started();await blocked;}});await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>api.close(resolve)));
 const id=h.status().artifactDigest,request=fetch(`http://127.0.0.1:${api.address().port}/api/recovery/artifact?seriesId=1&digest=${id}`);
 await entered;const lease=h.store.lease(h.worker.scope);h.store.update(lease,h.store.jobs(h.worker.scope)[0].key,{state:'orphaned',artifact_digest:null});h.store.release(lease);release();assert.equal((await request).status,409);
});

test('intact filesystem copy repairs corrupted SQLite payload with no RPC',async t=>{
 const h=harness(t);await h.worker.tick();const id=h.status().artifactDigest;
 h.store.db.prepare('UPDATE artifacts SET payload=? WHERE digest=?').run('corrupted database payload',id);
 h.state.offline=true;h.state.pruned=true;await h.worker.tick();
 assert.equal(digest(h.store.artifact(id).payload),id);assert.equal(h.state.acquires,1);
 h.state.offline=false;await h.worker.tick();assert.equal(h.status().state,'retained');assert.equal(h.state.acquires,1);
});
for(const code of ['ACTIVATION_ORPHANED','CHECKPOINT_CONFLICT'])test(`incoherent ${code} subread preserves the previous authenticated artifact`,async t=>{
 const h=harness(t);await h.worker.tick();const id=h.status().artifactDigest;
 h.worker.dependencies.endpointObservation=async()=>fail(code);h.state.incoherent=true;
 const lease=h.store.lease(h.worker.scope);await h.worker.retain(lease,h.store.jobs(h.worker.scope)[0],{head:{number:n,hash:artifact.blockHash},finalized:null});h.store.release(lease);assert.equal(h.status().artifactDigest,id);assert.equal(h.status().error,'DISCOVERY_REORG');
});
test('dangling artifact symlink is rejected without creating its target',async t=>{
 const h=harness(t);await h.worker.tick();const id=h.status().artifactDigest,path=join(h.roots[0],`${id}.json`),target=join(h.directory,'missing');
 rmSync(path);symlinkSync(target,path);const lease=h.store.lease(h.worker.scope);
 assert.throws(()=>h.store.replicate(lease,id),/UNSAFE_ARTIFACT_PATH/);h.store.release(lease);assert.equal(existsSync(target),false);
});

test('malformed HTTP request target cannot crash the shared worker process',async t=>{
 const h=harness(t);await h.worker.tick();const api=recoveryServer({store:h.store,scope:h.worker.scope});await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>api.close(resolve)));
 const result=await new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port:api.address().port,path:'//['},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
 assert.equal(result,400);assert.equal((await fetch(`http://127.0.0.1:${api.address().port}/api/recovery?seriesId=1`)).status,200);
});
test('due endpoint acquisition precedes bounded old-artifact maintenance',async t=>{
 const h=harness(t);h.state.head=n-1n;await h.worker.tick();
 const jobs=Array.from({length:30},(_,i)=>({...terms,seriesId:String(i+2),endBlock:String(n-10n)}));h.state.terms.push(...jobs);
 const lease=h.store.lease(h.worker.scope);h.store.reconcile(lease,h.state.terms,{head:{number:n-1n,hash:hash('d')}});
 for(const job of h.store.jobs(h.worker.scope).filter(j=>j.series_id!=='1'))h.store.update(lease,job.key,{artifact_digest:'a'.repeat(64),state:'retained'});
 h.store.release(lease);h.state.head=n;const calls=[];
 const retain=h.worker.retain.bind(h.worker);h.worker.retain=async(...args)=>{calls.push(args[1].series_id);if(args[1].series_id==='1')return retain(...args);};
 await h.worker.tick();assert.equal(calls[0],'1');assert.ok(calls.length<=5);assert.equal(h.status().state,'retained');
});

test('a retained but replaced unfinalized tip is rechecked ahead of older retained jobs',async t=>{
 const h=harness(t);await h.worker.tick();const first=h.status().artifactDigest;
 const older=Array.from({length:10},(_,i)=>({...terms,seriesId:String(i+2),endBlock:String(n-10n)}));h.state.terms=[...older,terms];
 const lease=h.store.lease(h.worker.scope);h.store.reconcile(lease,h.state.terms,{head:{number:n,hash:artifact.blockHash}});
 for(const job of h.store.jobs(h.worker.scope).filter(j=>j.series_id!=='1'))h.store.update(lease,job.key,{artifact_digest:'a'.repeat(64),state:'retained'});
 h.store.release(lease);h.state.artifact=replacement();const calls=[],retain=h.worker.retain.bind(h.worker);
 h.worker.retain=async(...args)=>{calls.push(args[1].series_id);if(args[1].series_id==='1')return retain(...args);};
 await h.worker.tick();assert.equal(calls[0],'1');assert.notEqual(h.status().artifactDigest,first);assert.equal(h.status().state,'retained');
});
test('fresh discovery does not advance a skipped endpoint observation timestamp',async t=>{
 let now=100;const h=harness(t,{clock:()=>now});await h.worker.tick();const first=h.status().lastObservedAt;
 now=200;const lease=h.store.lease(h.worker.scope);h.store.reconcile(lease,h.state.terms,{head:{number:n+1n,hash:hash('d')}});h.store.release(lease);
 assert.equal(h.status().lastObservedAt,first);assert.equal(h.status().lastObservedBlock,String(n));assert.equal(h.status().discoveryObservedAt,200);
});
