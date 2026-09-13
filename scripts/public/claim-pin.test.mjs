import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,zeroAddress} from 'viem';
import {deriveClaimRuntime,claimDomainSeparator,verifyClaimPin} from './claim-pin.mjs';
import {LIMITS} from './test-plan.mjs';
const claim='0x'+'11'.repeat(20),feeStrip='0x'+'22'.repeat(20),hash='0x'+'33'.repeat(32);
// Synthetic compiler-shaped fixtures isolate immutable patching, not deployed-bytecode provenance.
function artifacts(){
 const metadata={compiler:{version:'0.8.26+commit.8a97fa7a'}};
 const ast=(names,start)=>({nodes:names.map((name,i)=>({nodeType:'VariableDeclaration',mutability:'immutable',id:start+i,name}))});
 return {claimArtifact:{metadata,ast:ast(['escrow','originalSupply'],4),deployedBytecode:{object:'0x60'+'00'.repeat(32*6)+'00',immutableReferences:{1:[{start:1,length:32}],2:[{start:33,length:32}],3:[{start:65,length:32}],4:[{start:97,length:32},{start:129,length:32}],5:[{start:161,length:32}]}}},erc20Artifact:{metadata,ast:ast(['decimals','INITIAL_CHAIN_ID','INITIAL_DOMAIN_SEPARATOR'],1)}};
}
test('runtime substitutes every named immutable, including both escrow references and claim-specific domain',()=>{
 const a=artifacts(),result=deriveClaimRuntime({...a,claim,feeStrip});assert.equal(result.runtimeHash,keccak256(result.runtime));assert.equal(result.domainSeparator,claimDomainSeparator(claim));
 const words=result.runtime.slice(4,-2).match(/.{64}/g);assert.equal(BigInt('0x'+words[0]),18n);assert.equal(BigInt('0x'+words[1]),11155111n);assert.equal('0x'+words[2],result.domainSeparator);assert.equal(BigInt('0x'+words[3]),BigInt(feeStrip));assert.equal(words[3],words[4]);assert.equal(BigInt('0x'+words[5]),LIMITS.originalQ);
 assert.notEqual(deriveClaimRuntime({...a,claim:feeStrip,feeStrip:claim}).runtimeHash,result.runtimeHash);
 assert.notEqual(deriveClaimRuntime({...a,claim,feeStrip,originalSupply:1n}).runtimeHash,result.runtimeHash);
});
test('wrong compiler, missing/unknown/overlapping immutable references and zero scope reject',()=>{
 const invoke=a=>deriveClaimRuntime({...a,claim,feeStrip});
 let a=artifacts();a.claimArtifact.metadata={compiler:{version:'0.8.30+commit.73712a01'}};assert.throws(()=>invoke(a),/Wrong FeeClaim compiler/);
 a=artifacts();delete a.claimArtifact.deployedBytecode.immutableReferences[5];assert.throws(()=>invoke(a),/Missing immutable/);
 a=artifacts();a.claimArtifact.ast.nodes[0].name='attacker';assert.throws(()=>invoke(a),/Unknown immutable/);
 a=artifacts();a.claimArtifact.deployedBytecode.immutableReferences[5][0].start=1;assert.throws(()=>invoke(a),/Overlapping/);
 assert.throws(()=>deriveClaimRuntime({...artifacts(),claim:zeroAddress,feeStrip}),/nonzero address/);
});
function fixture(){
 const a=artifacts(),expected=deriveClaimRuntime({...a,claim,feeStrip}),code='0x6000';
 const state={claimCode:expected.runtime,originalSupply:LIMITS.originalQ,escrow:feeStrip,canonical:hash};
 const client={getChainId:async()=>11155111,getBlock:async({blockNumber})=>blockNumber===0n?{hash:LIMITS.genesisHash}:{number:100n,hash:blockNumber===100n?state.canonical:hash,timestamp:1000n},
  getBytecode:async({address})=>address.toLowerCase()===feeStrip?code:state.claimCode,
  readContract:async({functionName})=>({claimToken:claim,escrow:state.escrow,originalSupply:state.originalSupply,decimals:18,name:'FeeStrip USDC Fee Claim',DOMAIN_SEPARATOR:expected.domainSeparator,totalSupply:LIMITS.originalQ}[functionName])};
 return {state,args:{client,seriesId:1n,deployment:{chainId:11155111,feeStrip},evidence:{contracts:{feeStrip:{address:feeStrip,observedRuntimeHash:keccak256(code)}}},...a,now:1000000}};
}
test('read-only verifier returns a pin only after complete runtime, bindings and canonical block match',async()=>{
 const f=fixture();const result=await verifyClaimPin(f.args);assert.equal(result.verified,true);assert.equal(result.transactionSent,false);assert.equal(result.pins[claim],keccak256(f.state.claimCode));
 for(const [key,value] of [['claimCode',f.state.claimCode.slice(0,-2)+'01'],['originalSupply',1n],['escrow',claim],['canonical','0x'+'44'.repeat(32)]]){
  const bad=fixture();bad.state[key]=value;await assert.rejects(()=>verifyClaimPin(bad.args));
 }
});
