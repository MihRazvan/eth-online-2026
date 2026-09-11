import {encodeAbiParameters,keccak256,toRlp,toHex} from 'viem';
const fields=['parentHash','sha3Uncles','miner','stateRoot','transactionsRoot','receiptsRoot','logsBloom','difficulty','number','gasLimit','gasUsed','timestamp','extraData','mixHash','nonce','baseFeePerGas','withdrawalsRoot','blobGasUsed','excessBlobGas','parentBeaconBlockRoot','requestsHash'];
const quantities=new Set(['difficulty','number','gasLimit','gasUsed','timestamp','baseFeePerGas','blobGasUsed','excessBlobGas']);
const rlpQuantity=x=>BigInt(x)===0n?'0x':toHex(BigInt(x));
/** Retain a real RPC header+proof for its exact hash. Does not accept a supplied payout amount. */
export async function acquireWitness(client,{manager,slots,blockNumber}){
 const block=toHex(blockNumber);
 const header=await client.request({method:'eth_getBlockByNumber',params:[block,false]});
 const proof=await client.request({method:'eth_getProof',params:[manager,slots,block]});
 const headerRlp=toRlp(fields.filter(k=>header[k]!=null).map(k=>quantities.has(k)?rlpQuantity(header[k]):header[k]));
 if(keccak256(headerRlp)!==header.hash)throw new Error('Header serialization does not match its actual block hash');
 if(proof.storageProof.length!==slots.length)throw new Error('Missing storage witnesses');
 for(const slot of slots)if(!proof.storageProof.some(x=>BigInt(x.key)===BigInt(slot)))throw new Error('Substituted slot');
 const storageNodes=[...new Set(proof.storageProof.flatMap(s=>s.proof))];
 const witness=encodeAbiParameters([{type:'bytes'},{type:'bytes[]'},{type:'bytes[]'}],[headerRlp,proof.accountProof,storageNodes]);
 return {scope:'local chain witness',blockNumber:blockNumber.toString(),blockHash:header.hash,manager,slots,header,proof,headerRlp,witness};
}
