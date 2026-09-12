import {randomBytes} from 'node:crypto';
import {S3Client,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {digest,stableJSON} from './store.mjs';
import {publicArtifact} from './artifact.mjs';
import {validateWitness} from './validate.mjs';
import {expectedFor} from './worker.mjs';

const MAX_BYTES=2*1024*1024,HASH=/^0x[0-9a-f]{64}$/i,DIGEST=/^[a-f0-9]{64}$/;
const CODES=new Set(['REMOTE_UNAVAILABLE','REMOTE_TIMEOUT','REMOTE_SIZE_LIMIT','REMOTE_BYTES_MISMATCH','REMOTE_POINTER_INVALID','REMOTE_PROOF_INVALID','CANONICAL_JOB_CHANGED','CANONICAL_ENDPOINT_REQUIRED','LOCAL_PROOF_UNAVAILABLE','REPLICA_BUSY']);
class ReplicaError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new ReplicaError(code);};
const safe=error=>error instanceof ReplicaError&&CODES.has(error.code)?error.code:'REMOTE_UNAVAILABLE';
const bytes=value=>{if(!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))fail('REMOTE_BYTES_MISMATCH');const buffer=Buffer.from(value);if(buffer.length>MAX_BYTES)fail('REMOTE_SIZE_LIMIT');return buffer;};
async function bounded(action,timeoutMs){let timer;try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ReplicaError('REMOTE_TIMEOUT')),timeoutMs);})]);}finally{clearTimeout(timer);}}

/** Private S3-compatible objects. Credentials are supplied by the host, never returned. */
export class S3Remote{
 constructor({endpoint,bucket,region,accessKeyId,secretAccessKey,forcePathStyle=false,allowHttpForTests=false,timeoutMs=10000}){
  let url;try{url=new URL(endpoint);}catch{throw new Error('Invalid replica endpoint');}
  const testHttp=allowHttpForTests&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!testHttp)||url.username||url.password||url.search||url.hash||!bucket||!region||!accessKeyId||!secretAccessKey||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Invalid replica configuration');
  this.bucket=bucket;this.timeoutMs=timeoutMs;
  this.client=new S3Client({endpoint:url.href,region,credentials:{accessKeyId,secretAccessKey},forcePathStyle,maxAttempts:1,requestHandler:{connectionTimeout:timeoutMs,requestTimeout:timeoutMs}});
 }
 async put(key,payload){
  const body=bytes(payload);
  try{await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:body,ContentType:'application/json'}),{abortSignal:AbortSignal.timeout(this.timeoutMs)});}catch{fail('REMOTE_UNAVAILABLE');}
 }
 async get(key){
  let body;
  try{return await bounded(async()=>{
   const response=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}),{abortSignal:AbortSignal.timeout(this.timeoutMs)});body=response.Body;
   if(response.ContentLength>MAX_BYTES)fail('REMOTE_SIZE_LIMIT');
   if(!body||!body[Symbol.asyncIterator])fail('REMOTE_BYTES_MISMATCH');
   const chunks=[];let length=0;
   for await(const chunk of body){const part=bytes(chunk);length+=part.length;if(length>MAX_BYTES)fail('REMOTE_SIZE_LIMIT');chunks.push(part);}
   return Buffer.concat(chunks,length);
  },this.timeoutMs);}catch(error){body?.destroy?.();throw new ReplicaError(safe(error));}
 }
 close(){this.client.destroy();}
}

