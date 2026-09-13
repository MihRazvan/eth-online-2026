import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {assessOperations,operationsTarget,inspectChain,verify} from './verify-operations.mjs';
const address=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const now=1800000000000,signer=address(9),code='0x6000';
const deployment={chainId:11155111,fundingCommitmentVersion:1,feeStrip:address(1),verifier:address(2),checkpoints:address(3)};
const evidence={contracts:Object.fromEntries(['feeStrip','verifier','checkpoints'].map(name=>[name,{address:deployment[name],observedRuntimeHash:keccak256(code)}]))};
function fixture(){return {schemaVersion:1,allocationAuthority:'contract-only',chainId:'11155111',feeStrip:deployment.feeStrip,observedAt:now,readyForNewSales:true,checks:Object.fromEntries(['protocol','keeper','retention','replication'].map(name=>[name,{ready:true,code:'READY'}]))};}
function client(){return {getChainId:async()=>11155111,getBlock:async()=>({number:100n,hash:hash(100),timestamp:BigInt(now/1000)}),getBytecode:async()=>code,getBalance:async()=>10000000000000000n,getTransactionCount:async()=>0,readContract:async()=>1n};}
const args=()=>({client:client(),deployment,evidence,signer,now,origin:'https://public.example',fetcher:async()=>Response.json(fixture())});

test('readiness requires fresh exact deployment and all component checks, not just readyForNewSales',()=>{
 assert.equal(assessOperations(fixture(),{deployment,now}).ready,true);
 for(const mutate of [v=>v.checks.keeper.ready=false,v=>v.checks.retention.code='wrong',v=>v.checks.replication=undefined,v=>v.observedAt-=60001,v=>v.observedAt+=5001,v=>v.feeStrip=address(20),v=>v.chainId='1',v=>v.allocationAuthority='server',v=>v.readyForNewSales='true']){
  const value=fixture();mutate(value);assert.equal(assessOperations(value,{deployment,now}).ready,false);
 }
});
test('gateway credentials are sent only for explicit direct checks with clean HTTPS origins',()=>{
 const token='private-token'.repeat(4);
 assert.deepEqual(operationsTarget('https://public.example',{token}).options.headers,{});
 assert.equal(operationsTarget('https://private.example',{direct:true,token}).options.headers.authorization,`Bearer ${token}`);
 for(const origin of ['http://public.example','https://name:password@public.example','https://public.example/path','https://public.example/?token=secret'])assert.throws(()=>operationsTarget(origin));
 assert.throws(()=>operationsTarget('https://private.example',{direct:true}));
});
test('chain readback fails on changed code, stale head, wrong chain, manifest pins or reorg',async()=>{
 for(const change of [c=>c.getBytecode=async()=> '0x6001',c=>c.getChainId=async()=>1,c=>c.getBlock=async()=>({number:100n,hash:hash(100),timestamp:BigInt(now/1000-121)}),c=>c.getBlock=async({blockNumber})=>({number:100n,hash:hash(blockNumber?101:100),timestamp:BigInt(now/1000)})]){
  const c=client();change(c);await assert.rejects(inspectChain({client:c,deployment,evidence,signer,now}));
 }
 await assert.rejects(inspectChain({client:client(),deployment:{...deployment,feeStrip:address(4)},evidence,signer,now}));
});
test('HTTP unavailable, oversized responses and provider diagnostics never leak or certify readiness',async()=>{
 for(const fetcher of [async()=>new Response('private-token',{status:503}),async()=>{throw new Error('https://rpc/private-token');},async()=>new Response('x'.repeat(32769),{headers:{'content-type':'application/json'}})]){
  const result=await verify({...args(),fetcher});assert.equal(result.ready,false);assert(!JSON.stringify(result).includes('private-token'));
 }
 const result=await verify({...args(),client:{...client(),getBalance:async()=>{throw new Error('secret-key');}}});
 assert.equal(result.ready,false);assert(!JSON.stringify(result).includes('secret-key'));
});
test('snapshot reports pending nonce or zero balance without implying hosted acceptance',async()=>{
 const good=await verify(args());assert.equal(good.ready,true);assert.equal(good.chain.seriesEverActivated,'0');assert.match(good.scope,/not checkpoint/);
 for(const c of [{...client(),getBalance:async()=>0n},{...client(),getTransactionCount:async({blockTag})=>blockTag==='pending'?1:0}])assert.equal((await verify({...args(),client:c})).ready,false);
});
