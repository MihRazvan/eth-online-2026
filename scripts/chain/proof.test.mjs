import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeAbiParameters,fromRlp,keccak256,toHex,toRlp} from 'viem';
import {acquireWitness} from './proof.mjs';

// Retained public Sepolia bytes, served by deterministic mock RPCs. No live request or chain mutation.
const retained=JSON.parse(readFileSync(new URL('../proof/sepolia-witness.json',import.meta.url)));
const args={manager:retained.manager,slots:retained.slots,blockNumber:BigInt(retained.blockNumber)};
const copy=value=>structuredClone(value);
const rpcError=(code,message)=>Object.assign(new Error(message),{code});
function mock({headers=[retained.header,retained.header],chains=['0xaa36a7','0xaa36a7'],proof=retained.proof,hashError,numberError,configuredChain}={}){
 const calls=[];let h=0,c=0;
 return {calls,chain:configuredChain===undefined?undefined:{id:configuredChain},async request(request){
  calls.push(copy(request));
  if(request.method==='eth_chainId')return chains[c++];
  if(request.method==='eth_getBlockByNumber')return copy(headers[h++]);
  if(request.method==='eth_getProof'){
   if(typeof request.params[2]==='object'&&hashError)throw hashError;
   if(typeof request.params[2]==='string'&&numberError)throw numberError;
   return copy(proof);
  }
  throw new Error(`Unexpected RPC method ${request.method}`);
 }};
}
function replacementHeader(){
 const header=copy(retained.header);const values=fromRlp(retained.headerRlp,'hex');
 values[12]='0x1234';header.extraData='0x1234';header.hash=keccak256(toRlp(values));return header;
}
const proofRequests=client=>client.calls.filter(call=>call.method==='eth_getProof');

test('hash-selects actual retained witness bytes, rechecks canonical header and keeps consumer ABI',async()=>{
 const client=mock();const result=await acquireWitness(client,args);
 assert.deepEqual(proofRequests(client)[0].params,[args.manager,args.slots,{blockHash:retained.blockHash,requireCanonical:true}]);
 assert.equal(proofRequests(client).length,1);assert.equal(result.headerRlp,retained.headerRlp);
 assert.equal(result.chainId,'11155111');assert.equal(result.proofBlockSelector,'hash');
 assert.match(result.scope,/RPC chain witness/);assert.doesNotMatch(result.scope,/local chain/);
 assert.match(result.validation,/trie authentication required/);
 const [header,account,storage]=decodeAbiParameters([{type:'bytes'},{type:'bytes[]'},{type:'bytes[]'}],result.witness);
 assert.equal(header,retained.headerRlp);assert.deepEqual(account,retained.proof.accountProof);
 assert.equal(new Set(storage).size,storage.length);assert.ok(storage.length>0);
 assert.deepEqual(client.calls.map(call=>call.method),['eth_chainId','eth_getBlockByNumber','eth_getProof','eth_getBlockByNumber','eth_chainId']);
});

test('only explicit unsupported selector diagnostics permit a number fallback',async()=>{
 const errors=[
  rpcError(-32602,'invalid argument 2: json: cannot unmarshal object into Go value of type string'),
  rpcError(-32602,'invalid type: map, expected a block number or tag'),
  rpcError(-32000,'EIP-1898 block hash selectors are not supported'),
  Object.assign(new Error('viem wrapper'),{code:-32602,cause:{code:-32602,message:'unsupported block hash selector'}}),
 ];
 for(const hashError of errors){
  const client=mock({hashError});const result=await acquireWitness(client,args);
  assert.equal(result.proofBlockSelector,'number-fallback');assert.equal(proofRequests(client).length,2);
  assert.equal(proofRequests(client)[1].params[2],toHex(args.blockNumber));
  assert.equal(client.calls.filter(call=>call.method==='eth_getBlockByNumber').length,2);
 }
});

test('genuine RPC errors propagate unchanged without a weaker retry',async()=>{
 const errors=[
  rpcError(-32602,'maximum proof window exceeded'),rpcError(-32602,'invalid params'),
  rpcError(-32000,'missing trie node'),rpcError(-32000,'block hash not found'),
  rpcError(-32000,'block is not canonical'),rpcError(-32601,'eth_getProof method not found'),
  rpcError(429,'rate limit'),rpcError(401,'unauthorized'),new Error('timeout'),
  Object.assign(new Error('Request body says block hash unsupported'),{code:-32602,cause:{code:-32602,message:'historical state pruned'}}),
  rpcError(-32602,'invalid argument 0: json: cannot unmarshal object into Go value of type string'),
 ];
 for(const hashError of errors){
  const client=mock({hashError});await assert.rejects(acquireWitness(client,args),error=>error===hashError);
  assert.equal(proofRequests(client).length,1);
 }
});

