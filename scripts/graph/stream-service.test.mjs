import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ConnectError,Code} from '@connectrpc/connect';
import {HistoryStore} from '../../packages/data/src/store.mjs';
import {SubstreamsHistorySink} from '../../packages/data/src/substreams.mjs';
import {acquireWriterLock,failureCode,supervise,validateConfig,storageGuard,consumeBoundedResponse} from './stream-service.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0');
const anchor={block:100,hash:h(100),logIndex:1,tick:0,transactionHash:h(900)};
const config={chainId:11155111,poolManager:a(1),poolIds:[h(10)],packageHash:h(99),finalBlocksOnly:true,startBlock:100,initialization:{[h(10)]:anchor}};
const envelope=n=>({clock:{number:n,id:h(n)},providerCursor:`SECRET-CURSOR-${n}`,finalBlockHeight:n,output:{number:n,hash:h(n),parentHash:h(n-1),timestamp:1234,chainId:11155111,poolManager:a(1),allocationAuthority:'contract-only',initialized:n===100?[{poolId:h(10),logIndex:1,tick:0,transactionHash:h(900),currency0:a(2),currency1:a(3),hooks:a(0),fee:3000,tickSpacing:60,sqrtPriceX96:'79228162514264337593543950336'}]:[]}});
const base={network:'sepolia',db:'/data/history.sqlite',packagePath:'/app/package.spkg',packageHash:h(99),pools:[h(10)],start:100,initialization:{[h(10)]:anchor}};
test('configuration is explicit, bounded and refuses relative paths or unpinned package',()=>{
 assert.equal(validateConfig(base).retryMaxMs,30000);
 for(const change of [{network:'mainnet'},{db:'relative.db'},{packagePath:'relative.spkg'},{packageHash:undefined},{pools:[]},{pools:[h(10),h(10)]},{initialization:undefined},{start:-1},{maxConsecutiveFailures:999},{connectionTimeoutMs:1}])assert.throws(()=>validateConfig({...base,...change}));
});
test('writer exclusion and nonce-owned release prevent overlapping ingestion',()=>{
 const dir=mkdtempSync(join(tmpdir(),'graph-lock-')),db=join(dir,'history.sqlite');try{
 const first=acquireWriterLock(db);assert.throws(()=>acquireWriterLock(db));first.assertOwned();first.release();
 const second=acquireWriterLock(db),file=`${db}.stream.lock`,record=JSON.parse(readFileSync(file,'utf8'));writeFileSync(file,JSON.stringify({...record,nonce:'different-writer'}));assert.throws(()=>second.assertOwned());assert.throws(()=>second.release());
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('disconnect/restart resume solely from committed SQLite cursor and finish the bounded history',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'graph-resume-')),path=join(dir,'history.sqlite');let store=new HistoryStore(path),sink=new SubstreamsHistorySink(store,config);const reports=[],waits=[];let calls=0;
 try{
 await supervise({sink,signal:new AbortController().signal,stop:103,report:r=>reports.push(r),wait:async ms=>waits.push(ms),consume:r=>sink.applyBlock(r),open:async function*(cursor){calls++;if(calls===1){assert.equal(cursor,undefined);yield envelope(100);throw new ConnectError('sensitive-token / private endpoint',Code.Unavailable);}assert.equal(cursor,'SECRET-CURSOR-100');yield envelope(100);yield envelope(101);yield envelope(102);}});
 assert.equal(calls,2);assert.deepEqual(waits,[1000]);assert.equal(sink.checkpoint().number,102);store.close();
 store=new HistoryStore(path);sink=new SubstreamsHistorySink(store,config);
 await supervise({sink,signal:new AbortController().signal,stop:104,consume:r=>sink.applyBlock(r),open:async function*(cursor){assert.equal(cursor,'SECRET-CURSOR-102');yield envelope(103);}});
 assert.equal(sink.checkpoint().number,103);assert.equal(sink.historyStatus().seeded,true);
 assert.doesNotMatch(JSON.stringify(reports),/sensitive-token|private endpoint|SECRET-CURSOR/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('auth, malformed data, finalized reorg and missing Initialize fail without retry',async()=>{
 for(const failure of ['auth','malformed','reorg','missing-init']){
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,config);let calls=0,waits=0;
 try{await assert.rejects(supervise({sink,signal:new AbortController().signal,wait:async()=>waits++,consume:r=>r.undo?sink.undo(r.undo):sink.applyBlock(r),open:async function*(){calls++;if(failure==='auth')throw new ConnectError('SECRET',Code.Unauthenticated);if(failure==='missing-init'){yield {...envelope(100),output:{...envelope(100).output,initialized:[]}};return;}yield envelope(100);if(failure==='reorg')yield {undo:{number:99,hash:h(99),providerCursor:'bad'}};else yield {...envelope(101),clock:{number:100,id:h(100)}};}}));
 assert.equal(calls,1);assert.equal(waits,0);assert.equal(sink.checkpoint()?.number,failure==='auth'||failure==='missing-init'?undefined:100);
 }finally{store.close();}}
});
test('retry budget/backoff are bounded; replay-only responses do not reset failures',async()=>{
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,config),waits=[];let calls=0;try{
 await assert.rejects(supervise({sink,signal:new AbortController().signal,maxConsecutiveFailures:4,retryBaseMs:1000,retryMaxMs:1500,consume:r=>sink.applyBlock(r),wait:async ms=>waits.push(ms),open:async function*(){calls++;yield envelope(100);throw new ConnectError('SECRET',Code.Unavailable);}}),/retry-budget-exhausted/);
 assert.equal(calls,4);assert.deepEqual(waits,[1000,1500,1500]);assert.equal(sink.checkpoint().number,100);
 }finally{store.close();}
 assert.equal(failureCode(new Error('PRIVATE_KEY=SECRET')),'stream-validation-failed');
});
test('shutdown cancels a backoff without discarding committed history',async()=>{
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,config),controller=new AbortController();try{
 await supervise({sink,signal:controller.signal,consume:r=>sink.applyBlock(r),wait:async()=>{controller.abort();throw new Error('aborted');},open:async function*(){yield envelope(100);throw new ConnectError('offline',Code.Unavailable);}});
 assert.equal(sink.checkpoint().number,100);
 }finally{store.close();}
});

test('disk guard reserves 256MiB and stops a running stream before the next guarded write',async()=>{
 const min=268435456;let free=BigInt(min),checks=0;
 const guard=storageGuard('/data/history.sqlite',min,()=>{checks++;return {bavail:free,bsize:1n};});
 guard();free--;assert.throws(guard,/storage-capacity-low/);assert.throws(storageGuard('/data/history.sqlite',min,()=>{throw new Error('SECRET');}),/storage-capacity-unavailable/);
 free=BigInt(min);checks=0;const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,config);
 try{await assert.rejects(supervise({sink,checkStorage:guard,signal:new AbortController().signal,consume:r=>sink.applyBlock(r),open:async function*(){for(let n=100;n<300;n++){if(n===101)free=0n;yield envelope(n);}}}),/storage-capacity-low/);
 assert.equal(sink.checkpoint().number,199);assert.equal(checks,3);
 }finally{store.close();}
});

