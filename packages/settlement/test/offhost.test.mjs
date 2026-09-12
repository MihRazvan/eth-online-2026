import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {RetentionStore,digest,stableJSON} from '../src/store.mjs';
import {OffhostReplica,S3Remote} from '../src/offhost.mjs';
import {publicArtifact} from '../src/artifact.mjs';
import {expectedFor} from '../src/worker.mjs';
import {validateWitness} from '../src/validate.mjs';
const raw=JSON.parse(readFileSync(new URL('../../../scripts/proof/sepolia-witness.json',import.meta.url)));
const artifact=publicArtifact(raw),hash=byte=>'0x'+byte.repeat(64);
const terms={chainId:'11155111',manager:raw.manager.toLowerCase(),managerCodeHash:'0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1',feeStrip:'0x'+'11'.repeat(20),seriesId:'1',activationBlock:String(BigInt(raw.blockNumber)-100n),activationHash:hash('4'),endBlock:String(raw.blockNumber),slots:raw.slots,lifecycle:'active'};
function memoryRemote(){const objects=new Map();return {objects,offline:false,async put(key,value){if(this.offline)throw new Error('private secret credential endpoint');objects.set(key,Buffer.from(value));},async get(key){if(this.offline||!objects.has(key))throw new Error('private secret endpoint unavailable');return Buffer.from(objects.get(key));}};}
function harness(t,{remote=memoryRemote(),clock=Date.now,maxJobs=4}={}){
 const directory=mkdtempSync(join(tmpdir(),'usufruct-offhost-')),path=join(directory,'state.sqlite');
 const identity={chainId:11155111,feeStrip:terms.feeStrip};
 let store,scope,replica;
 function open(){store=new RetentionStore(path,{artifactRoots:[join(directory,'a'),join(directory,'b')],clock});scope=store.bind(identity);replica=new OffhostReplica({store,scope,remote,clock,maxJobs});}
 open();t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 function discover(next=[terms]){const lease=store.lease(scope);store.reconcile(lease,next,{head:{number:BigInt(raw.blockNumber)+10n,hash:hash('9')},finalized:{number:BigInt(raw.blockNumber),hash:artifact.blockHash}});store.release(lease);return store.jobs(scope)[0];}
 async function seed(job=discover(),input=artifact){const lease=store.lease(scope);try{const id=store.stage(lease,job,input,expectedFor(job.terms),await validateWitness(input,expectedFor(job.terms)));store.replicate(lease,id);store.update(lease,job.key,{state:'retained',artifact_digest:id,endpoint_hash:input.blockHash});return store.jobs(scope).find(j=>j.key===job.key);}finally{store.release(lease);}}
 return {directory,remote,discover,seed,get store(){return store;},get scope(){return scope;},get replica(){return replica;},restart({loseEverything=false}={}){store.close();if(loseEverything)rmSync(directory,{recursive:true,force:true});open();}};
}