test('number-fallback errors propagate without further retries',async()=>{
 const numberError=rpcError(-32602,'maximum proof window exceeded');
 const client=mock({hashError:rpcError(-32602,'unsupported block hash selector'),numberError});
 await assert.rejects(acquireWitness(client,args),error=>error===numberError);assert.equal(proofRequests(client).length,2);
});

test('hash and fallback paths reject a canonical reorg after fetching proof',async()=>{
 for(const hashError of [undefined,rpcError(-32602,'unsupported block hash selector')]){
  const client=mock({hashError,headers:[retained.header,replacementHeader()]});
  await assert.rejects(acquireWitness(client,args),/reorg or provider header substitution/);
 }
});

test('missing, wrong-number, malformed and corrupt headers fail before proof retrieval',async()=>{
 const corrupt=copy(retained.header);corrupt.stateRoot='0x'+'11'.repeat(32);
 const wrongNumber=copy(retained.header);wrongNumber.number=toHex(args.blockNumber+1n);
 const missing=copy(retained.header);delete missing.parentHash;
 const gap=copy(retained.header);delete gap.baseFeePerGas;
 for(const header of [null,corrupt,wrongNumber,missing,gap]){
  const client=mock({headers:[header]});await assert.rejects(acquireWitness(client,args));assert.equal(proofRequests(client).length,0);
 }
 const client=mock({headers:[retained.header,null]});await assert.rejects(acquireWitness(client,args),/endpoint header/);
});

test('rejects manager substitution, duplicate keys, missing slots and unexpected slots',async()=>{
 const variants=[];
 const manager=copy(retained.proof);manager.address='0x'+'12'.repeat(20);variants.push(manager);
 const duplicate=copy(retained.proof);duplicate.storageProof[1]=copy(duplicate.storageProof[0]);variants.push(duplicate);
 const substituted=copy(retained.proof);substituted.storageProof[0].key='0x0';variants.push(substituted);
 const missing=copy(retained.proof);missing.storageProof.pop();variants.push(missing);
 const extra=copy(retained.proof);extra.storageProof.push(copy(extra.storageProof[0]));variants.push(extra);
 for(const proof of variants)await assert.rejects(acquireWitness(mock({proof}),args));
 const proof=copy(retained.proof);proof.address=proof.address.toUpperCase().replace('0X','0x');
 proof.storageProof.reverse();for(const entry of proof.storageProof)entry.key=toHex(BigInt(entry.key));
 await acquireWitness(mock({proof}),args); // Key identity is numerical, not response order or zero padding.
});

test('malformed proof structure, values and RLP nodes are rejected without claiming trie validation',async()=>{
 const mutations=[
  p=>delete p.address,p=>delete p.storageHash,p=>p.codeHash='0x00',p=>p.balance='1',p=>p.nonce='0x',
  p=>p.accountProof=[],p=>p.accountProof='0xc0',p=>p.accountProof[0]='0x1',p=>p.accountProof[0]='0x01',
  p=>p.accountProof[0]='0xc001',p=>p.storageProof=null,p=>p.storageProof[0]=null,
  p=>p.storageProof[0].key='0xzz',p=>p.storageProof[0].value='0x-1',
  p=>p.storageProof[0].value='0x1'+'0'.repeat(64),p=>p.storageProof[0].proof=[false],
  p=>p.storageProof[0].proof=['0xc2'],
 ];
 for(const mutate of mutations){const proof=copy(retained.proof);mutate(proof);await assert.rejects(acquireWitness(mock({proof}),args));}
 const proof=copy(retained.proof);proof.storageProof[0].value='0x0';proof.storageProof[0].proof=[];
 await acquireWitness(mock({proof}),args); // An empty storage trie can legitimately prove absence; Solidity authenticates it.
});

test('rejects duplicate requested slots and invalid inputs before any RPC',async()=>{
 const inputs=[{slots:[args.slots[0],args.slots[0]]},{slots:[]},{slots:['0x0']},{manager:'0x1'},
  {blockNumber:-1n},{blockNumber:Number.MAX_SAFE_INTEGER+1},{blockNumber:'latest'}];
 for(const change of inputs){const client=mock();await assert.rejects(acquireWitness(client,{...args,...change}));assert.equal(client.calls.length,0);}
});

test('only chain31337 is labeled local; configured-chain and mid-fetch chain substitutions fail',async()=>{
 const local=await acquireWitness(mock({chains:['0x7a69','0x7a69'],configuredChain:31337}),args);
 assert.equal(local.scope,'local chain witness');assert.equal(local.chainId,'31337');
 const configured=mock({configuredChain:31337});await assert.rejects(acquireWitness(configured,args),/configured chain/);
 assert.equal(proofRequests(configured).length,0);
 await assert.rejects(acquireWitness(mock({chains:['0xaa36a7','0x1']}),args),/chain changed/);
 for(const chain of ['0x0','11155111',null])await assert.rejects(acquireWitness(mock({chains:[chain]}),args),/chain ID/);
});
