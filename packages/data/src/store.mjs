import {DatabaseSync} from 'node:sqlite';
/** One local SQLite sink. Apply cursor and events in the same transaction; undo by retained block hash. */
export class HistoryStore {
 constructor(path=':memory:') {this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS blocks (number INTEGER PRIMARY KEY, hash TEXT NOT NULL, cursor TEXT NOT NULL); CREATE TABLE IF NOT EXISTS swaps (block INTEGER NOT NULL, logIndex INTEGER NOT NULL, chainId INTEGER NOT NULL, manager TEXT NOT NULL, pool TEXT NOT NULL, tick INTEGER NOT NULL, PRIMARY KEY(block,logIndex));`);}
 apply({number,hash,parentHash,cursor,swaps}) {
  const tip=this.db.prepare('SELECT * FROM blocks ORDER BY number DESC LIMIT 1').get();
  if(tip&&tip.number===number&&tip.hash===hash)return;
  if(tip&&(number!==tip.number+1||parentHash!==tip.hash))throw new Error('Reorg or gap requires explicit undo before continuing');
  if(!Number.isSafeInteger(number)||!/^0x[0-9a-f]{64}$/i.test(hash)||!cursor)throw new Error('Invalid block envelope');
  this.db.exec('BEGIN');
  try {this.db.prepare('INSERT INTO blocks VALUES (?,?,?)').run(number,hash,cursor);const insert=this.db.prepare('INSERT INTO swaps VALUES (?,?,?,?,?,?)');
   for(const s of swaps){if(!Number.isInteger(s.tick)||s.tick< -887272||s.tick>887272)throw new Error('Invalid tick');insert.run(number,s.logIndex,s.chainId,s.manager.toLowerCase(),s.pool.toLowerCase(),s.tick);}
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 undo(number,hash) {const retained=this.db.prepare('SELECT hash FROM blocks WHERE number=?').get(number);if(retained?.hash!==hash)throw new Error('Undo block not retained; resync required');this.db.exec('BEGIN');try{this.db.prepare('DELETE FROM swaps WHERE block>?').run(number);this.db.prepare('DELETE FROM blocks WHERE number>?').run(number);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 head(){return this.db.prepare('SELECT * FROM blocks ORDER BY number DESC LIMIT 1').get();}
 samples({chainId,manager,pool,fromBlock,toBlock}) {const args=[chainId,manager.toLowerCase(),pool.toLowerCase()];const initial=this.db.prepare('SELECT block,logIndex,tick FROM swaps WHERE chainId=? AND manager=? AND pool=? AND block<=? ORDER BY block DESC,logIndex DESC LIMIT 1').get(...args,fromBlock);return [...(initial?[initial]:[]),...this.db.prepare('SELECT block,logIndex,tick FROM swaps WHERE chainId=? AND manager=? AND pool=? AND block>? AND block<=? ORDER BY block,logIndex').all(...args,fromBlock,toBlock)];}
 close(){this.db.close();}
}
