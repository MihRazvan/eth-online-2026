import {fail} from './store.mjs';
const MAX_BYTES=2*1024*1024;
/** Keep public proof material only. Provider-specific metadata and credential-bearing diagnostics never enter exports. */
export function publicArtifact(input){
 const encoded=JSON.stringify(input);
 if(Buffer.byteLength(encoded)>MAX_BYTES)fail('ARTIFACT_LIMIT_EXCEEDED');
 if(!input||!input.proof||!Array.isArray(input.proof.accountProof)||!Array.isArray(input.proof.storageProof))fail('ARTIFACT_MALFORMED');
 const nodes=[...input.proof.accountProof,...input.proof.storageProof.flatMap(s=>s.proof??[])];
 if(nodes.length>2048||nodes.some(n=>typeof n!=='string'||n.length>65538))fail('ARTIFACT_LIMIT_EXCEEDED');
 const output={schemaVersion:1,scope:'Retained RPC witness; canonical anchoring and contract verification remain required'};
 for(const key of ['chainId','blockNumber','blockHash','manager','slots','headerRlp','witness'])output[key]=input[key];
 output.header=Object.fromEntries(['hash','parentHash','sha3Uncles','miner','stateRoot','transactionsRoot','receiptsRoot','logsBloom','difficulty','number','gasLimit','gasUsed','timestamp','extraData','mixHash','nonce','baseFeePerGas','withdrawalsRoot','blobGasUsed','excessBlobGas','parentBeaconBlockRoot','requestsHash'].filter(key=>input.header?.[key]!=null).map(key=>[key,input.header[key]]));
 output.proof=Object.fromEntries(['address','balance','nonce','codeHash','storageHash','accountProof'].map(key=>[key,input.proof[key]]));
 output.proof.storageProof=input.proof.storageProof.map(s=>({key:s.key,value:s.value,proof:s.proof}));
 return output;
}
