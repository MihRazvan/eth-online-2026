import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Any} from '@bufbuild/protobuf';import {createRegistry,createSubstream} from '@substreams/core';
import {Response,BlockScopedData,BlockUndoSignal,MapModuleOutput,Clock,BlockRef} from '@substreams/core/proto';
import {HistoryStore} from '../../data/src/store.mjs';import {SubstreamsHistorySink} from '../../data/src/substreams.mjs';import {consumeResponse,configurePackage} from './run.mjs';
const pkg=createSubstream(readFileSync(new URL('../feestrip-pool-context-v0.1.1.spkg',import.meta.url)));const registry=createRegistry(pkg);
const h=n=>'0x'+n.toString(16).padStart(2,'0').repeat(32),a=n=>'0x'+n.toString(16).padStart(2,'0').repeat(20);
const config={chainId:11155111,poolManager:a(1),poolIds:[h(10)],packageHash:h(99),finalBlocksOnly:false};
const upstream=registry.findMessage('uniswap.v4.Events');const context=registry.findMessage('feestrip.context.v1.PoolContextBlock');
function execute(events){const bytes=readFileSync(new URL('../target/wasm32-unknown-unknown/release/feestrip_context.wasm',import.meta.url));let instance,output;const module=new WebAssembly.Module(bytes);
 instance=new WebAssembly.Instance(module,{env:{output:(ptr,len)=>output=new Uint8Array(instance.exports.memory.buffer.slice(ptr,ptr+len)),skip_empty_output:()=>{},register_panic:()=>{throw new Error('WASM rejected input');}}});
 const input=b=>{const ptr=instance.exports.alloc(b.length);new Uint8Array(instance.exports.memory.buffer,ptr,b.length).set(b);return [ptr,b.length];};
 const params=new TextEncoder().encode(`chain_id=11155111&pool_manager=${a(1)}&pool_ids=${h(10)}`);const block=readFileSync(new URL('../target/fixture-block.bin',import.meta.url));
 instance.exports.map_pool_context(...input(params),...input(events.toBinary()),...input(block));assert.ok(output);return context.fromBinary(output);
}
function rpc(output){return new Response({message:{case:'blockScopedData',value:new BlockScopedData({clock:new Clock({number:100n,id:h(100)}),cursor:'provider-shaped-synthetic-cursor',finalBlockHeight:99n,output:new MapModuleOutput({name:'map_pool_context',mapOutput:Any.pack(output)})})}});}
test('real WASM ABI + upstream protobuf + official RPC envelope sinks actual typed output',()=>{
 const event={blockNumber:'100',contract:a(1),poolId:h(10),transactionHash:h(11),tick:'-120',amount0:'-999999999999999999999999',amount1:'888888888888888888888888',liquidity:'100000000000',sqrtPriceX96:'79228162514264337593543950336',fee:'3000'};
 const output=execute(upstream.fromJson({swapEvents:[event]}));assert.equal(output.toJson().swaps[0].amount0,event.amount0);assert.equal(output.toJson().swaps[0].logIndex,107);
 const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,config);const response=Response.fromBinary(rpc(output).toBinary());consumeResponse(response,registry,sink);assert.equal(sink.checkpoint().providerCursor,'provider-shaped-synthetic-cursor');assert.equal(sink.analysisStream({poolId:h(10),fromBlock:100}).samples[0].tick,-120);store.close();
});
test('WASM normalizes transaction-local log indices before sorting and sinking',()=>{
 const common={blockNumber:'100',contract:a(1),poolId:h(10),logIndex:0,amount0:'-100',amount1:'100',liquidity:'1000',sqrtPriceX96:'79228162514264337593543950336',fee:'3000'};
 const output=execute(upstream.fromJson({swapEvents:[{...common,transactionHash:h(12),tick:'-100'},{...common,transactionHash:h(11),tick:'-120'}]}));
 assert.deepEqual(output.toJson().swaps.map(e=>[e.transactionHash,e.logIndex]),[[h(11),107],[h(12),108]]);
 const store=new HistoryStore();try{const sink=new SubstreamsHistorySink(store,config);consumeResponse(rpc(output),registry,sink);assert.equal(store.db.prepare('SELECT count(*) AS n FROM swaps').get().n,2);assert.equal(sink.analysisStream({poolId:h(10),fromBlock:100}).samples[0].tick,-100);}finally{store.close();}
});
test('empty WASM output block preserves continuity; real protobuf partial fields rejected',()=>{
 const output=execute(upstream.fromJson({}));const store=new HistoryStore();const sink=new SubstreamsHistorySink(store,config);
 const response=rpc(output);const raw=response.message.value.toBinary();response.message.value=BlockScopedData.fromBinary(new Uint8Array([...raw,0x68,1]));
 assert.throws(()=>consumeResponse(response,registry,sink),/Partial/);assert.equal(store.head(),undefined);consumeResponse(rpc(output),registry,sink);assert.equal(sink.checkpoint().number,100);
 const undo=new Response({message:{case:'blockUndoSignal',value:new BlockUndoSignal({lastValidBlock:new BlockRef({number:100n,id:h(100)}),lastValidCursor:'actual-undo-field'})}});consumeResponse(Response.fromBinary(undo.toBinary()),registry,sink);assert.equal(sink.checkpoint().providerCursor,'actual-undo-field');store.close();
});
test('same reusable package configures canonical Sepolia and mainnet imported modules',()=>{for(const [network,chainId]of [['sepolia',11155111],['mainnet',1]]){const local=pkg.clone();const identity=configurePackage(local,network,[h(10),h(11)]);assert.equal(identity.chainId,chainId);const imported=local.modules.modules.find(m=>m.name==='v4:map_events');assert.match(imported.inputs[0].input.value.value,/pool_manager=0x/);assert.ok(local.modules.modules.find(m=>m.name==='map_pool_context').inputs[0].input.value.value.includes(`${h(10)},${h(11)}`));}});

// Exercises the retained published decoder itself; the block is explicitly synthetic and has no matching event topics.
test('published upstream WASM composes an empty block through the wrapper',()=>{
 const m=pkg.modules.modules.find(m=>m.name==='v4:map_events');const binary=pkg.modules.binaries[m.binaryIndex];
 let instance,output;instance=new WebAssembly.Instance(new WebAssembly.Module(binary.content),{
  env:{output:(ptr,len)=>output=new Uint8Array(instance.exports.memory.buffer.slice(ptr,ptr+len)),skip_empty_output:()=>{},register_panic:()=>{throw new Error('Upstream WASM rejected fixture');}},logger:{println:()=>{}}});
 const input=b=>{const ptr=instance.exports.alloc(b.length);new Uint8Array(instance.exports.memory.buffer,ptr,b.length).set(b);return [ptr,b.length];};
 const params=new TextEncoder().encode(`pool_manager=${a(1)}&position_manager=${a(2)}`);
 instance.exports[m.binaryEntrypoint](...input(params),...input(readFileSync(new URL('../target/fixture-block.bin',import.meta.url))));
 assert.ok(output);const decoded=upstream.fromBinary(output);assert.equal(decoded.swapEvents.length,0);
 const composed=execute(decoded);assert.equal(composed.number,100n);assert.equal(composed.swaps.length,0);assert.equal(composed.parentHash,h(99));
});
