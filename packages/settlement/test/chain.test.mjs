import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,zeroHash} from 'viem';
import {normalizeConfig,observe,discover,endpointObservation} from '../src/chain.mjs';
const hash=x=>'0x'+x.repeat(64),address=x=>'0x'+x.repeat(40);
const config=normalizeConfig({chainId:31337,genesisHash:hash('1'),feeStrip:address('1'),verifier:address('2'),checkpoints:address('3'),poolManager:address('4'),usdc:address('5'),managerCodeHash:keccak256('0x6000'),codeHashes:Object.fromEntries(['feeStrip','verifier','checkpoints','poolManager'].map(k=>[k,keccak256('0x6000')])),rpcUrls:['http://127.0.0.1:8547']});
const observed={head:{number:100n,hash:hash('a')},finalized:{number:90n,hash:hash('b')}};
const series=id=>({tokenId:id,claim:address('6'),quantity:10000n,liquidity:100n,activationBlock:10n,endBlock:101n,tickLower:-60,tickUpper:60,baselineX128:0n,key:{currency0:config.usdc,currency1:address('7'),fee:3000,tickSpacing:60,hooks:address('0')},closed:false,allocated:false,captured:false});
test('discovery resumes past1000series, preserves prior records and reports incomplete pages',async()=>{
 const client={getBlock:async({blockNumber})=>({number:blockNumber,hash:blockNumber===100n?hash('a'):blockNumber===90n?hash('b'):hash('c')}),readContract:async({functionName,args})=>functionName==='nextSeriesId'?2002n:functionName==='series'?series(args[0]):[hash('1'),hash('2'),hash('3'),hash('4')]};
 const first=await discover(client,config,observed,{pageSize:1000});assert.equal(first.terms.length,1000);assert.equal(first.complete,false);
 const known=first.terms.map(terms=>({series_id:terms.seriesId,terms,finalized:0,lifecycle:terms.lifecycle}));
 const second=await discover(client,config,observed,{known,pageSize:1000});assert.equal(second.terms.length,2000);assert.equal(second.complete,false);
 const third=await discover(client,config,observed,{known:second.terms.map(terms=>({series_id:terms.seriesId,terms,finalized:0,lifecycle:terms.lifecycle})),pageSize:1000});assert.equal(third.terms.length,2001);assert.equal(third.complete,true);assert.equal(new Set(third.terms.map(t=>t.seriesId)).size,2001);
});
test('discovery rejects a changed frozen block without publishing a partial result',async()=>{
 const client={getBlock:async({blockNumber})=>({number:blockNumber,hash:hash('f')}),readContract:async({functionName})=>functionName==='nextSeriesId'?1n:undefined};
 await assert.rejects(discover(client,config,observed),/DISCOVERY_REORG/);
});
test('observation binds network, runtime code and immutable relationships',async()=>{
 const client={getChainId:async()=>31337,getBytecode:async()=>'0x6000',getBlock:async({blockNumber,blockTag})=>blockNumber===0n?{number:0n,hash:config.genesisHash}:blockTag==='latest'?observed.head:observed.finalized,
  readContract:async({address:a,functionName})=>({verifier:config.verifier,poolManager:config.poolManager,usdc:config.usdc,chainId:31337n,managerCodeHash:config.managerCodeHash,checkpoints:config.checkpoints}[functionName])};
 assert.deepEqual(await observe(client,config),observed);
 await assert.rejects(observe({...client,getChainId:async()=>1},config),/NETWORK_IDENTITY_CHANGED/);
 await assert.rejects(observe({...client,getBytecode:async()=>'0x6001'},config),/DEPLOYMENT_CODE_CHANGED/);
 await assert.rejects(observe({...client,readContract:async()=>address('f')},config),/DEPLOYMENT_BINDINGS_CHANGED/);
});
test('checkpoint observation reads permanent mapping and distinguishes verified growth cache',async()=>{
 const calls=[],job={terms:{...series(1n),endBlock:'80',activationBlock:'10',activationHash:hash('c'),poolId:hash('d'),usdcIsCurrency0:true}};
 const client={getBlock:async({blockNumber})=>({number:blockNumber,hash:blockNumber===10n?hash('c'):hash('e')}),readContract:async({functionName})=>{calls.push(functionName);return functionName==='hashes'?zeroHash:[true,123n];}};
 const result=await endpointObservation(client,config,job,observed);assert.equal(result.checkpointHash,null);assert.equal(result.growthCached,true);assert.equal(result.finalized,true);assert.deepEqual(calls,['hashes','endpointGrowth']);
 await assert.rejects(endpointObservation({...client,readContract:async({functionName})=>functionName==='hashes'?hash('f'):[false,0n]},config,job,observed),/CHECKPOINT_CONFLICT/);
});

test('endpoint finality does not freeze an unfinalized allocation after its transaction reorgs out',async()=>{
 const prior={...series(1n),allocated:true,endBlock:80n};
 let allocated=true;
 const client={getBlock:async({blockNumber})=>({number:blockNumber,hash:blockNumber===100n?hash('a'):blockNumber===90n?hash('b'):hash('c')}),readContract:async({functionName})=>functionName==='nextSeriesId'?2n:functionName==='series'?{...prior,allocated}:[hash('1'),hash('2'),hash('3'),hash('4')]};
 const first=await discover(client,config,observed);assert.equal(first.terms[0].lifecycle,'allocated');
 allocated=false;
 const second=await discover(client,config,observed,{known:first.terms.map(terms=>({series_id:terms.seriesId,terms,finalized:1,lifecycle:'allocated'}))});
 assert.equal(second.terms[0].lifecycle,'active');
});
