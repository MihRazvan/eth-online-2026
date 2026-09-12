import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {HistoryStore} from '../src/store.mjs';import {SubstreamsHistorySink} from '../src/substreams.mjs';import {composeAnalysis} from '../src/compose.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0');
const config={chainId:11155111,poolManager:a(1),poolIds:[h(10),h(11)],packageHash:h(99),finalBlocksOnly:false};
const swap=(pool=h(10),logIndex=0,tick=0)=>({poolId:pool,logIndex,tick,transactionHash:h(900),amount0:'-999999999999999999999999999999',amount1:'1000000000000000000000000000000',liquidity:'100000000000000000',sqrtPriceX96:'79228162514264337593543950336',fee:3000});
const block=(number,swaps=[],extra={})=>({module:'map_pool_context',clock:{number:String(number),id:h(number)},providerCursor:`real-shaped-fixture-cursor-${number}`,finalBlockHeight:'99',output:{chainId:'11155111',poolManager:a(1),number:String(number),hash:h(number),parentHash:h(number-1),timestamp:'1234',swaps,allocationAuthority:'contract-only'},...extra});
test('persists actual provider cursor atomically, empty blocks and multiple-pool occupancy samples',()=>{const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,config);sink.applyBlock(block(100,[swap(),swap(h(11),1,120),swap(h(12),2,777)]));sink.applyBlock(block(101));assert.equal(store.head().number,101);assert.equal(sink.checkpoint().providerCursor,'real-shaped-fixture-cursor-101');assert.equal(sink.analysisStream({poolId:h(10),fromBlock:100}).samples[0].tick,0);assert.equal(sink.analysisStream({poolId:h(11),fromBlock:100}).samples[0].tick,120);store.close();});
test('restart, idempotent replay and explicit undo retain provider lastValidCursor',()=>{const dir=mkdtempSync(join(tmpdir(),'feestrip-stream-'));try{let store=new HistoryStore(join(dir,'history.db'));let sink=new SubstreamsHistorySink(store,config);sink.applyBlock(block(100,[swap()]));sink.applyBlock(block(101,[swap(h(10),0,200)]));store.close();store=new HistoryStore(join(dir,'history.db'));sink=new SubstreamsHistorySink(store,config);assert.equal(sink.checkpoint().number,101);sink.undo({number:100,hash:h(100),providerCursor:'provider-undo-cursor'});assert.equal(sink.checkpoint().providerCursor,'provider-undo-cursor');assert.equal(sink.analysisStream({poolId:h(10),fromBlock:100}).samples.length,1);sink.applyBlock(block(101));sink.applyBlock(block(101));assert.equal(sink.checkpoint().number,101);store.close();}finally{rmSync(dir,{recursive:true,force:true});}});
test('malformed amount/clock/duplicates/gaps never commit cursor or partial samples',()=>{const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,config);sink.applyBlock(block(100,[swap()]));const bads=[block(101,[{...swap(),amount0:1}]),block(101,[swap(),swap()]),block(101,[],{clock:{number:'100',id:h(101)}}),block(102),block(101,[],{providerCursor:''}),block(101,[],{partial:true})];for(const b of bads){assert.throws(()=>sink.applyBlock(b));assert.equal(sink.checkpoint().number,100);}store.close();});
test('chain/package/manager changes and rollback below finality fail closed',()=>{const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,config);sink.applyBlock(block(100,[swap()],{finalBlockHeight:'100'}));assert.throws(()=>new SubstreamsHistorySink(store,{...config,packageHash:h(98)}));assert.throws(()=>sink.undo({number:99,hash:h(99),providerCursor:'bad'}));const b=block(101);b.output.poolManager=a(9);assert.throws(()=>sink.applyBlock(b));assert.equal(sink.checkpoint().number,100);store.close();});
test('finalized-only sink refuses unfinalized blocks and initializations seed tick0',()=>{const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,{...config,finalBlocksOnly:true});assert.throws(()=>sink.applyBlock(block(100)));const b=block(100,[],{finalBlockHeight:'100'});b.output.initialized=[{poolId:h(10),transactionHash:h(900),currency0:a(2),currency1:a(3),hooks:a(0),fee:3000,tickSpacing:60,sqrtPriceX96:'79228162514264337593543950336'}];sink.applyBlock(b);assert.equal(sink.analysisStream({poolId:h(10),fromBlock:100}).samples[0].tick,0);store.close();});
test('sink output joins historical common block with independent Subgraph metadata',()=>{const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,config);sink.applyBlock(block(100,[swap()]));sink.applyBlock(block(101));const stream=sink.analysisStream({poolId:h(10),fromBlock:100,toBlock:100});const result=composeAnalysis({series:{id:'1',chainId:11155111,poolManager:a(1),poolId:h(10),activationBlock:100,endBlock:110,tickLower:-10,tickUpper:10,originalSupply:'100'},stream,subgraph:{block:100,hash:h(100),deployment:'deterministic-fixture',hasIndexingErrors:false},chainHead:101,quantity:10n,price:20n});assert.equal(result.grossBreakEvenUSDC,'200');assert.equal(result.occupancyBps,10000);assert.equal(result.allocationAuthority,'contract-only');store.close();});

