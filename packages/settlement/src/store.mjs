import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve,sep} from 'node:path';

export const stableJSON=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:stableJSON(value)).digest('hex');
export class RetentionError extends Error {
 constructor(code){super(code);this.name='RetentionError';this.code=code;}
}
export const fail=code=>{throw new RetentionError(code);};

/** One SQLite writer lease per deployment. Network/filesystem waits never hold a SQL transaction. */
export class RetentionStore {
 constructor(path,{artifactRoots,clock=Date.now,fault=()=>{}}){
  if(!Array.isArray(artifactRoots)||artifactRoots.length!==2)fail('TWO_ARTIFACT_ROOTS_REQUIRED');
  this.clock=clock;this.fault=fault;
  this.roots=artifactRoots.map(path=>{mkdirSync(path,{recursive:true,mode:0o700});return realpathSync(path);});
  if(this.roots[0]===this.roots[1]||this.roots.some((a,i)=>this.roots[1-i].startsWith(a+sep)))fail('ARTIFACT_ROOTS_NOT_DISTINCT');
  if(path!==':memory:'){
   mkdirSync(dirname(resolve(path)),{recursive:true,mode:0o700});
   try{const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())fail('UNSAFE_DATABASE_PATH');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  this.db=new DatabaseSync(path);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS deployments(id TEXT PRIMARY KEY,identity TEXT NOT NULL,head_number TEXT,head_hash TEXT,finalized_number TEXT,finalized_hash TEXT,finality_observed INTEGER NOT NULL DEFAULT 0,observed_at INTEGER,last_error TEXT,discovery_complete INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS leases(scope TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS jobs(key TEXT PRIMARY KEY,scope TEXT NOT NULL,series_id TEXT NOT NULL,terms TEXT NOT NULL,current INTEGER NOT NULL DEFAULT 1,lifecycle TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'scheduled',artifact_digest TEXT,endpoint_hash TEXT,finalized INTEGER NOT NULL DEFAULT 0,checkpoint_hash TEXT,growth_cached INTEGER NOT NULL DEFAULT 0,endpoint_observed_at INTEGER,endpoint_observed_block TEXT,endpoint_observed_hash TEXT,last_error TEXT,attempts INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS current_jobs ON jobs(scope,current);
   CREATE TABLE IF NOT EXISTS artifacts(digest TEXT PRIMARY KEY,payload TEXT NOT NULL,expected TEXT NOT NULL,validated TEXT NOT NULL,copies INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS job_artifacts(job TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(job,digest));
  `);
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 bind(identity){const serialized=stableJSON(identity),id=digest(serialized);this.db.prepare('INSERT OR IGNORE INTO deployments(id,identity) VALUES (?,?)').run(id,serialized);return id;}
 lease(scope,ttl=120000){
  return this.transaction(()=>{
   const now=this.clock(),old=this.db.prepare('SELECT * FROM leases WHERE scope=?').get(scope);
   if(old&&old.expires>now)return null;
   const lease={scope,owner:randomUUID(),generation:(old?.generation??0)+1,expires:now+ttl};
   this.db.prepare('INSERT INTO leases VALUES (?,?,?,?) ON CONFLICT(scope) DO UPDATE SET owner=excluded.owner,generation=excluded.generation,expires=excluded.expires').run(scope,lease.owner,lease.generation,lease.expires);
   return lease;
  });
 }
 assertLease(lease){const row=this.db.prepare('SELECT * FROM leases WHERE scope=?').get(lease.scope);if(!row||row.owner!==lease.owner||row.generation!==lease.generation||row.expires<=this.clock())fail('LEASE_LOST');}
 renew(lease,ttl=120000){return this.transaction(()=>{this.assertLease(lease);lease.expires=this.clock()+ttl;this.db.prepare('UPDATE leases SET expires=? WHERE scope=?').run(lease.expires,lease.scope);});}
 release(lease){this.db.prepare('UPDATE leases SET expires=0 WHERE scope=? AND owner=? AND generation=?').run(lease.scope,lease.owner,lease.generation);}
 jobs(scope,{all=false}={}){return this.db.prepare(`SELECT * FROM jobs WHERE scope=? ${all?'':'AND current=1'}`).all(scope).map(row=>({...row,terms:JSON.parse(row.terms)}));}
 deployment(scope){return this.db.prepare('SELECT * FROM deployments WHERE id=?').get(scope);}
 reconcile(lease,terms,{head,finalized,discoveryComplete=true}){
  this.transaction(()=>{
   this.assertLease(lease);const now=this.clock();
   this.db.prepare('UPDATE jobs SET current=0 WHERE scope=?').run(lease.scope);
   for(const item of terms){
    const key=digest({scope:lease.scope,terms:{...item,lifecycle:undefined}});
    this.db.prepare(`INSERT INTO jobs(key,scope,series_id,terms,lifecycle,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET current=1,terms=excluded.terms,lifecycle=excluded.lifecycle,updated_at=excluded.updated_at`).run(key,lease.scope,item.seriesId,stableJSON(item),item.lifecycle,now);
   }
   this.db.prepare("UPDATE jobs SET state='orphaned',finalized=0,last_error='ACTIVATION_ORPHANED',updated_at=? WHERE scope=? AND current=0").run(now,lease.scope);
   this.db.prepare('UPDATE deployments SET head_number=?,head_hash=?,finalized_number=COALESCE(?,finalized_number),finalized_hash=COALESCE(?,finalized_hash),finality_observed=?,observed_at=?,last_error=NULL,discovery_complete=? WHERE id=?').run(head.number.toString(),head.hash,finalized?.number.toString()??null,finalized?.hash??null,Number(!!finalized),now,Number(discoveryComplete),lease.scope);
  });
 }
 observationError(lease,code){this.transaction(()=>{this.assertLease(lease);this.db.prepare('UPDATE deployments SET last_error=? WHERE id=?').run(code,lease.scope);});}
 update(lease,key,fields){
  const allowed=new Set(['state','artifact_digest','endpoint_hash','finalized','checkpoint_hash','growth_cached','last_error','attempts','endpoint_observed_at','endpoint_observed_block','endpoint_observed_hash']);
  if(!Object.keys(fields).length||Object.keys(fields).some(k=>!allowed.has(k)))fail('INVALID_JOB_UPDATE');
  this.transaction(()=>{this.assertLease(lease);this.db.prepare(`UPDATE jobs SET ${Object.keys(fields).map(k=>`${k}=?`).join(',')},updated_at=? WHERE key=? AND scope=? AND current=1`).run(...Object.values(fields),this.clock(),key,lease.scope);});
 }
 stage(lease,job,artifact,expected,validated){
  const payload=stableJSON(artifact),id=digest(payload);
  this.transaction(()=>{
   this.assertLease(lease);
   this.db.prepare('INSERT OR IGNORE INTO artifacts(digest,payload,expected,validated,created_at) VALUES (?,?,?,?,?)').run(id,payload,stableJSON(expected),stableJSON(validated),this.clock());
   this.db.prepare('INSERT OR IGNORE INTO job_artifacts VALUES (?,?)').run(job.key,id);
  });
  this.fault('after-stage');
  return id;
 }
 candidates(job){return this.db.prepare('SELECT a.* FROM artifacts a JOIN job_artifacts j ON a.digest=j.digest WHERE j.job=? ORDER BY a.created_at DESC').all(job.key);}
 artifact(id){if(!/^[a-f0-9]{64}$/.test(id))return undefined;return this.db.prepare('SELECT * FROM artifacts WHERE digest=?').get(id);}
 payloads(id){
  const row=this.artifact(id);if(!row)return [];
  const candidates=[row.payload];
  for(const root of this.roots){
   try{const path=join(root,`${id}.json`),stat=lstatSync(path);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=2*1024*1024)candidates.push(readFileSync(path,'utf8'));}catch{}
  }
  return [...new Set(candidates)].filter(payload=>digest(payload)===id);
 }
 restorePayload(lease,id,payload){
  if(digest(payload)!==id)fail('ARTIFACT_DATABASE_CORRUPT');
  this.transaction(()=>{this.assertLease(lease);this.db.prepare('UPDATE artifacts SET payload=? WHERE digest=?').run(payload,id);});
 }
 healthy(id){
  const row=this.artifact(id);if(!row||row.copies!==2||digest(row.payload)!==id)return false;
  return this.roots.every(root=>{try{const path=join(root,`${id}.json`),stat=lstatSync(path);return stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=2*1024*1024&&digest(readFileSync(path))===id;}catch{return false;}});
 }
 /** SQLite already retains a verified copy before either file write. A restart can finish replication without RPC. */
 replicate(lease,id){
  this.assertLease(lease);const row=this.artifact(id);if(!row||digest(row.payload)!==id)fail('ARTIFACT_DATABASE_CORRUPT');
  this.transaction(()=>{this.assertLease(lease);this.db.prepare('UPDATE artifacts SET copies=0 WHERE digest=?').run(id);});
  for(const [index,root] of this.roots.entries()){
   const target=join(root,`${id}.json`);
   let good=false;
   let stat;
   try{stat=lstatSync(target);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(stat){
    if(!stat.isFile()||stat.isSymbolicLink())fail('UNSAFE_ARTIFACT_PATH');
    good=digest(readFileSync(target))===id;
    if(!good)renameSync(target,join(root,`${id}.corrupt-${randomUUID()}`));
   }
   if(!good){
    const temporary=join(root,`.${id}.${randomUUID()}.tmp`);let fd;
    try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,row.payload);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,target);}
    finally{if(fd!==undefined)closeSync(fd);if(existsSync(temporary))unlinkSync(temporary);}
   }
   const directory=openSync(root,'r');try{fsyncSync(directory);}finally{closeSync(directory);}
   this.fault(`after-copy-${index+1}`);
   this.transaction(()=>{this.assertLease(lease);this.db.prepare('UPDATE artifacts SET copies=? WHERE digest=?').run(index+1,id);});
  }
  this.transaction(()=>{this.assertLease(lease);this.db.prepare('UPDATE artifacts SET copies=2 WHERE digest=?').run(id);});
  this.fault('after-replication');
 }
 publicStatus(scope,seriesId){
  const deployment=this.deployment(scope);if(!deployment)return null;
  const job=this.jobs(scope).find(j=>j.series_id===String(seriesId));if(!job)return null;
  const artifact=job.artifact_digest&&this.artifact(job.artifact_digest);
  return {schemaVersion:1,seriesId:job.series_id,chainId:job.terms.chainId,feeStrip:job.terms.feeStrip,verifier:job.terms.verifier,manager:job.terms.manager,endBlock:job.terms.endBlock,
   state:job.state,lifecycle:job.lifecycle,endpointHash:job.endpoint_hash,finalized:!!job.finalized,checkpointSaved:!!job.checkpoint_hash,checkpointHash:job.checkpoint_hash,growthCached:!!job.growth_cached,
   artifactDigest:job.artifact_digest,copies:artifact?.copies??0,storageDescription:'SQLite plus two configured filesystem copies; independent failure domains are not established',
   lastObservedBlock:job.endpoint_observed_block??deployment.head_number,lastObservedHash:job.endpoint_observed_hash??deployment.head_hash,lastObservedAt:job.endpoint_observed_at??deployment.observed_at,discoveryObservedAt:deployment.observed_at,finalityObserved:!!deployment.finality_observed,discoveryComplete:!!deployment.discovery_complete,observationError:deployment.last_error,error:job.last_error,
   allocationAuthority:'contract-only',updatedAt:job.updated_at};
 }
 close(){this.db.close();}
}
