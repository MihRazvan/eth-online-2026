import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readRetainedWindow} from './verify-stream.mjs';
const fixture=()=>{const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE blocks(number INTEGER PRIMARY KEY,hash TEXT,cursor TEXT)');const insert=db.prepare('INSERT INTO blocks VALUES(?,?,?)');for(let i=100;i<1100;i++)insert.run(i,'hash'+i,'cursor'+i);return db;};
test('explicit tail verifies bounded ascending rows without loosening the default qualification limit',()=>{
 const db=fixture();try{assert.throws(()=>readRetainedWindow(db));for(const n of [0,101,-1,1.5])assert.throws(()=>readRetainedWindow(db,n));
 const {extent,rows}=readRetainedWindow(db,20);assert.deepEqual({...extent},{count:1000,first:100,last:1099});assert.equal(rows.length,20);assert.equal(rows[0].number,1080);assert.equal(rows.at(-1).number,1099);
 }finally{db.close();}
});
test('a tail cannot hide a missing prefix block',()=>{const db=fixture();try{db.prepare('DELETE FROM blocks WHERE number=150').run();assert.throws(()=>readRetainedWindow(db,20),/gap/);}finally{db.close();}});
