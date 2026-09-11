import {acquireWitness} from '../../../scripts/chain/proof.mjs';
import {validateWitness} from './validate.mjs';
import {normalizeConfig,clientsFor,observe,discover,assertNetwork,assertObservation,endpointObservation} from './chain.mjs';
import {RetentionError,digest,fail} from './store.mjs';
import {publicArtifact} from './artifact.mjs';

const SAFE_ERRORS=new Set(['NETWORK_IDENTITY_CHANGED','DEPLOYMENT_CODE_CHANGED','DEPLOYMENT_BINDINGS_CHANGED','FINALITY_INCONSISTENT','FINALITY_REGRESSION','FINALITY_CONFLICT','DISCOVERY_REORG','DISCOVERY_LIMIT_EXCEEDED','INVALID_SERIES_TERMS','INVALID_SERIES_CURRENCY','ACTIVATION_ORPHANED','CHECKPOINT_CONFLICT','ENDPOINT_REORG','LEASE_LOST','ARTIFACT_DATABASE_CORRUPT','UNSAFE_ARTIFACT_PATH','PROOF_ACQUISITION_FAILED','ARTIFACT_SCOPE_MISMATCH','ARTIFACT_LIMIT_EXCEEDED','ARTIFACT_MALFORMED']);
export const safeError=error=>error instanceof RetentionError&&SAFE_ERRORS.has(error.code)?error.code:'OBSERVATION_UNAVAILABLE';
export const expectedFor=terms=>({chainId:terms.chainId,manager:terms.manager,managerCodeHash:terms.managerCodeHash,blockNumber:terms.endBlock,slots:terms.slots});

