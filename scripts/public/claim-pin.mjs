#!/usr/bin/env node
/** Read-only runtime pin for an actually issued Sepolia FeeClaim.
 * SEPOLIA_RPC_URL=https://... node scripts/public/claim-pin.mjs --series 1
 * Requires Foundry's FeeClaim.0.8.26 and ERC20.0.8.26 artifacts. No keys or writes.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createPublicClient,http,parseAbi,parseAbiParameters,encodeAbiParameters,keccak256,stringToHex,toHex,padHex,zeroAddress} from 'viem';
import {LIMITS} from './test-plan.mjs';
const root=new URL('../../',import.meta.url),compiler='0.8.26+commit.8a97fa7a';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const address=value=>{assert(/^0x[0-9a-f]{40}$/i.test(value)&&!same(value,zeroAddress),'Invalid nonzero address');return value.toLowerCase();};
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const abi=parseAbi(['function claimToken(uint256) view returns(address)','function escrow() view returns(address)','function originalSupply() view returns(uint256)',
 'function decimals() view returns(uint8)','function name() view returns(string)','function DOMAIN_SEPARATOR() view returns(bytes32)','function totalSupply() view returns(uint256)']);
export function claimDomainSeparator(claim){
 return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,uint256,address'),[
  keccak256(stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
  keccak256(stringToHex('FeeStrip USDC Fee Claim')),keccak256(stringToHex('1')),BigInt(LIMITS.chainId),address(claim)]));
}
/** Identify immutables by AST declaration names, never hardcoded compilation IDs. */
export function deriveClaimRuntime({claimArtifact,erc20Artifact,claim,feeStrip,originalSupply=LIMITS.originalQ}){
 address(claim);address(feeStrip);assert(typeof originalSupply==='bigint'&&originalSupply>0n&&originalSupply<(1n<<256n));
 for(const artifact of [claimArtifact,erc20Artifact])assert.equal(artifact.metadata?.compiler?.version,compiler,'Wrong FeeClaim compiler artifact');
 const names=new Map();
 const visit=node=>{if(!node||typeof node!=='object')return;
  if(node.nodeType==='VariableDeclaration'&&node.mutability==='immutable'){assert(Number.isSafeInteger(node.id));assert(!names.has(String(node.id))||names.get(String(node.id))===node.name);names.set(String(node.id),node.name);}
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 };
 visit(claimArtifact.ast);visit(erc20Artifact.ast);
 const domainSeparator=claimDomainSeparator(claim),values={decimals:toHex(18n,{size:32}),INITIAL_CHAIN_ID:toHex(BigInt(LIMITS.chainId),{size:32}),INITIAL_DOMAIN_SEPARATOR:domainSeparator,escrow:padHex(address(feeStrip),{size:32}),originalSupply:toHex(originalSupply,{size:32})};
 const bytecode=claimArtifact.deployedBytecode;assert(/^0x(?:[0-9a-f]{2})+$/i.test(bytecode?.object),'Missing deployed bytecode');
 const bytes=Buffer.from(bytecode.object.slice(2),'hex'),patched=new Set(),seen=new Set();
 for(const [id,references] of Object.entries(bytecode.immutableReferences??{})){
  const name=names.get(id);assert(Object.hasOwn(values,name),'Unknown immutable reference');seen.add(name);assert(Array.isArray(references)&&references.length>0);
  for(const {start,length} of references){assert(Number.isSafeInteger(start)&&start>=0&&length===32&&start+length<=bytes.length,'Invalid immutable offset');
   for(let i=start;i<start+length;i++){assert(!patched.has(i),'Overlapping immutable references');patched.add(i);}
   assert(bytes.subarray(start,start+32).every(v=>v===0),'Unexpected immutable placeholder');Buffer.from(values[name].slice(2),'hex').copy(bytes,start);
  }
 }
 assert.deepEqual([...seen].sort(),Object.keys(values).sort(),'Missing immutable reference');
 const runtime='0x'+bytes.toString('hex');return {runtime,runtimeHash:keccak256(runtime),domainSeparator,immutableValues:values};
}
export function loadClaimArtifacts(directory=resolve(fileURLToPath(root),'contracts/out')){
 const claimArtifact=read(resolve(directory,'FeeClaim.sol/FeeClaim.0.8.26.json')),erc20Artifact=read(resolve(directory,'ERC20.sol/ERC20.0.8.26.json'));
 for(const artifact of [claimArtifact,erc20Artifact])for(const [path,pin] of Object.entries(artifact.metadata?.sources??{}))assert(same(keccak256(readFileSync(new URL(path,root))),pin.keccak256),'Artifact source differs from checkout');
 return {claimArtifact,erc20Artifact};
}
export async function verifyClaimPin({client,seriesId,deployment,evidence,claimArtifact,erc20Artifact,now=Date.now()}){
 assert(typeof seriesId==='bigint'&&seriesId>0n&&seriesId<(1n<<256n));assert.equal(deployment.chainId,LIMITS.chainId);address(deployment.feeStrip);
 const [chain,genesis,head]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n}),client.getBlock({blockTag:'latest'})]);
 assert.equal(chain,LIMITS.chainId);assert(same(genesis.hash,LIMITS.genesisHash));
 assert(typeof head.number==='bigint'&&head.hash&&typeof head.timestamp==='bigint'&&Number(head.timestamp)>now/1000-120&&Number(head.timestamp)<=now/1000+15,'Stale chain observation');
 const stripCode=await client.getBytecode({address:deployment.feeStrip,blockNumber:head.number});
 assert(same(evidence.contracts.feeStrip.address,deployment.feeStrip)&&same(keccak256(stripCode??'0x'),evidence.contracts.feeStrip.observedRuntimeHash),'Unverified FeeStrip runtime');
 const readAt=(target,functionName,args=[])=>client.readContract({address:target,abi,functionName,args,blockNumber:head.number});
 const claim=address(await readAt(deployment.feeStrip,'claimToken',[seriesId]));assert(!same(claim,deployment.feeStrip));
 const expected=deriveClaimRuntime({claimArtifact,erc20Artifact,claim,feeStrip:deployment.feeStrip});
 const [code,escrow,originalSupply,decimals,name,domainSeparator,totalSupply]=await Promise.all([
  client.getBytecode({address:claim,blockNumber:head.number}),...['escrow','originalSupply','decimals','name','DOMAIN_SEPARATOR','totalSupply'].map(key=>readAt(claim,key))]);
 assert(same(code,expected.runtime),'Claim runtime or immutable mismatch');assert(same(escrow,deployment.feeStrip));assert.equal(originalSupply,LIMITS.originalQ);
 assert.equal(decimals,18);assert.equal(name,'FeeStrip USDC Fee Claim');assert(same(domainSeparator,expected.domainSeparator));assert(typeof totalSupply==='bigint'&&totalSupply>=0n&&totalSupply<=originalSupply);
 assert(same(await readAt(deployment.feeStrip,'claimToken',[seriesId]),claim));assert(same((await client.getBlock({blockNumber:head.number})).hash,head.hash),'Observation reorg');
 return {scope:'Read-only exact issued-claim runtime and immutable binding verification; no signature or transaction.',verified:true,chainId:LIMITS.chainId,seriesId:String(seriesId),claim,
  runtimeHash:expected.runtimeHash,pins:{[claim]:expected.runtimeHash},compiler,observedBlock:String(head.number),observedHash:head.hash,
  bindings:{escrow:address(escrow),originalSupply:String(originalSupply),decimals,name,domainSeparator,totalSupply:String(totalSupply)},transactionSent:false};
}
async function main(){
 const {values}=parseArgs({options:{series:{type:'string',default:'1'},'artifact-root':{type:'string'}}});assert(/^[1-9][0-9]*$/.test(values.series));
 const deployment=read(new URL('deployments/sepolia.json',root)),evidence=read(new URL('docs/evidence/sepolia-deployment.json',root));
 const rpc=process.env.SEPOLIA_RPC_URL??deployment.rpcUrl,url=new URL(rpc);assert(url.protocol==='https:'&&!url.username&&!url.password);
 const client=createPublicClient({transport:http(rpc,{timeout:8000,retryCount:0})});
 const result=await verifyClaimPin({client,seriesId:BigInt(values.series),deployment,evidence,...loadClaimArtifacts(values['artifact-root'])});console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error(JSON.stringify({error:'CLAIM_PIN_NOT_VERIFIED',verified:false,transactionSent:false}));process.exitCode=1;});