test('zero-series readiness requires an actual authenticated remote put/get roundtrip and expires',async t=>{
 let now=1000;const h=harness(t,{clock:()=>now});assert.equal(h.replica.publicStatus().ready,false);
 const result=await h.replica.tick();assert.equal(result.ready,true);assert.equal(h.remote.objects.size,1);
 now+=120001;assert.equal(h.replica.publicStatus().ready,false);
 h.remote.offline=true;const failed=await h.replica.tick();assert.equal(failed.ready,false);assert.equal(failed.lastError,'REMOTE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(failed),/secret|credential|endpoint/);
});

test('genuine Sepolia witness survives total local database/filesystem loss and remote-only restore',async t=>{
 const h=harness(t),original=await h.seed();assert.equal((await h.replica.tick()).ready,true);
 assert.equal(h.replica.publicStatus().verified,1);
 h.restart({loseEverything:true});const rediscovered=h.discover();assert.equal(rediscovered.key,original.key);assert.equal(h.store.candidates(rediscovered).length,0);
 const restored=await h.replica.restore(rediscovered,{endpointHash:artifact.blockHash});
 assert.deepEqual(await validateWitness(restored,expectedFor(terms)),await validateWitness(artifact,expectedFor(terms)));
 // Restore returns material; the worker retains ownership of staging and state.
 assert.equal(h.store.candidates(rediscovered).length,0);await h.seed(rediscovered,restored);
 assert.equal((await h.replica.tick()).ready,true);
 h.restart();assert.equal(h.replica.publicStatus().ready,false);assert.deepEqual(await h.replica.restore(h.store.jobs(h.scope)[0]),artifact);assert.equal((await h.replica.tick()).ready,true);
});

test('readback mismatch prevents readiness and deterministic pointer publication',async t=>{
 const remote=memoryRemote(),get=remote.get;remote.get=async function(key){const value=await get.call(this,key);return key.includes('/roundtrip.json')?value:Buffer.from('tampered');};
 const h=harness(t,{remote});await h.seed();assert.equal((await h.replica.tick()).lastError,'REMOTE_BYTES_MISMATCH');
 assert.equal(h.replica.publicStatus().ready,false);assert.ok(![...remote.objects.keys()].some(key=>key.endsWith('/current.json')));
});

test('digest and pointer scope/key tampering are rejected without remote trusted metadata',async t=>{
 const h=harness(t),job=await h.seed();await h.replica.tick();const pointerKey=[...h.remote.objects.keys()].find(k=>k.endsWith('/current.json')),original=h.remote.objects.get(pointerKey),pointer=JSON.parse(original);
 for(const modification of [{scope:'other'},{job:'f'.repeat(64)},{endpointHash:hash('8')},{key:'../../other-object'}]){
  h.remote.objects.set(pointerKey,Buffer.from(JSON.stringify({...pointer,...modification})));await assert.rejects(h.replica.restore(job),/REMOTE_POINTER_INVALID/);
 }
 h.remote.objects.set(pointerKey,original);h.remote.objects.set(pointer.key,Buffer.from('{}'));await assert.rejects(h.replica.restore(job),/REMOTE_BYTES_MISMATCH/);
});

test('self-consistent remote digest and forged validation metadata cannot authorize altered proof',async t=>{
 const h=harness(t),job=await h.seed();await h.replica.tick();const pointerKey=[...h.remote.objects.keys()].find(k=>k.endsWith('/current.json')),pointer=JSON.parse(h.remote.objects.get(pointerKey));
 const corrupted=structuredClone(artifact);corrupted.proof.storageProof[0].value='0x1';corrupted.validated={blockHash:artifact.blockHash};corrupted.expected=expectedFor(terms);
 const payload=Buffer.from(stableJSON(corrupted)),id=digest(payload),key=pointer.key.replace(pointer.digest,id);h.remote.objects.set(key,payload);h.remote.objects.set(pointerKey,Buffer.from(JSON.stringify({...pointer,digest:id,key})));
 await assert.rejects(h.replica.restore(job),/REMOTE_PROOF_INVALID/);
});

test('activation and endpoint replays use different pointers and stale jobs fail closed',async t=>{
 const h=harness(t),job=await h.seed();await h.replica.tick();await assert.rejects(h.replica.restore(job,{endpointHash:hash('8')}),/REMOTE_UNAVAILABLE/);
 const replacement=h.discover([{...terms,activationHash:hash('5')}]);assert.notEqual(replacement.key,job.key);
 await assert.rejects(h.replica.restore(job),/CANONICAL_JOB_CHANGED/);
 await assert.rejects(h.replica.restore(replacement,{endpointHash:artifact.blockHash}),/REMOTE_UNAVAILABLE/);
});

test('an orphaned job while remote validation is pending is not returned',async t=>{
 const h=harness(t),job=await h.seed();await h.replica.tick();let release,entered;
 const started=new Promise(resolve=>entered=resolve),pause=new Promise(resolve=>release=resolve);
 const replica=new OffhostReplica({store:h.store,scope:h.scope,remote:h.remote,validate:async(a,e)=>{entered();await pause;return validateWitness(a,e);}});
 const result=replica.restore(job);await started;h.discover([{...terms,activationHash:hash('5')}]);release();await assert.rejects(result,/CANONICAL_JOB_CHANGED/);
});

test('missing due proof prevents ready; bounded publication rotates to still-pending jobs',async t=>{
 const h=harness(t,{maxJobs:1});h.discover([terms,{...terms,seriesId:'2'}]);const jobs=h.store.jobs(h.scope);
 await h.seed(jobs[0]);let status=await h.replica.tick();assert.equal(status.ready,false);assert.equal(status.pending,1);
 await h.seed(jobs[1]);status=await h.replica.tick();assert.equal(status.ready,true);assert.equal(status.verified,2);
});

test('remote calls time out without exposing provider diagnostics or retaining a lease',async t=>{
 const h=harness(t,{remote:{put:async()=>new Promise(()=>{}),get:async()=>new Promise(()=>{})}});
 const replica=new OffhostReplica({store:h.store,scope:h.scope,remote:h.remote,timeoutMs:20});assert.equal((await replica.tick()).lastError,'REMOTE_TIMEOUT');
 assert.ok(h.store.lease(`${h.scope}:offhost`));
});

test('S3 adapter signs independent local HTTP roundtrip, bounds streaming bytes, and requires explicit HTTP test mode',async t=>{
 const objects=new Map();let signed=false,large=false;
 const server=createServer(async(req,res)=>{signed ||= req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ')??false;
  if(req.method==='PUT'){const chunks=[];for await(const chunk of req)chunks.push(chunk);objects.set(new URL(req.url,'http://localhost').pathname,Buffer.concat(chunks));res.end();}
  else if(large){res.write(Buffer.alloc(1024*1024+1));res.end(Buffer.alloc(1024*1024));}
  else{const value=objects.get(new URL(req.url,'http://localhost').pathname);res.statusCode=value?200:404;res.end(value??'missing');}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const config={endpoint:`http://127.0.0.1:${server.address().port}`,bucket:'proofs',region:'us-east-1',accessKeyId:'local-test-key',secretAccessKey:'local-test-secret',forcePathStyle:true};
 assert.throws(()=>new S3Remote(config),/Invalid replica/);assert.throws(()=>new S3Remote({...config,endpoint:'http://remote.invalid',allowHttpForTests:true}),/Invalid replica/);
 const remote=new S3Remote({...config,allowHttpForTests:true});t.after(()=>remote.close());
 const payload=Buffer.from('{"public":"witness"}');await remote.put('witness.json',payload);assert.deepEqual(await remote.get('witness.json'),payload);assert.equal(signed,true);
 large=true;await assert.rejects(remote.get('too-large'),/REMOTE_SIZE_LIMIT/);await assert.rejects(remote.put('too-large',Buffer.alloc(2*1024*1024+1)),/REMOTE_SIZE_LIMIT/);
});
