import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {HistoryStore} from '../src/store.mjs';
import {analysisHandler} from '../src/http.mjs';
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
async function setup(t,{seed=true}={}){
 const directory=mkdtempSync(join(tmpdir(),'usufruct-analysis-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const config={rpcUrl:'https://rpc.invalid/private',subgraphUrl:'https://graph.invalid/private',deployment:'pinned',database:join(directory,'history.sqlite'),packageIdentity:hash(500),chainId:11155111,graphApiKey:'private-api-token'};
 function populate(){const db=new HistoryStore(config.database);for(let n=10;n<=13;n++)db.apply({number:n,hash:hash(n),parentHash:hash(n-1),cursor:JSON.stringify({version:1,identity:{chainId:11155111,poolManager:'0xa',poolIds:['0xb'],packageHash:hash(500)},providerCursor:'private-provider-cursor',finalBlockHeight:13}),swaps:n===10?[{chainId:11155111,manager:'0xa',pool:'0xb',logIndex:1,tick:0}]:[]});db.close();}
 if(seed)populate();
 const state={canonical:hash(13),chainId:11155111,requests:0,fail:false};
 const client={getChainId:async()=>state.chainId,getBlockNumber:async()=>13n,getBlock:async()=>{state.onCanonical?.();return {hash:state.canonical};}};
 const fetchImpl=async(_url,options)=>{state.requests++;assert.equal(options.headers.Authorization,'Bearer private-api-token');if(state.fail)throw new Error('https://graph.invalid/private private-api-token');return Response.json({data:{_meta:{block:{number:13,hash:hash(13)},deployment:'pinned',hasIndexingErrors:false},series:{id:'1',chainId:'11155111',poolManager:'0xa',poolId:'0xb',activationBlock:'10',endBlock:'30',tickLower:-10,tickUpper:10,originalSupply:'100',closed:false,redeemedQuantity:'0'}}});};
 const server=createServer(analysisHandler(config,{client,fetchImpl}));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}/api/analysis`;
 return {config,state,populate,url,request:()=>fetch(url+'?seriesId=1&quantity=10&price=20')};
}
test('HTTP serves canonical joined provenance without credentials or resume cursor',async t=>{
 const {request}=await setup(t);const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.equal(body.coverageBps,10000);assert.equal(body.sourceHash,hash(13));assert.equal(body.grossBreakEvenUSDC,'200');assert.equal(body.allocationAuthority,'contract-only');assert.equal(body.substreamsCursor,undefined);assert(!JSON.stringify(body).includes('private'));
});
test('missing database is not created by HTTP and later ingestion recovers without API restart',async t=>{
 const {request,config,populate}=await setup(t,{seed:false});assert.equal((await request()).status,503);assert.equal(existsSync(config.database),false);populate();assert.equal((await request()).status,200);
 const readOnly=new HistoryStore(config.database,{readOnly:true});assert.throws(()=>readOnly.db.exec('DELETE FROM blocks'),/readonly/);readOnly.close();
});
test('orphaned common hashes and wrong RPC chain cannot become public buyer evidence',async t=>{
 const {request,state}=await setup(t);state.canonical=hash(113);assert.equal((await request()).status,503);state.canonical=hash(13);state.chainId=1;assert.equal((await request()).status,503);
 state.chainId=11155111;state.fail=true;const result=await request(),body=await result.text();assert.equal(result.status,503);assert(!body.includes('private-api-token'));assert(!body.includes('https://'));
});
test('ambiguous, oversized and mutating input never reaches the Graph provider',async t=>{
 const {url,state}=await setup(t);for(const params of ['seriesId=1&quantity=0&price=20','seriesId=1&quantity=1&price=20&seriesId=2','seriesId=1&quantity=1&price=20&rpc=evil','seriesId=0&quantity=1&price=20','seriesId=1&quantity=1&price='+String(1n<<256n),'seriesId=1&quantity=1&price=-1'])assert.equal((await fetch(url+'?'+params)).status,400,params);
 assert.equal((await fetch(url+'?seriesId=1&quantity=1&price=1',{method:'POST'})).status,404);assert.equal(state.requests,0);
});

test('undo while the canonical RPC read awaits cannot publish a removed history snapshot',async t=>{
 const {request,state,config}=await setup(t);
 state.onCanonical=()=>{const writer=new HistoryStore(config.database);writer.undo(12,hash(12));writer.close();};
 assert.equal((await request()).status,503);
});