/** Remote proof durability only; canonical chain observations and payouts stay outside this class. */
export class OffhostReplica{
 constructor({store,scope,remote,validate=validateWitness,clock=Date.now,timeoutMs=15000,maxJobs=4,maxAgeMs=120000}){
  if(!store.deployment(scope)||!remote?.put||!remote?.get||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>8||!Number.isInteger(maxAgeMs)||maxAgeMs<1)throw new Error('Invalid replica configuration');
  Object.assign(this,{store,scope,remote,validate,clock,timeoutMs,maxJobs,maxAgeMs});
  // A restarted process may use a different bucket or credential scope. Require
  // a new probe and fresh proof roundtrips before trusting retained tracking.
  this.probed=false;this.sessionVerified=new Set();
  this.store.db.exec(`CREATE TABLE IF NOT EXISTS offhost_probes(scope TEXT PRIMARY KEY,observed_at INTEGER NOT NULL,last_error TEXT);
   CREATE TABLE IF NOT EXISTS offhost_artifacts(scope TEXT NOT NULL,job TEXT NOT NULL,endpoint_hash TEXT NOT NULL,digest TEXT NOT NULL,verified_at INTEGER NOT NULL,PRIMARY KEY(scope,job));`);
 }
 current(job,endpointHash){
  const current=this.store.jobs(this.scope).find(candidate=>candidate.key===job.key);
  if(!current||current.scope!==this.scope||stableJSON(expectedFor(current.terms))!==stableJSON(expectedFor(job.terms))||current.terms.activationHash!==job.terms.activationHash)fail('CANONICAL_JOB_CHANGED');
  if(!HASH.test(endpointHash??'')||!HASH.test(current.terms.activationHash??'')||!DIGEST.test(current.key))fail('CANONICAL_ENDPOINT_REQUIRED');
  // An explicit fresh endpoint may replace the last retained hash after a reorg;
  // the worker rechecks it against its coherent chain observation before staging.
  return current;
 }
 location(job,endpointHash){
  const t=job.terms;
  if(!/^\d+$/.test(t.chainId)||!/^0x[0-9a-f]{40}$/i.test(t.feeStrip)||!/^\d+$/.test(t.seriesId))fail('CANONICAL_JOB_CHANGED');
  return `usufruct-proof-v1/${t.chainId}/${t.feeStrip.toLowerCase()}/${this.scope}/${t.seriesId}/${t.activationHash.toLowerCase()}/${endpointHash.toLowerCase()}/${job.key}`;
 }
 async call(method,...args){try{return await bounded(()=>this.remote[method](...args),this.timeoutMs);}catch(error){throw new ReplicaError(safe(error));}}
 async authenticate(payload,job,endpointHash){
  let artifact,result;
  try{artifact=publicArtifact(JSON.parse(bytes(payload).toString('utf8')));result=await this.validate(artifact,expectedFor(job.terms));}
  catch{fail('REMOTE_PROOF_INVALID');}
  if(artifact.blockHash?.toLowerCase()!==endpointHash.toLowerCase()||result?.blockHash?.toLowerCase()!==endpointHash.toLowerCase())fail('REMOTE_PROOF_INVALID');
  return artifact;
 }
 /** Returns authenticated bytes as an artifact; caller stages under its existing worker lease. */
 async restore(job,{endpointHash=job.endpoint_hash}={}){
  const canonical=this.current(job,endpointHash),base=this.location(canonical,endpointHash);
  const pointerBytes=bytes(await this.call('get',`${base}/current.json`));
  let pointer;try{pointer=JSON.parse(pointerBytes.toString('utf8'));}catch{fail('REMOTE_POINTER_INVALID');}
  if(pointer?.version!==1||pointer.scope!==this.scope||pointer.job!==canonical.key||pointer.endpointHash!==endpointHash.toLowerCase()||!DIGEST.test(pointer.digest??'')||pointer.key!==`${base}/${pointer.digest}.json`)fail('REMOTE_POINTER_INVALID');
  const payload=bytes(await this.call('get',pointer.key));
  if(digest(payload)!==pointer.digest)fail('REMOTE_BYTES_MISMATCH');
  const artifact=await this.authenticate(payload,canonical,endpointHash);
  const latest=this.current(canonical,endpointHash);
  if(latest.endpoint_hash!==canonical.endpoint_hash)fail('CANONICAL_JOB_CHANGED');
  return artifact;
 }
 due(){const deployment=this.store.deployment(this.scope);if(!deployment?.head_number)return [];
  return this.store.jobs(this.scope).filter(job=>BigInt(job.terms.endBlock)<=BigInt(deployment.head_number)&&!['cached-onchain','not-required'].includes(job.state));
 }
 publicStatus(){
  const probe=this.store.db.prepare('SELECT * FROM offhost_probes WHERE scope=?').get(this.scope),now=this.clock(),due=this.due();
  const records=this.store.db.prepare('SELECT * FROM offhost_artifacts WHERE scope=?').all(this.scope);
  const verified=due.filter(job=>this.sessionVerified.has(`${job.key}:${job.artifact_digest}:${job.endpoint_hash}`)&&records.some(r=>r.job===job.key&&r.digest===job.artifact_digest&&r.endpoint_hash===job.endpoint_hash&&r.verified_at<=now&&now-r.verified_at<=this.maxAgeMs)).length;
  const fresh=probe&&probe.observed_at<=now&&now-probe.observed_at<=this.maxAgeMs;
  return {ready:this.probed&&!!fresh&&!probe.last_error&&verified===due.length,observedAt:probe?.observed_at??0,lastError:probe?.last_error??null,pending:due.length-verified,verified};
 }
 async tick(){
  const lease=this.store.lease(`${this.scope}:offhost`,120000);if(!lease)return {...this.publicStatus(),ready:false,lastError:'REPLICA_BUSY'};
  const call=async(method,...args)=>{this.store.renew(lease);const result=await this.call(method,...args);this.store.assertLease(lease);return result;};
  let lastError=null;
  try{
   const probe=Buffer.from(stableJSON({version:1,nonce:randomBytes(32).toString('hex')})),key=`usufruct-proof-v1/${this.scope}/roundtrip.json`;
   await call('put',key,probe);if(!bytes(await call('get',key)).equals(probe))fail('REMOTE_BYTES_MISMATCH');this.probed=true;
   const previous=new Map(this.store.db.prepare('SELECT * FROM offhost_artifacts WHERE scope=?').all(this.scope).map(row=>[row.job,row]));
   const due=this.due();
   if(due.some(job=>!job.artifact_digest))lastError='LOCAL_PROOF_UNAVAILABLE';
   const selected=due.filter(job=>job.artifact_digest).sort((a,b)=>{
    const priority=j=>{const r=previous.get(j.key);return r&&r.digest===j.artifact_digest&&r.endpoint_hash===j.endpoint_hash?r.verified_at:0;};
    return priority(a)-priority(b);
   }).slice(0,this.maxJobs);
   for(const job of selected){
    try{
     this.current(job,job.endpoint_hash);
     const payloads=job.artifact_digest?this.store.payloads(job.artifact_digest):[];
     if(!payloads.length)fail('LOCAL_PROOF_UNAVAILABLE');
     const payload=bytes(Buffer.from(payloads[0]));
     if(digest(payload)!==job.artifact_digest)fail('LOCAL_PROOF_UNAVAILABLE');
     await this.authenticate(payload,job,job.endpoint_hash);
     const base=this.location(job,job.endpoint_hash),key=`${base}/${job.artifact_digest}.json`;
     await call('put',key,payload);if(!bytes(await call('get',key)).equals(payload))fail('REMOTE_BYTES_MISMATCH');
     const pointer=Buffer.from(stableJSON({version:1,scope:this.scope,job:job.key,endpointHash:job.endpoint_hash.toLowerCase(),digest:job.artifact_digest,key}));
     await call('put',`${base}/current.json`,pointer);if(!bytes(await call('get',`${base}/current.json`)).equals(pointer))fail('REMOTE_BYTES_MISMATCH');
     this.current(job,job.endpoint_hash);
     const latest=this.store.jobs(this.scope).find(j=>j.key===job.key);
     if(latest.artifact_digest!==job.artifact_digest||latest.endpoint_hash!==job.endpoint_hash)fail('CANONICAL_JOB_CHANGED');
     this.store.transaction(()=>{this.store.assertLease(lease);this.store.db.prepare('INSERT INTO offhost_artifacts VALUES (?,?,?,?,?) ON CONFLICT(scope,job) DO UPDATE SET endpoint_hash=excluded.endpoint_hash,digest=excluded.digest,verified_at=excluded.verified_at').run(this.scope,job.key,job.endpoint_hash,job.artifact_digest,this.clock());});
     this.sessionVerified.add(`${job.key}:${job.artifact_digest}:${job.endpoint_hash}`);
    }catch(error){lastError=safe(error);}
   }
  }catch(error){lastError=safe(error);}
  try{this.store.transaction(()=>{this.store.assertLease(lease);this.store.db.prepare('INSERT INTO offhost_probes VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET observed_at=excluded.observed_at,last_error=excluded.last_error').run(this.scope,this.clock(),lastError);});}
  finally{this.store.release(lease);}
  return this.publicStatus();
 }
}
