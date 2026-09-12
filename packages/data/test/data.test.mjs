import {test} from 'node:test';import assert from 'node:assert/strict';import {HistoryStore} from '../src/store.mjs';import {composeAnalysis,querySubgraph} from '../src/compose.mjs';
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
test('atomic cursor, idempotence and explicit reorg rollback',()=>{const store=new HistoryStore();
const block={number:1,hash:hash(1),parentHash:hash(0),cursor:'cursor1',swaps:[{chainId:1,manager:'A',pool:'B',logIndex:0,tick:0}]};store.apply(block);store.apply(block);
assert.throws(()=>store.apply({...block,number:2,hash:hash(2),parentHash:hash(9)}));
assert.throws(()=>store.apply({...block,number:2,hash:hash(2),parentHash:hash(1),swaps:[{...block.swaps[0],tick:999999}]}));assert.equal(store.head().number,1);
store.apply({...block,number:2,hash:hash(2),parentHash:hash(1),cursor:'cursor2'});store.undo(1,hash(1));assert.equal(store.head().cursor,'cursor1');assert.throws(()=>store.undo(0,hash(0)));store.close();});
const input=()=>({series:{id:'1',chainId:1,poolManager:'0xA',poolId:'0xB',activationBlock:1,endBlock:10,tickLower:-10,tickUpper:10,originalSupply:'100'},stream:{chainId:1,poolManager:'0xa',poolId:'0xb',fromBlock:1,toBlock:5,blockHash:hash(5),package:'pinned package',cursor:'cursor',samples:[{block:1,logIndex:0,tick:0}]},subgraph:{block:5,hash:hash(5),deployment:'pinned deployment',hasIndexingErrors:false},chainHead:40,price:10n,quantity:20n});
test('joined analysis binds source identity, freshness and gross whole-period break-even',()=>{const i=input();const r=composeAnalysis(i);assert.equal(r.grossBreakEvenUSDC,'50');assert.equal(r.occupancyBps,10000);assert.equal(r.stale,true);assert.equal(r.allocationAuthority,'contract-only');i.stream.blockHash=hash(4);assert.throws(()=>composeAnalysis(i));i.stream.blockHash=hash(5);i.stream.chainId=2;assert.throws(()=>composeAnalysis(i));});
test('Graph collection queries pin both metadata and entities by the expected source hash',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{const request=JSON.parse(options.body);calls.push(request);return {ok:true,json:async()=>({data:{_meta:{block:{number:5,hash:request.variables.block!==undefined?null:hash(5)},deployment:'expected',hasIndexingErrors:false},series_collection:[]}})};};
 const result=await querySubgraph({url:'https://example.invalid',deployment:'expected',block:5,hash:hash(5),fetchImpl});
 assert.equal(result.meta.hash,hash(5));assert.deepEqual(result.series,[]);assert.deepEqual(calls[0].variables,{hash:hash(5)});
 assert.match(calls[0].query,/_meta\(block: \{hash: \$hash\}\)/);assert.match(calls[0].query,/series_collection\(first: 100, block: \{hash: \$hash\}/);
});
test('Graph errors, deployment substitutions and mismatched block metadata fail closed',async()=>{
 const good={block:{number:5,hash:hash(5)},deployment:'expected',hasIndexingErrors:false};
 const args={url:'https://example.invalid',deployment:'expected',block:5,hash:hash(5)};
 for(const change of [{deployment:'wrong'},{block:{number:6,hash:hash(5)}},{block:{number:5,hash:hash(6)}},{block:{number:5,hash:null}},{hasIndexingErrors:true}]){
  const fetchImpl=async()=>({ok:true,json:async()=>({data:{_meta:{...good,...change},series_collection:[]}})});
  await assert.rejects(querySubgraph({...args,fetchImpl}),/Unexpected subgraph deployment or block/);
 }
 await assert.rejects(querySubgraph({...args,fetchImpl:async()=>({ok:true,json:async()=>({errors:[{message:'private provider detail'}]})})}),/^Error: Subgraph query failed$/);
 await assert.rejects(querySubgraph({...args,hash:undefined,fetchImpl:()=>assert.fail('invalid selection must not reach provider')}),/source block and hash required/);
});
test('reorg undo cursor is persisted atomically with removed blocks',()=>{const s=new HistoryStore();s.apply({number:1,hash:hash(1),cursor:'before',swaps:[]});s.apply({number:2,hash:hash(2),parentHash:hash(1),cursor:'head',swaps:[]});assert.throws(()=>s.undo(1,hash(1),''));assert.equal(s.head().number,2);s.undo(1,hash(1),'provider-undo');assert.equal(s.head().cursor,'provider-undo');assert.equal(s.head().number,1);s.close();});

test('analysis bounds retained samples and excludes post-endpoint activity before materializing history',()=>{
 const store=new HistoryStore();
 for(let n=10;n<=14;n++)store.apply({number:n,hash:'0x'+String(n).padStart(64,'0'),parentHash:'0x'+String(n-1).padStart(64,'0'),cursor:'cursor',swaps:[{chainId:1,manager:'0xa',pool:'0xb',logIndex:0,tick:n}]});
 const query={chainId:1,manager:'0xa',pool:'0xb',fromBlock:10};
 assert.throws(()=>store.samples({...query,toBlock:14,maxSamples:3}),/bounded analysis/);
 const snapshot=store.snapshotSamples({...query,number:14,toBlock:11,maxSamples:3});assert.equal(snapshot.block.number,14);assert.deepEqual(snapshot.samples.map(s=>s.block),[10,11]);
 assert(store.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='swaps_pool_block'").get());store.close();
});