test('idempotent block replay advances actual provider cursor and finality atomically',()=>{
 const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,config);
 sink.applyBlock(block(100,[swap()]));sink.applyBlock(block(101));
 sink.applyBlock(block(101,[],{providerCursor:'new-final-cursor',finalBlockHeight:'100'}));
 assert.equal(sink.checkpoint().providerCursor,'new-final-cursor');assert.equal(sink.checkpoint().finalBlockHeight,100);
 assert.throws(()=>sink.undo({number:99,hash:h(99),providerCursor:'invalid'}));
 assert.equal(sink.checkpoint().number,101);assert.equal(sink.analysisStream({poolId:h(10),fromBlock:100}).samples.length,1);
 assert.throws(()=>sink.applyBlock(block(101,[],{providerCursor:'',finalBlockHeight:'101'})));
 assert.equal(sink.checkpoint().providerCursor,'new-final-cursor');assert.equal(sink.checkpoint().finalBlockHeight,100);store.close();
});

const init=(pool=h(10),logIndex=0,t=0)=>({poolId:pool,logIndex,tick:t,transactionHash:h(900),currency0:a(2),currency1:a(3),hooks:a(0),fee:3000,tickSpacing:60,sqrtPriceX96:'79228162514264337593543950336'});
const anchored={...config,startBlock:100,initialization:{[h(10)]:{block:100,hash:h(100),logIndex:0,tick:0,transactionHash:h(900)},[h(11)]:{block:102,hash:h(102),logIndex:2,tick:123,transactionHash:h(900)}}};
const initializedBlock=(n,events,swaps=[])=>{const b=block(n,swaps);b.output.initialized=events;return b;};
test('initialized history requires actual exact RPC-anchored Initialize, not a mid-history swap seed',()=>{
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,anchored);
 for(const b of [block(101),block(100,[swap()]),initializedBlock(100,[init(h(10),1)]),initializedBlock(100,[{...init(),transactionHash:h(901)}]),initializedBlock(100,[init(h(10),0,1)]),initializedBlock(100,[init(),init(h(11),1,123)])]){assert.throws(()=>sink.applyBlock(b));assert.equal(store.head(),undefined);}
 sink.applyBlock(initializedBlock(100,[init()]));assert.deepEqual(sink.historyStatus(),{seeded:false,anchorKinds:['initialize'],pendingPools:1,startBlock:100,head:100});
 assert.throws(()=>sink.applyBlock(block(101,[swap(h(11))])));sink.applyBlock(block(101));
 assert.throws(()=>sink.applyBlock(block(102)));sink.applyBlock(initializedBlock(102,[init(h(11),2,123)]));assert.equal(sink.historyStatus().seeded,true);
 assert.throws(()=>sink.applyBlock(initializedBlock(103,[init(h(11),2,123)])));
 sink.undo({number:101,hash:h(101),providerCursor:'undo-before-second-initialization'});assert.equal(sink.historyStatus().pendingPools,1);
 sink.applyBlock(initializedBlock(102,[init(h(11),2,123)]));store.close();
});
test('anchor identity and retained seed survive restart; deleted or forged prefix fails closed',()=>{
 const dir=mkdtempSync(join(tmpdir(),'initialized-history-')),path=join(dir,'history.db');
 try{let store=new HistoryStore(path),sink=new SubstreamsHistorySink(store,anchored);sink.applyBlock(initializedBlock(100,[init()]));sink.applyBlock(block(101));sink.applyBlock(initializedBlock(102,[init(h(11),2,123)]));store.close();
 store=new HistoryStore(path);sink=new SubstreamsHistorySink(store,anchored);assert.equal(sink.historyStatus().seeded,true);
 assert.throws(()=>new SubstreamsHistorySink(store,{...anchored,initialization:{...anchored.initialization,[h(10)]:{...anchored.initialization[h(10)],tick:1}}}),/identity changed/);
 store.db.prepare('DELETE FROM swaps WHERE block=100').run();assert.throws(()=>new SubstreamsHistorySink(store,anchored),/anchor is not retained/);store.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
 const store=new HistoryStore();new SubstreamsHistorySink(store,config).applyBlock(block(100,[swap()]));assert.throws(()=>new SubstreamsHistorySink(store,anchored),/identity changed/);store.close();
});
test('all configured pools require anchors with the exact earliest start',()=>{
 for(const changes of [{startBlock:99},{initialization:{[h(10)]:anchored.initialization[h(10)]}},{initialization:{...anchored.initialization,[h(12)]:anchored.initialization[h(10)]}}]){const store=new HistoryStore();assert.throws(()=>new SubstreamsHistorySink(store,{...anchored,...changes}));store.close();}
});

test('actual Swap anchor seeds the earning window and preserves later same-block swaps',()=>{
 const cfg={...config,poolIds:[h(10)],startBlock:100,initialization:{[h(10)]:{kind:'swap',block:100,hash:h(100),logIndex:1,tick:10,transactionHash:h(900)}}};
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,cfg);
 assert.throws(()=>sink.applyBlock(initializedBlock(100,[init(h(10),1,10)])));
 assert.throws(()=>sink.applyBlock(block(100,[swap(h(10),1,11)])));
 sink.applyBlock(block(100,[swap(h(10),3,20),swap(h(10),1,10)]));sink.applyBlock(block(101));
 assert.equal(sink.historyStatus().seeded,true);assert.deepEqual(sink.historyStatus().anchorKinds,['swap']);
 assert.equal(sink.analysisStream({poolId:h(10),fromBlock:100}).samples[0].tick,20);
 assert.throws(()=>sink.analysisStream({poolId:h(10),fromBlock:99}),/precedes/);
 assert.equal(new SubstreamsHistorySink(store,cfg).checkpoint().number,101);
 store.db.prepare('DELETE FROM swaps WHERE block=100 AND logIndex=1').run();assert.throws(()=>new SubstreamsHistorySink(store,cfg),/anchor is not retained/);store.close();
});
test('multi-pool Swap anchors allow earlier activity but reject analysis before the selected pool anchor',()=>{
 const cfg={...anchored,initialization:{[h(10)]:{...anchored.initialization[h(10)],kind:'swap'},[h(11)]:{...anchored.initialization[h(11)],kind:'swap'}}};
 const store=new HistoryStore(),sink=new SubstreamsHistorySink(store,cfg);
 sink.applyBlock(block(100,[swap(h(10),0,0),swap(h(11),1,42)]));sink.applyBlock(block(101,[swap(h(11),0,43)]));sink.applyBlock(block(102,[swap(h(11),2,123)]));
 assert.equal(sink.historyStatus().seeded,true);assert.throws(()=>sink.analysisStream({poolId:h(11),fromBlock:100}),/precedes/);
 assert.equal(sink.analysisStream({poolId:h(11),fromBlock:102}).samples[0].tick,123);
 sink.undo({number:101,hash:h(101),providerCursor:'undo-swap-anchor'});assert.equal(sink.historyStatus().pendingPools,1);
 assert.throws(()=>sink.applyBlock(block(102)));sink.applyBlock(block(102,[swap(h(11),2,123)]));store.close();
});
