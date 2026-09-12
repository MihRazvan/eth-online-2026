#!/usr/bin/env node
/** Finalized earning-window pool history. SQLite is the only cursor authority. */
import {closeSync,fsyncSync,mkdirSync,openSync,readFileSync,statSync,statfsSync,unlinkSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,isAbsolute} from 'node:path';
import {hostname} from 'node:os';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {ConnectError} from '@connectrpc/connect';
import {createConnectTransport} from '@connectrpc/connect-node';
import {createAuthInterceptor,createRegistry,createRequest,createSubstream,streamBlocks} from '@substreams/core';
import {configurePackage,consumeResponse} from '../../packages/substreams/sink/run.mjs';
import {HistoryStore} from '../../packages/data/src/store.mjs';
import {SubstreamsHistorySink} from '../../packages/data/src/substreams.mjs';

const ENDPOINT='https://sepolia.eth.streamingfast.io';
const HASH=/^0x[0-9a-f]{64}$/;
const RETRY_CODES=new Set([2,4,8,10,13,14]);
class ServiceError extends Error {constructor(code){super(code);this.safeCode=code;}}
function fail(code){throw new ServiceError(code);}
function integer(value,min,max,code){const n=Number(value);if(!['string','number'].includes(typeof value)||!/^\d+$/.test(String(value))||!Number.isSafeInteger(n)||n<min||n>max)fail(code);return n;}
export function validateConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.network!=='sepolia')fail('config-invalid');
 for(const key of ['db','packagePath'])if(typeof input[key]!=='string'||!isAbsolute(input[key]))fail('config-path-invalid');
 if(typeof input.packageHash!=='string'||!HASH.test(input.packageHash))fail('package-hash-required');
 if(!Array.isArray(input.pools)||input.pools.length===0||input.pools.length>32||input.pools.some(p=>typeof p!=='string'||!HASH.test(p))||new Set(input.pools).size!==input.pools.length)fail('pool-selection-invalid');
 if(!input.initialization||typeof input.initialization!=='object'||Array.isArray(input.initialization))fail('history-anchor-required');
 const start=integer(input.start,1,Number.MAX_SAFE_INTEGER,'start-invalid');
 // The sink checks each Initialize/Swap anchor's exact pool/block/hash/tick/log/transaction identity.
 return {network:input.network,db:input.db,packagePath:input.packagePath,packageHash:input.packageHash,pools:input.pools,start,initialization:input.initialization,
  retryBaseMs:integer(input.retryBaseMs??1000,100,60000,'retry-invalid'),retryMaxMs:integer(input.retryMaxMs??30000,1000,300000,'retry-invalid'),
  minFreeBytes:integer(input.minFreeBytes??268435456,268435456,Number.MAX_SAFE_INTEGER,'storage-reserve-invalid'),maxConsecutiveFailures:integer(input.maxConsecutiveFailures??8,1,20,'retry-invalid'),connectionTimeoutMs:integer(input.connectionTimeoutMs??1800000,60000,3600000,'timeout-invalid')};
}
export function failureCode(error){return error instanceof ServiceError?error.safeCode:error instanceof ConnectError?`transport-${error.code}`:'stream-validation-failed';}
export function acquireWriterLock(db){
 const path=`${db}.stream.lock`,nonce=randomUUID();let fd;
 try{fd=openSync(path,'wx',0o600);}catch{fail('writer-lock-held');}
 try{writeFileSync(fd,JSON.stringify({version:1,pid:process.pid,hostname:hostname(),nonce,createdAt:Date.now()}));fsyncSync(fd);}finally{closeSync(fd);}
 const assertOwned=()=>{let held;try{held=JSON.parse(readFileSync(path,'utf8'));}catch{fail('writer-lock-lost');}if(held.nonce!==nonce)fail('writer-lock-lost');};
 return {assertOwned,release(){assertOwned();unlinkSync(path);}};
}

/** Reserve disk for independent keeper/proof journals on a shared volume. */
export function storageGuard(db,minFreeBytes=268435456,stat=statfsSync){
 return ()=>{let fs;try{fs=stat(dirname(db),{bigint:true});}catch{fail('storage-capacity-unavailable');}
  if(BigInt(fs.bavail)*BigInt(fs.bsize)<BigInt(minFreeBytes))fail('storage-capacity-low');
 };
}

export function consumeBoundedResponse(response,registry,sink,stop){
 if(stop&&response.message?.case==='blockScopedData'&&BigInt(response.message.value.clock.number)>=BigInt(stop))fail('block-outside-bounded-range');
 return consumeResponse(response,registry,sink);
}