test('bounded completion cancels immediately without waiting for provider end-of-stream',{timeout:1000},async()=>{
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,config),reports=[];let nextCalls=0,closed=false,connectionSignal;
 try{
 await supervise({sink,stop:101,signal:new AbortController().signal,consume:r=>sink.applyBlock(r),report:r=>reports.push(r),open:(_cursor,signal)=>{
  connectionSignal=signal;
  return {[Symbol.asyncIterator](){return this;},next(){nextCalls++;return nextCalls===1?Promise.resolve({value:envelope(100),done:false}):new Promise(()=>{});},return(){assert.equal(signal.aborted,true);closed=true;return Promise.resolve({done:true});}};
 }});
 assert.equal(nextCalls,1);assert.equal(closed,true);assert.equal(connectionSignal.aborted,true);assert.equal(sink.checkpoint().number,100);assert.equal(reports.at(-1).status,'bounded-complete');
 }finally{store.close();}
});
test('out-of-range RPC envelope is rejected before decoding or committing to the sink',()=>{
 let writes=0;const sink={applyBlock(){writes++;}};
 for(const number of [101,102])assert.throws(()=>consumeBoundedResponse({message:{case:'blockScopedData',value:{clock:{number}}}},undefined,sink,101),/block-outside-bounded-range/);
 assert.equal(writes,0);
});

test('bounded completion aborts SDK-style iterators which omit return()',{timeout:1000},async()=>{
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,config);let canceled=false,nextCalls=0;
 try{await supervise({sink,stop:101,signal:new AbortController().signal,consume:r=>sink.applyBlock(r),open:(_cursor,signal)=>{
 signal.addEventListener('abort',()=>{canceled=true;},{once:true});
 return {[Symbol.asyncIterator](){return {next(){nextCalls++;return nextCalls===1?Promise.resolve({value:envelope(100),done:false}):new Promise(()=>{});}};}};
 }});assert.equal(canceled,true);assert.equal(nextCalls,1);assert.equal(sink.checkpoint().number,100);
 }finally{store.close();}
});
