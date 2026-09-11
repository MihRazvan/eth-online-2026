import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {decodeAbiParameters,encodeAbiParameters} from 'viem';
import {validateWitness} from '../src/validate.mjs';

const python=process.env.FEESTRIP_PROOF_PYTHON??'python3';
const options={python};
const ABI=[{type:'bytes'},{type:'bytes[]'},{type:'bytes[]'}];
const artifact=JSON.parse(readFileSync(new URL('../../../scripts/proof/sepolia-witness.json',import.meta.url)));
// Fixed deployment code identity, independent of the artifact's RPC-supplied codeHash field.
const expected={chainId:'11155111',manager:'0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
 managerCodeHash:'0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1',
 blockNumber:'11682191',slots:artifact.slots};
const copy=value=>structuredClone(value);
function encode(a){
 a.witness=encodeAbiParameters(ABI,[a.headerRlp,a.proof.accountProof,[...new Set(a.proof.storageProof.flatMap(entry=>entry.proof).map(node=>node.toLowerCase()))]]);
 return a;
}
function generated(kind){
 // Trusted test helper constructs genuine MPT structures with explicitly synthetic state/headers.
 const directory=fileURLToPath(new URL('../../../scripts/proof',import.meta.url));
 const program='import sys,json;sys.path.insert(0,sys.argv[1]);from test_validate_witness import synthetic;print(json.dumps(synthetic(sys.argv[2])))';
 const [a,e]=JSON.parse(execFileSync(python,['-c',program,directory,kind],{encoding:'utf8'}));
 return [encode(a),e];
}

test('real Python process authenticates public fixture and preserves precise API values',async()=>{
 const result=await validateWitness(artifact,expected,options);
 assert.deepEqual(Object.keys(result),['blockHash','stateRoot','storageRoot','values','managerCodeHash']);
 assert.equal(result.blockHash,artifact.blockHash);assert.equal(result.stateRoot,artifact.header.stateRoot);
 assert.equal(result.managerCodeHash,expected.managerCodeHash);assert.deepEqual(result.values,artifact.values);
 assert.equal(typeof result.values[0],'string');assert.ok(BigInt(result.values[0])>BigInt(Number.MAX_SAFE_INTEGER));
});

test('accepts current acquireWitness string metadata envelope without legacy extra fields',async()=>{
 const a=Object.fromEntries(['manager','slots','header','proof','headerRlp','witness','blockHash'].map(key=>[key,copy(artifact[key])]));
 a.chainId='11155111';a.blockNumber='11682191';a.scope='RPC chain witness; public acceptance not established';
 assert.deepEqual((await validateWitness(a,expected,options)).values,artifact.values);
});

test('generated branches, embedded child nodes and empty storage authenticate through ABI wrapper',async()=>{
 for(const [kind,values] of [['branches',['7','9','0']],['inline',['7','0']],['empty',['0','0']]]){
  const [a,e]=generated(kind);assert.deepEqual((await validateWitness(a,e,options)).values,values);
 }
});

test('encoded header, account nodes and storage nodes must match the same envelope',async()=>{
 for(const position of [0,1,2]){
  const a=copy(artifact);const decoded=decodeAbiParameters(ABI,a.witness);
  if(position===0)decoded[0]='0xc0';else decoded[position][0]='0xc0';
  a.witness=encodeAbiParameters(ABI,decoded);
  await assert.rejects(validateWitness(a,expected,options),/differs from authenticated envelope/);
 }
 const a=copy(artifact);a.witness='0x01';await assert.rejects(validateWitness(a,expected,options),/Malformed encoded/);
 const padded=copy(artifact);padded.witness+='00'.repeat(32);
 await assert.rejects(validateWitness(padded,expected,options),/Noncanonical encoded/);
});

test('altering both ABI and envelope cannot bypass cryptographic path authentication',async()=>{
 for(const target of ['account','storage']){
  const a=copy(artifact);const nodes=target==='account'?a.proof.accountProof:a.proof.storageProof[0].proof;
  nodes[0]=nodes[0].slice(0,-2)+(nodes[0].endsWith('01')?'02':'01');encode(a);
  await assert.rejects(validateWitness(a,expected,options),/trie proof/);
 }
 const a=copy(artifact);a.proof.storageProof[0].value='0x1';
 await assert.rejects(validateWitness(a,expected,options),/differs from authenticated value/);
});

test('wrong independently expected pin, chain and ordered slots reject rather than trusting RPC assertions',async()=>{
 for(const change of [{managerCodeHash:'0x'+'01'.repeat(32)},{chainId:'1'},{slots:[...expected.slots].reverse()},{blockNumber:'11682192'}]){
  await assert.rejects(validateWitness(artifact,{...expected,...change},options),/Witness validation failed/);
 }
});

test('caller mutation while Python runs cannot change the authenticated snapshot',async()=>{
 const a=copy(artifact),e=copy(expected);const pending=validateWitness(a,e,options);
 a.proof.storageProof[0].value='0x1';a.witness='0x';e.managerCodeHash='0x'+'01'.repeat(32);
 assert.deepEqual((await pending).values,artifact.values);
});

test('missing validator process fails closed',async()=>{
 await assert.rejects(validateWitness(artifact,expected,{python:'/nonexistent/feestrip-python'}),/failed or is unavailable/);
});