/** Read-only retention: no private keys, payout decisions or automatic transactions. */
export class RetentionWorker {
 constructor(config,store,dependencies={}){
  this.config=normalizeConfig(config);this.store=store;this.clients=dependencies.clients??clientsFor(this.config);this.primary=this.clients[0];
  this.scope=store.bind(this.config.identity);
  this.dependencies={observe,discover,assertNetwork,assertObservation,endpointObservation,acquireWitness,validateWitness,...dependencies};
  this.validated=new Map();this.maintenanceCursor=0;this.repairCursor=0;
 }
 async tick(){
  const lease=this.store.lease(this.scope);if(!lease)return {status:'busy'};
  const d=this.dependencies;
  try{
   const observation=await d.observe(this.primary,this.config);
   await this.checkFinality(observation);
   // Known jobs get the first acquisition opportunity at N, before a fresh enumeration.
   const known=this.store.jobs(this.scope);
   const due=known.filter(j=>BigInt(j.terms.endBlock)<=observation.head.number&&((!j.artifact_digest&&!['cached-onchain','not-required'].includes(j.state))||(!j.finalized&&BigInt(j.terms.endBlock)===observation.head.number))).sort((a,b)=>BigInt(a.terms.endBlock)>BigInt(b.terms.endBlock)?-1:1).slice(0,8);
   for(const job of due){this.store.renew(lease);await this.retain(lease,job,observation);}
   this.store.renew(lease);
   const discovered=await d.discover(this.primary,this.config,observation,{known:this.store.jobs(this.scope)});
   const {terms,complete}=Array.isArray(discovered)?{terms:discovered,complete:true}:discovered;
   await d.assertObservation(this.primary,observation);
   this.store.reconcile(lease,terms,{...observation,discoveryComplete:complete});
   const old=new Set(known.map(j=>j.key));
   for(const job of this.store.jobs(this.scope).filter(j=>!old.has(j.key)).slice(0,8)){this.store.renew(lease);await this.retain(lease,job,observation);}
   const maintenance=this.store.jobs(this.scope).filter(j=>old.has(j.key)&&!due.some(d=>d.key===j.key));
   for(let i=0;i<Math.min(4,maintenance.length);i++){
    const job=maintenance[(this.maintenanceCursor+i)%maintenance.length];this.store.renew(lease);await this.retain(lease,job,observation);
   }
   this.maintenanceCursor+=4;
   await this.repair(lease);
   return {status:'observed',blockNumber:String(observation.head.number),jobs:this.store.jobs(this.scope).length};
  }catch(error){
   const code=safeError(error);
   // Local repair remains available when all observation RPCs are down.
   try{await this.repair(lease);}catch{}
   try{this.store.observationError(lease,code);}catch{}
   return {status:'unavailable',error:code};
  }finally{this.store.release(lease);}
 }
 async repair(lease){
  // Bounded maintenance follows due acquisition; it makes no canonicality assertion.
  const jobs=this.store.jobs(this.scope);let budget=8;
  for(let i=0;i<Math.min(8,jobs.length)&&budget>0;i++){
   const job=jobs[(this.repairCursor+i)%jobs.length];
   this.store.renew(lease);
   for(const candidate of this.store.candidates(job)){
    if(--budget<0)break;
    if(this.store.healthy(candidate.digest))continue;
    for(const payload of this.store.payloads(candidate.digest)){
     try{
      const artifact=publicArtifact(JSON.parse(payload));
      await this.authenticate(artifact,expectedFor(job.terms));
      this.store.restorePayload(lease,candidate.digest,payload);
      this.store.replicate(lease,candidate.digest);break;
     }catch(error){if(safeError(error)==='LEASE_LOST')throw error;}
    }
   }
  }
  this.repairCursor+=8;
 }
 async authenticate(artifact,expected){
  const key=digest({artifact,expected});
  if(this.validated.has(key))return this.validated.get(key);
  const result=await this.dependencies.validateWitness(artifact,expected);
  if(this.validated.size>=256)this.validated.delete(this.validated.keys().next().value);
  this.validated.set(key,result);return result;
 }
 async checkFinality({head,finalized}){
  const previous=this.store.deployment(this.scope);
  if(!previous.finalized_number)return;
  const old=BigInt(previous.finalized_number);
  if(head.number<old||(finalized&&finalized.number<old))fail('FINALITY_REGRESSION');
  const retained=await this.primary.getBlock({blockNumber:old});
  if(retained.hash.toLowerCase()!==previous.finalized_hash.toLowerCase())fail('FINALITY_CONFLICT');
 }
 async retain(lease,job,observation){
  const d=this.dependencies,n=BigInt(job.terms.endBlock),expected=expectedFor(job.terms);
  const observedFields={endpoint_observed_at:this.store.clock(),endpoint_observed_block:String(observation.head.number),endpoint_observed_hash:observation.head.hash};
  if(n>observation.head.number){
   if(job.lifecycle==='closed')this.store.update(lease,job.key,{state:'not-required',last_error:null});
   return;
  }
  try{
   const endpoint=await d.endpointObservation(this.primary,this.config,job,observation);
   await d.assertObservation(this.primary,observation);
   if(job.endpoint_hash&&job.endpoint_hash!==endpoint.hash){
    this.store.update(lease,job.key,{state:'orphaned',artifact_digest:null,endpoint_hash:endpoint.hash,finalized:0,checkpoint_hash:null,growth_cached:0,last_error:'ENDPOINT_REORG'});
   }
   let selected;
   // Full authentication on first use per process; cached results bind every byte and expected pin.
   for(const candidate of this.store.candidates(job)){
    for(const payload of this.store.payloads(candidate.digest)){
    try{
     const artifact=publicArtifact(JSON.parse(payload));
     if(artifact.blockHash.toLowerCase()!==endpoint.hash)continue;
     const validated=await this.authenticate(artifact,expected);
     if(validated.blockHash.toLowerCase()!==endpoint.hash)continue;
     this.store.restorePayload(lease,candidate.digest,payload);
     selected={id:candidate.digest,artifact,validated};break;
    }catch{}
    }
    if(selected)break;
   }
   if(!selected&&(endpoint.growthCached||['allocated','closed'].includes(job.lifecycle))){
    await d.assertObservation(this.primary,observation);
    this.store.update(lease,job.key,{...observedFields,state:endpoint.growthCached?'cached-onchain':'not-required',artifact_digest:null,endpoint_hash:endpoint.hash,finalized:Number(endpoint.finalized),checkpoint_hash:endpoint.checkpointHash,growth_cached:Number(endpoint.growthCached),last_error:null});
    return;
   }
   if(!selected){
    this.store.update(lease,job.key,{attempts:job.attempts+1});
    try{
     selected=await Promise.any(this.clients.map(async client=>{
      await d.assertNetwork(client,this.config);
      const artifact=publicArtifact(await d.acquireWitness(client,{manager:expected.manager,slots:expected.slots,blockNumber:n}));
      const validated=await this.authenticate(artifact,expected);
      if(validated.blockHash.toLowerCase()!==endpoint.hash)fail('ARTIFACT_SCOPE_MISMATCH');
      return {artifact,validated};
     }));
    }catch{fail('PROOF_ACQUISITION_FAILED');}
    selected.id=this.store.stage(lease,job,selected.artifact,expected,selected.validated);
   }
   if(!this.store.healthy(selected.id))this.store.replicate(lease,selected.id);
   const latest=await d.endpointObservation(this.primary,this.config,job,observation);
   if(latest.hash!==endpoint.hash)fail('ENDPOINT_REORG');
   await d.assertObservation(this.primary,observation);
   this.store.update(lease,job.key,{...observedFields,state:'retained',artifact_digest:selected.id,endpoint_hash:latest.hash,finalized:Number(latest.finalized),checkpoint_hash:latest.checkpointHash,growth_cached:Number(latest.growthCached),last_error:null});
  }catch(error){
   let code=safeError(error);
   if(code==='LEASE_LOST')throw error;
   // A mismatching subread during a reorg is not yet a coherent orphan verdict.
   if(['ACTIVATION_ORPHANED','ENDPOINT_REORG','CHECKPOINT_CONFLICT'].includes(code)){
    try{await d.assertObservation(this.primary,observation);}catch(observationError){code=safeError(observationError);}
   }
   const invalid=['ACTIVATION_ORPHANED','ENDPOINT_REORG','CHECKPOINT_CONFLICT'].includes(code);
   this.store.update(lease,job.key,{state:invalid?'orphaned':'unavailable',last_error:code,...(invalid?{artifact_digest:null,finalized:0,checkpoint_hash:null,growth_cached:0}:{})});
  }
 }
}
