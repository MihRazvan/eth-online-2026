import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fail} from './config.mjs';
export class KeeperStore {
 constructor(path,{clock=Date.now}={}){
  this.path=resolve(path);this.clock=clock;this.token=randomUUID();this.lock=this.path+'.lock';
  mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
  try{mkdirSync(this.lock,{mode:0o700});}catch{fail('KEEPER_ALREADY_LOCKED');}
  try{
   writeFileSync(this.lock+'/owner.json',JSON.stringify({pid:process.pid,host:hostname(),token:this.token}),{mode:0o600});
   this.db=new DatabaseSync(this.path);chmodSync(this.path,0o600);
   this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY,end_block INTEGER NOT NULL,state TEXT NOT NULL,endpoint_hash TEXT);
    CREATE TABLE IF NOT EXISTS transactions (hash TEXT PRIMARY KEY,nonce INTEGER NOT NULL,endpoint INTEGER NOT NULL,raw TEXT NOT NULL,max_fee TEXT NOT NULL,priority_fee TEXT NOT NULL,reserved TEXT NOT NULL,created INTEGER NOT NULL,head INTEGER NOT NULL,state TEXT NOT NULL,receipt TEXT);
   `);
   if(!this.db.prepare('PRAGMA table_info(transactions)').all().some(c=>c.name==='spend_observed_at')){
    this.db.exec('BEGIN IMMEDIATE; ALTER TABLE transactions ADD COLUMN spend_observed_at INTEGER');
    this.db.prepare('UPDATE transactions SET spend_observed_at=? WHERE receipt IS NOT NULL').run(this.clock());
    this.db.exec('COMMIT');
   }
  }catch(error){this.close();throw error;}
 }
 assertLock(){let owner;try{owner=JSON.parse(readFileSync(this.lock+'/owner.json'));}catch{fail('KEEPER_LOCK_LOST');}if(owner.token!==this.token)fail('KEEPER_LOCK_LOST');}
 get(key){const row=this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key);return row?JSON.parse(row.value):null;}
 set(key,value){this.assertLock();this.db.prepare('INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
 bind(fingerprint){const old=this.get('config');if(old&&old!==fingerprint)fail('KEEPER_CONFIG_CHANGED');this.set('config',fingerprint);}
 jobs(){return this.db.prepare('SELECT * FROM jobs ORDER BY end_block,id').all();}
 upsert(id,end,state){this.assertLock();this.db.prepare('INSERT INTO jobs VALUES (?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET end_block=excluded.end_block,state=excluded.state').run(Number(id),Number(end),state);}
 state(id,state,hash=null){this.assertLock();this.db.prepare('UPDATE jobs SET state=?,endpoint_hash=? WHERE id=?').run(state,hash,id);}
 activeTxs(){return this.db.prepare("SELECT * FROM transactions WHERE state IN ('signed','broadcast','mined') ORDER BY created,hash").all();}
 nonceTxs(nonce){return this.db.prepare('SELECT * FROM transactions WHERE nonce=? ORDER BY created,hash').all(nonce);}
 reserveCost(){const cutoff=this.clock()-86400000;return this.db.prepare("SELECT reserved FROM transactions WHERE created>=? OR spend_observed_at>=? OR state IN ('signed','broadcast','mined')").all(cutoff,cutoff).reduce((sum,r)=>sum+BigInt(r.reserved),0n);}
 journal(tx){this.assertLock();this.db.prepare('INSERT INTO transactions (hash,nonce,endpoint,raw,max_fee,priority_fee,reserved,created,head,state) VALUES (?,?,?,?,?,?,?,?,?,?)').run(tx.hash,tx.nonce,tx.endpoint,tx.raw,tx.max_fee,tx.priority_fee,tx.reserved,this.clock(),tx.head,'signed');}
 txState(hash,state,receipt=null){
  this.assertLock();const encoded=receipt?JSON.stringify(receipt):null;
  this.db.prepare('UPDATE transactions SET state=?,spend_observed_at=CASE WHEN ? IS NOT NULL AND (spend_observed_at IS NULL OR receipt IS NULL OR receipt!=?) THEN ? ELSE spend_observed_at END,receipt=? WHERE hash=?').run(state,encoded,encoded,this.clock(),encoded,hash);
 }
 close(){this.db?.close();this.db=null;try{if(JSON.parse(readFileSync(this.lock+'/owner.json')).token===this.token)rmSync(this.lock,{recursive:true});}catch{}}
}
/** Offline operator recovery only: never evicts a live PID or a lock from another host. */
export function recoverDeadLock(path){const lock=resolve(path)+'.lock',owner=JSON.parse(readFileSync(lock+'/owner.json'));if(owner.host!==hostname())fail('LOCK_HOST_MISMATCH');try{process.kill(owner.pid,0);fail('LOCK_OWNER_ALIVE');}catch(error){if(error.code!=='ESRCH')throw error;}rmSync(lock,{recursive:true});}
export function readKeeperStatus(path){let db;try{db=new DatabaseSync(resolve(path),{readOnly:true});const row=db.prepare("SELECT value FROM metadata WHERE key='publicStatus'").get();return row?JSON.parse(row.value):{status:'not-observed'};}catch{return {status:'unavailable',error:'KEEPER_STATUS_UNAVAILABLE'};}finally{db?.close();}}