/** Injected transport in tests exercises retry, cursor replay and fatal boundaries. */
export async function supervise({sink,open,consume,signal,report=()=>{},wait=(ms,signal)=>delay(ms,undefined,{signal}),assertOwned=()=>{},checkStorage=()=>{},stop,
 retryBaseMs=1000,retryMaxMs=30000,maxConsecutiveFailures=8}){
 let failures=0,highest=sink.checkpoint()?.number??-1,untilStorageCheck=0;
 while(!signal.aborted){
  assertOwned();checkStorage();untilStorageCheck=0;const before=sink.checkpoint();
  if(stop&&before?.number===stop-1){report({status:'bounded-complete',head:before.number,...sink.historyStatus()});return;}
  if(stop&&before?.number>=stop)fail('checkpoint-outside-bounded-range');
  const connection=new AbortController(),connectionSignal=AbortSignal.any([signal,connection.signal]);let boundedComplete=false;
  try{
   for await(const response of open(before?.providerCursor,connectionSignal)){
    if(signal.aborted)return;assertOwned();if(untilStorageCheck--<=0){checkStorage();untilStorageCheck=99;}
    // A validation/undo failure is never classified as a transport retry.
    try{consume(response);}catch{fail('stream-validation-failed');}
    const current=sink.checkpoint();
    if(current&&current.number>highest){highest=current.number;failures=0;}
    if(stop&&current?.number>=stop)fail('block-outside-bounded-range');
    if(stop&&current?.number===stop-1){
     // The provider may keep the stream open after the requested final block.
     // Cancel before iterator.return(), so cleanup never awaits another envelope.
     boundedComplete=true;connection.abort();report({status:'bounded-complete',...sink.historyStatus()});return;
    }
   }
   if(signal.aborted)return;
   if(stop&&sink.checkpoint()?.number===stop-1){report({status:'bounded-complete',...sink.historyStatus()});return;}
   throw new ServiceError('stream-ended-early');
  }catch(error){
   connection.abort();
   if(boundedComplete&&error instanceof ConnectError&&error.code===1)return;
   if(signal.aborted)return;
   const retry=error instanceof ConnectError&&RETRY_CODES.has(error.code)||error instanceof ServiceError&&error.safeCode==='stream-ended-early';
   if(!retry)throw error;
   failures++;
   if(failures>=maxConsecutiveFailures)fail('retry-budget-exhausted');
   const retryMs=Math.min(retryMaxMs,retryBaseMs*2**Math.min(failures-1,20));
   report({status:'retrying',code:failureCode(error),attempt:failures,retryMs,...sink.historyStatus()});
   try{await wait(retryMs,signal);}catch(error){if(signal.aborted)return;throw error;}
  }finally{connection.abort();}
 }
}

export async function main(){
 const {values}=parseArgs({options:{stop:{type:'string'},'validate-only':{type:'boolean',default:false}}});
 const path=process.env.GRAPH_STREAM_CONFIG;
 if(!path||!isAbsolute(path)||statSync(path).size>65536)fail('config-path-invalid');
 const config=validateConfig(JSON.parse(readFileSync(path,'utf8')));
 const bytes=readFileSync(config.packagePath),packageHash=`0x${createHash('sha256').update(bytes).digest('hex')}`;
 if(packageHash!==config.packageHash)fail('package-hash-mismatch');
 const pkg=createSubstream(bytes),identity=configurePackage(pkg,config.network,config.pools),registry=createRegistry(pkg);
 if(identity.chainId!==11155111)fail('package-network-mismatch');
 const module=pkg.modules.modules.find(m=>m.name==='map_pool_context');
 if(BigInt(config.start)<module.initialBlock)fail('start-before-package-history');
 const sinkConfig={...identity,poolIds:config.pools,packageHash,startBlock:config.start,initialization:config.initialization,finalBlocksOnly:true};
 // Validate before making a directory, taking a writer lock, or reading credentials.
 const validationStore=new HistoryStore();try{new SubstreamsHistorySink(validationStore,sinkConfig);}finally{validationStore.close();}
 const stop=values.stop?integer(values.stop,config.start+1,Number.MAX_SAFE_INTEGER,'stop-invalid'):undefined;
 const report=data=>process.stdout.write(`${JSON.stringify({observedAt:Date.now(),...data})}\n`);
 if(values['validate-only']){report({status:'validated-offline',network:config.network,start:config.start,pools:config.pools,packageHash});return;}
 mkdirSync(dirname(config.db),{recursive:true,mode:0o700});
 const checkStorage=storageGuard(config.db,config.minFreeBytes);checkStorage();
 const lock=acquireWriterLock(config.db);let store,heartbeat;
 const controller=new AbortController(),shutdown=()=>controller.abort();
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
 try{
  store=new HistoryStore(config.db);const sink=new SubstreamsHistorySink(store,sinkConfig),head=sink.checkpoint();
  if(stop&&(stop-(head?.number+1||config.start)>10000||head?.number>=stop))fail('bounded-range-invalid');
  const token=process.env.SUBSTREAMS_API_TOKEN;if(typeof token!=='string'||!token.trim())fail('stream-token-missing');
  const transport=createConnectTransport({baseUrl:ENDPOINT,httpVersion:'1.1',useBinaryFormat:true,interceptors:[createAuthInterceptor(token)],jsonOptions:{typeRegistry:registry}});
  const open=(startCursor,signal)=>streamBlocks(transport,createRequest({substreamPackage:pkg,outputModule:'map_pool_context',productionMode:true,startBlockNum:BigInt(config.start),stopBlockNum:BigInt(stop??0),startCursor,finalBlocksOnly:true}),{signal,timeoutMs:config.connectionTimeoutMs});
  report({status:'starting',...sink.historyStatus(),packageHash});
  heartbeat=setInterval(()=>report({status:'retained-history',...sink.historyStatus()}),30000);heartbeat.unref();
  await supervise({sink,open,consume:response=>consumeBoundedResponse(response,registry,sink,stop),checkStorage,signal:controller.signal,report,assertOwned:lock.assertOwned,stop,...config});
  report({status:controller.signal.aborted?'stopped':'completed',...sink.historyStatus()});
 }finally{
  clearInterval(heartbeat);process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);store?.close();lock.release();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main().catch(error=>{process.stderr.write(`${JSON.stringify({status:'failed',code:failureCode(error),checkpointRetained:true})}\n`);process.exitCode=1;});}
