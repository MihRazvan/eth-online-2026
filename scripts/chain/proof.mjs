import {encodeAbiParameters,fromRlp,keccak256,toRlp,toHex} from 'viem';

const fields=['parentHash','sha3Uncles','miner','stateRoot','transactionsRoot','receiptsRoot','logsBloom','difficulty','number','gasLimit','gasUsed','timestamp','extraData','mixHash','nonce','baseFeePerGas','withdrawalsRoot','blobGasUsed','excessBlobGas','parentBeaconBlockRoot','requestsHash'];
const quantities=new Set(['difficulty','number','gasLimit','gasUsed','timestamp','baseFeePerGas','blobGasUsed','excessBlobGas']);
const widths={parentHash:32,sha3Uncles:32,miner:20,stateRoot:32,transactionsRoot:32,receiptsRoot:32,logsBloom:256,mixHash:32,nonce:8,withdrawalsRoot:32,parentBeaconBlockRoot:32,requestsHash:32};
const address=/^0x[\da-f]{40}$/i;
const word=/^0x[\da-f]{64}$/i;
const quantity=/^0x(?:0|[1-9a-f][\da-f]*)$/i;
const bytes=/^0x(?:[\da-f]{2})*$/i;

function uint(value,label){
 if(typeof value!=='string'||!quantity.test(value)||BigInt(value)>=(1n<<256n))throw new Error(`Invalid ${label}`);
 return BigInt(value);
}
function headerAt(header,number){
 if(!header||typeof header!=='object'||!word.test(header.hash??''))throw new Error('Missing or malformed endpoint header');
 if(uint(header.number,'header number')!==number)throw new Error('Substituted endpoint block number');
 let omitted=false;
 const values=[];
 for(const [index,key] of fields.entries()){
  const value=header[key];
  if(value==null){if(index<15)throw new Error(`Missing header field: ${key}`);omitted=true;continue;}
  if(omitted)throw new Error('Noncontiguous optional header fields');
  if(quantities.has(key)){const n=uint(value,`header ${key}`);values.push(n===0n?'0x':toHex(n));}
  else{
   if(typeof value!=='string'||!bytes.test(value)||(widths[key]&&value.length!==2+widths[key]*2))throw new Error(`Invalid header ${key}`);
   values.push(value);
  }
 }
 const headerRlp=toRlp(values);
 if(keccak256(headerRlp)!==header.hash.toLowerCase())throw new Error('Header serialization does not match its actual block hash');
 return headerRlp;
}

// Inspect the underlying RPC diagnostic, not viem's wrapper text containing request parameters.
function unsupportedHashSelector(error){
 let rpc;const seen=new Set();
 for(let e=error;e&&typeof e==='object'&&!seen.has(e);e=e.cause){seen.add(e);if(Number.isInteger(e.code))rpc=e;}
 if(!rpc||![-32602,-32000,-32004].includes(rpc.code))return false;
 const diagnostic=rpc.details??rpc.shortMessage??rpc.message;
 if(typeof diagnostic!=='string')return false;
 if(/(?:eip[- ]?1898|block[ -]?hash(?: selector)?|block selector object).{0,45}(?:not supported|unsupported)/i.test(diagnostic))return true;
 if(/(?:unsupported|does not support).{0,35}(?:eip[- ]?1898|block[ -]?hash(?: selector)?|block selector object)/i.test(diagnostic))return true;
 // Older clients decode the third parameter as a string/tag and explicitly reject JSON objects.
 return rpc.code===-32602&&(
  /invalid (?:argument|param(?:eter)?) 2:.*cannot unmarshal object into Go value of type (?:string|hexutil\.Uint64)/i.test(diagnostic)||
  /invalid type: (?:map|object), expected (?:a )?(?:string|block number or tag|block number)/i.test(diagnostic)
 );
}
function nodes(value,label,{nonempty=false}={}){
 if(!Array.isArray(value)||(nonempty&&value.length===0))throw new Error(`Invalid ${label}`);
 for(const node of value){
  if(typeof node!=='string'||!bytes.test(node)||node==='0x')throw new Error(`Invalid ${label} node encoding`);
  try{
   const decoded=fromRlp(node,'hex');
   if(!Array.isArray(decoded)||toRlp(decoded)!==node.toLowerCase())throw new Error('Noncanonical RLP list');
  }catch{throw new Error(`Invalid ${label} node RLP`);}
 }
}
function validateProof(proof,manager,slots){
 if(!proof||typeof proof!=='object'||typeof proof.address!=='string'||!address.test(proof.address)||proof.address.toLowerCase()!==manager.toLowerCase())throw new Error('Substituted or missing proof manager');
 if(!word.test(proof.codeHash??'')||!word.test(proof.storageHash??''))throw new Error('Invalid account proof hashes');
 uint(proof.balance,'account balance');uint(proof.nonce,'account nonce');
 nodes(proof.accountProof,'account proof',{nonempty:true});
 if(!Array.isArray(proof.storageProof)||proof.storageProof.length!==slots.length)throw new Error('Missing or extra storage witnesses');
 const requested=new Set(slots.map(slot=>BigInt(slot).toString()));const seen=new Set();
 for(const entry of proof.storageProof){
  if(!entry||typeof entry!=='object'||typeof entry.key!=='string'||!/^0x[\da-f]{1,64}$/i.test(entry.key))throw new Error('Invalid storage proof key');
  const key=BigInt(entry.key).toString();
  if(!requested.has(key))throw new Error('Substituted storage slot');
  if(seen.has(key))throw new Error('Duplicate storage slot');
  seen.add(key);uint(entry.value,'storage value');nodes(entry.proof,'storage proof');
 }
}

