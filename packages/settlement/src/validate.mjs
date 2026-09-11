import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {decodeAbiParameters,encodeAbiParameters} from 'viem';

const ABI=[{type:'bytes'},{type:'bytes[]'},{type:'bytes[]'}];
const validator=fileURLToPath(new URL('../../../scripts/proof/validate_witness.py',import.meta.url));
const HEX=/^0x(?:[0-9a-f]{2})*$/i;
const HASH=/^0x[0-9a-f]{64}$/i;

function hex(value){
 if(typeof value!=='string'||!HEX.test(value))throw new Error('Malformed witness bytes');
 return value.toLowerCase();
}
function nodeList(value){
 if(!Array.isArray(value))throw new Error('Malformed witness node list');
 return value.map(hex);
}
function bindEncodedWitness(artifact){
 if(!artifact||typeof artifact!=='object'||!artifact.proof||!Array.isArray(artifact.proof.storageProof))throw new Error('Missing witness proof envelope');
 const encoded=hex(artifact.witness);
 let decoded;
 try{decoded=decodeAbiParameters(ABI,encoded);}
 catch{throw new Error('Malformed encoded settlement witness');}
 const account=nodeList(artifact.proof.accountProof);
 const storage=[...new Set(artifact.proof.storageProof.flatMap(entry=>nodeList(entry?.proof)))];
 if(hex(decoded[0])!==hex(artifact.headerRlp)||JSON.stringify(decoded[1])!==JSON.stringify(account)||JSON.stringify(decoded[2])!==JSON.stringify(storage)){
  throw new Error('Encoded settlement witness differs from authenticated envelope');
 }
 // Reject trailing bytes and alternative ABI offsets/padding, keeping the retained format unambiguous.
 if(encodeAbiParameters(ABI,decoded)!==encoded)throw new Error('Noncanonical encoded settlement witness');
}
function authenticate(input,python){
 return new Promise((resolve,reject)=>{
  const child=execFile(python,[validator],{encoding:'utf8',timeout:30_000,maxBuffer:1024*1024},(error,stdout,stderr)=>{
   if(error){
    const diagnostic=stderr.trim().split('\n').find(line=>line.startsWith('Witness validation failed:'));
    reject(new Error(diagnostic?.slice(0,500)??'Offline witness validator failed or is unavailable'));
    return;
   }
   try{resolve(JSON.parse(stdout));}
   catch{reject(new Error('Malformed offline validator result'));}
  });
  // The immutable serialized snapshot is supplied through stdin, never a shell command or temporary artifact.
  child.stdin.on('error',()=>{}); // An early child failure is reported by execFile's callback.
  child.stdin.end(input);
 });
}

/** Authenticate account/storage paths and bind the exact Solidity witness bytes.
 * This proves consistency with the supplied header, not that its hash is canonical on the expected chain.
 * Callers must independently anchor blockHash and source expected manager/code/slot pins from trusted configuration.
 */
export async function validateWitness(artifact,expected,{python=process.env.FEESTRIP_PROOF_PYTHON??'python3'}={}){
 // Snapshot before yielding so caller mutation cannot separate the checked ABI from the authenticated JSON.
 const input=JSON.stringify({artifact,expected});
 const snapshot=JSON.parse(input);
 bindEncodedWitness(snapshot.artifact);
 const result=await authenticate(input,python);
 if(!result||!['blockHash','stateRoot','storageRoot','managerCodeHash'].every(key=>typeof result[key]==='string'&&HASH.test(result[key]))||
  !Array.isArray(result.values)||!result.values.every(value=>typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value))||
  !Array.isArray(result.slots)||JSON.stringify(result.slots)!==JSON.stringify(snapshot.expected.slots.map(hex))||
  result.managerCodeHash!==hex(snapshot.expected.managerCodeHash)||result.blockHash!==hex(snapshot.artifact.blockHash)||
  result.values.length!==snapshot.expected.slots.length){
  throw new Error('Offline validator returned inconsistent authenticated data');
 }
 return {blockHash:result.blockHash,stateRoot:result.stateRoot,storageRoot:result.storageRoot,
  values:result.values,managerCodeHash:result.managerCodeHash};
}
