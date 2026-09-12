import {test} from 'node:test';import assert from 'node:assert/strict';
import {HistoryStore} from '../src/store.mjs';import {loadBuyerAnalysis} from '../src/buyer-analysis.mjs';
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
const cursor=(value,chainId)=>JSON.stringify({version:1,identity:{chainId,poolManager:'0xa',poolIds:['0xb'],packageHash:hash(500)},providerCursor:value,finalBlockHeight:9});
test('buyer query joins persisted samples with Graph BigInt strings at last common block',async()=>{
 const store=new HistoryStore();for(let n=10;n<=15;n++)store.apply({number:n,hash:hash(n),parentHash:hash(n-1),cursor:cursor(`cursor${n}`,11155111),swaps:n===10?[{chainId:11155111,manager:'0xa',pool:'0xb',logIndex:1,tick:0}]:[]});
 const calls=[];let substituted=false;const fetchImpl=async(url,options)=>{const req=JSON.parse(options.body);calls.push(req);const block=req.variables.hash?Number(BigInt(req.variables.hash)):13;return {ok:true,json:async()=>({data:{_meta:{block:{number:block,hash:req.variables.block!==undefined?null:hash(substituted?12:block)},deployment:'pinned',hasIndexingErrors:false},series:{id:'101',chainId:'11155111',poolManager:'0xa',poolId:'0xb',activationBlock:'10',endBlock:'30',tickLower:-10,tickUpper:10,originalSupply:'100000000000000000000',closed:false,redeemedQuantity:'0'}}})};};
 const args={store,url:'https://example.invalid',deployment:'pinned',seriesId:'101',chainId:11155111,chainHead:20,packageIdentity:hash(500),quantity:10n**18n,price:1_000_000n,fetchImpl};
 const result=await loadBuyerAnalysis(args);assert.equal(result.sourceBlock,13);assert.equal(result.occupancyBps,10000);assert.equal(result.grossBreakEvenUSDC,'100000000');assert.equal(calls[1].variables.id,'101');assert.equal(calls[1].variables.hash,hash(13));assert.match(calls[1].query,/series\(id: \$id, block: \{hash: \$hash\}\)/);assert.equal(result.substreamsCursor,'cursor13');
 await assert.rejects(loadBuyerAnalysis({...args,packageIdentity:hash(501)}),/identity/);
 const valid=store.block(13).cursor;
 for(const bad of ['invalid JSON',...Object.entries({chainId:2,poolManager:'0xc',poolIds:['0xc']}).map(([key,value])=>{const c=JSON.parse(valid);c.identity[key]=value;return JSON.stringify(c);})]){store.db.prepare('UPDATE blocks SET cursor=? WHERE number=13').run(bad);await assert.rejects(loadBuyerAnalysis(args),/identity/);}
 store.db.prepare('UPDATE blocks SET cursor=? WHERE number=13').run(valid);
 const anchored=JSON.parse(valid);anchored.identity.history={startBlock:10,initialization:[{pool:'0xb',kind:'swap',block:11}]};
 store.db.prepare('UPDATE blocks SET cursor=? WHERE number=13').run(JSON.stringify(anchored));
 await assert.rejects(loadBuyerAnalysis(args),/anchor must precede/);
 store.db.prepare('UPDATE blocks SET cursor=? WHERE number=13').run(valid);
 substituted=true;await assert.rejects(loadBuyerAnalysis(args),/block and hash/);store.close();
});
test('reorg during the Graph request cannot pair replacement ticks with an old block hash',async()=>{
 const store=new HistoryStore();for(let n=10;n<=13;n++)store.apply({number:n,hash:hash(n),parentHash:hash(n-1),cursor:cursor(`old${n}`,1),swaps:n===10?[{chainId:1,manager:'0xa',pool:'0xb',logIndex:0,tick:0}]:[]});
 const fetchImpl=async(url,options)=>{const req=JSON.parse(options.body);if(req.variables.hash||req.variables.block){store.undo(12,hash(12));store.apply({number:13,hash:hash(113),parentHash:hash(12),cursor:cursor('new13',1),swaps:[{chainId:1,manager:'0xa',pool:'0xb',logIndex:0,tick:100}]});}return {ok:true,json:async()=>({data:{_meta:{block:{number:13,hash:req.variables.block!==undefined?null:hash(13)},deployment:'pinned',hasIndexingErrors:false},series:{id:'1',chainId:'1',poolManager:'0xa',poolId:'0xb',activationBlock:'10',endBlock:'30',tickLower:-10,tickUpper:10,originalSupply:'100',closed:false,redeemedQuantity:'0'}}})};};
 await assert.rejects(loadBuyerAnalysis({store,url:'https://example.invalid',deployment:'pinned',seriesId:'1',chainId:1,chainHead:13,packageIdentity:hash(500),quantity:1n,price:1n,fetchImpl}),/block and hash/);store.close();
});

test('buyer hash selection rejects changed metadata, wrong chains and unavailable history',async()=>{
 const store=new HistoryStore();for(let n=10;n<=13;n++)store.apply({number:n,hash:hash(n),parentHash:hash(n-1),cursor:cursor(`cursor${n}`,1),swaps:n===10?[{chainId:1,manager:'0xa',pool:'0xb',logIndex:0,tick:0}]:[]});
 const goodMeta={block:{number:13,hash:hash(13)},deployment:'pinned',hasIndexingErrors:false};
 const goodSeries={id:'1',chainId:'1',poolManager:'0xa',poolId:'0xb',activationBlock:'10',endBlock:'30',tickLower:-10,tickUpper:10,originalSupply:'100',closed:false,redeemedQuantity:'0'};
 const args={store,url:'https://example.invalid',deployment:'pinned',seriesId:'1',chainId:1,chainHead:13,packageIdentity:hash(500),quantity:1n,price:1n};
 for(const [change,pattern] of [
  [{_meta:{...goodMeta,block:{number:12,hash:hash(13)}}},/block and hash/],
  [{_meta:{...goodMeta,block:{number:13,hash:null}}},/hash or indexing/],
  [{_meta:{...goodMeta,deployment:'substituted'}},/deployment/],
  [{_meta:{...goodMeta,hasIndexingErrors:true}},/indexing/],
  [{series:{...goodSeries,chainId:'2'}},/Configured chain/],
  [{series:{...goodSeries,closed:true}},/Closed or fully redeemed/],
  [{series:null},/Series unavailable/]
 ]){
  const fetchImpl=async(url,options)=>{const req=JSON.parse(options.body);return {ok:true,json:async()=>({data:{_meta:goodMeta,series:goodSeries,...(req.variables.hash?change:{})}})};};
  await assert.rejects(loadBuyerAnalysis({...args,fetchImpl}),pattern);
 }
 const fetchImpl=async()=>({ok:true,json:async()=>({data:{_meta:goodMeta}})});
 await assert.rejects(loadBuyerAnalysis({...args,chainHead:9,fetchImpl}),/Common source block not retained/);store.close();
});