/** Hash-bound RPC acquisition and structural checks only. Solidity must authenticate the account/storage tries.
 * Canonicality is observed at retrieval time, not a finality guarantee. No payout amount is accepted.
 */
export async function acquireWitness(client,{manager,slots,blockNumber}){
 if(typeof manager!=='string'||!address.test(manager))throw new Error('Invalid requested manager');
 if(!Array.isArray(slots)||slots.length===0||slots.some(slot=>typeof slot!=='string'||!word.test(slot)))throw new Error('Requested slots must be nonempty 32-byte keys');
 slots=[...slots];
 if(new Set(slots.map(slot=>slot.toLowerCase())).size!==slots.length)throw new Error('Duplicate requested storage slot');
 if(!['number','bigint'].includes(typeof blockNumber)||(typeof blockNumber==='number'&&!Number.isSafeInteger(blockNumber))||blockNumber<0)throw new Error('Invalid requested block number');
 const number=BigInt(blockNumber);const block=toHex(number);
 const chainId=uint(await client.request({method:'eth_chainId',params:[]}),'chain ID');
 if(chainId===0n)throw new Error('Invalid chain ID');
 if(client.chain?.id!==undefined&&BigInt(client.chain.id)!==chainId)throw new Error('RPC chain differs from configured chain');
 const header=await client.request({method:'eth_getBlockByNumber',params:[block,false]});
 const headerRlp=headerAt(header,number);
 const blockHash=header.hash.toLowerCase();
 let proof;let proofBlockSelector='hash';
 try{proof=await client.request({method:'eth_getProof',params:[manager,slots,{blockHash,requireCanonical:true}]});}
 catch(error){
  if(!unsupportedHashSelector(error))throw error;
  proofBlockSelector='number-fallback';
  proof=await client.request({method:'eth_getProof',params:[manager,slots,block]});
 }
 validateProof(proof,manager,slots);
 const canonical=await client.request({method:'eth_getBlockByNumber',params:[block,false]});
 if(headerAt(canonical,number)!==headerRlp)throw new Error('Endpoint reorg or provider header substitution during proof acquisition');
 if(uint(await client.request({method:'eth_chainId',params:[]}),'chain ID')!==chainId)throw new Error('RPC chain changed during proof acquisition');
 const storageNodes=[...new Set(proof.storageProof.flatMap(s=>s.proof).map(node=>node.toLowerCase()))];
 const witness=encodeAbiParameters([{type:'bytes'},{type:'bytes[]'},{type:'bytes[]'}],[headerRlp,proof.accountProof,storageNodes]);
 return {scope:chainId===31337n?'local chain witness':`RPC chain witness (chain ID ${chainId}; public acceptance not established)`,chainId:chainId.toString(),proofBlockSelector,
  validation:'header hash and RPC response structure checked; account/storage trie authentication required',
  blockNumber:number.toString(),blockHash,manager,slots,header,proof,headerRlp,witness};
}
