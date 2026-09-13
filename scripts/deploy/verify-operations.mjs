#!/usr/bin/env node
/** Read-only operator checkpoint. Never loads .env, signs, provisions, or changes readiness. */
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createPublicClient,http,keccak256,parseAbi} from 'viem';
import {readBounded} from '../../packages/operations/src/http.mjs';

const root=new URL('../../',import.meta.url);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const components=['protocol','keeper','retention','replication'];
const DEFAULT_SIGNER='0xFfaa5fE1C38Aa538fd9B1A28D8CF8516fa3728Ad';
const fail=code=>{throw new Error(code);};

export function assessOperations(value,{deployment,now=Date.now()}={}){
 const reasons=[];
 if(value?.schemaVersion!==1||value?.allocationAuthority!=='contract-only')reasons.push('INVALID_OPERATIONS_SCHEMA');
 if(String(value?.chainId)!==String(deployment.chainId)||!same(value?.feeStrip,deployment.feeStrip))reasons.push('OPERATIONS_DEPLOYMENT_MISMATCH');
 if(!Number.isSafeInteger(value?.observedAt)||value.observedAt>now+5000||now-value.observedAt>60000)reasons.push('OPERATIONS_STALE');
 const checks=Object.fromEntries(components.map(name=>[name,value?.checks?.[name]?.ready===true&&value.checks[name].code==='READY']));
 for(const name of components)if(!checks[name])reasons.push(`${name.toUpperCase()}_NOT_READY`);
 if(value?.readyForNewSales!==true)reasons.push('NEW_SALES_PAUSED');
 return {ready:reasons.length===0,reasons,checks};
}

export function operationsTarget(origin,{direct=false,token}={}){
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail('INVALID_OPERATIONS_ORIGIN');
 if(direct&&(typeof token!=='string'||token.length<32))fail('DIRECT_GATEWAY_TOKEN_REQUIRED');
 return {url:new URL('/api/operations',url),options:{headers:direct?{authorization:`Bearer ${token}`}:{},redirect:'error',signal:AbortSignal.timeout(12000)}};
}

export async function inspectChain({client,deployment,evidence,signer,now=Date.now()}){
 if(!/^0x[0-9a-f]{40}$/i.test(signer))fail('INVALID_KEEPER_ADDRESS');
 if(deployment.chainId!==11155111||deployment.fundingCommitmentVersion!==1)fail('UNREVIEWED_DEPLOYMENT');
 const [chainId,head]=await Promise.all([client.getChainId(),client.getBlock({blockTag:'latest'})]);
 if(chainId!==11155111||!head.hash||typeof head.number!=='bigint')fail('CHAIN_IDENTITY_MISMATCH');
 if(typeof head.timestamp!=='bigint'||now/1000-Number(head.timestamp)>120||Number(head.timestamp)>now/1000+15)fail('RPC_HEAD_STALE');
 const pinned=['feeStrip','verifier','checkpoints'];
 const checks=await Promise.all(pinned.map(async name=>{
  const pin=evidence.contracts[name];
  if(!same(pin?.address,deployment[name]))fail('MANIFEST_EVIDENCE_MISMATCH');
  const code=await client.getBytecode({address:deployment[name],blockNumber:head.number});
  if(!code||!same(keccak256(code),pin.observedRuntimeHash))fail('DEPLOYMENT_CODE_MISMATCH');
  return name;
 }));
 const [balance,nonce,pendingNonce,nextSeriesId]=await Promise.all([
  client.getBalance({address:signer,blockNumber:head.number}),
  client.getTransactionCount({address:signer,blockNumber:head.number}),
  client.getTransactionCount({address:signer,blockTag:'pending'}),
  client.readContract({address:deployment.feeStrip,abi:parseAbi(['function nextSeriesId() view returns(uint256)']),functionName:'nextSeriesId',blockNumber:head.number}),
 ]);
 const canonical=await client.getBlock({blockNumber:head.number});
 if(!same(canonical.hash,head.hash))fail('OBSERVATION_REORG');
 if(nextSeriesId<1n)fail('INVALID_SERIES_COUNTER');
 return {chainId,head:Number(head.number),headHash:head.hash,headTimestamp:Number(head.timestamp),runtimePinsMatched:checks,
  keeper:{address:signer,balanceWei:balance.toString(),nonce,pendingNonce,hasPendingNonce:pendingNonce!==nonce,
   initialAllocationWei:'10000000000000000',initialAllocationMet:balance>=10000000000000000n},
  nextSeriesId:nextSeriesId.toString(),seriesEverActivated:(nextSeriesId-1n).toString()};
}

export async function verify({client,deployment,evidence,signer,origin,direct=false,token,fetcher=fetch,now=Date.now()}){
 const target=operationsTarget(origin,{direct,token});
 const result={checkedAt:new Date(now).toISOString(),scope:'Read-only runtime pins and operational snapshot; not checkpoint, backup restoration, public sale or participant acceptance.',ready:false};
 const [chain,api]=await Promise.allSettled([
  inspectChain({client,deployment,evidence,signer,now}),
  (async()=>{const response=await fetcher(target.url,target.options);if(response.status!==200){await response.body?.cancel();return {ready:false,httpStatus:response.status,reasons:['OPERATIONS_UNAVAILABLE']};}
   if(!response.headers.get('content-type')?.startsWith('application/json'))fail('INVALID_RESPONSE');
   const body=JSON.parse((await readBounded(response,32768)).toString());
   return {...assessOperations(body,{deployment,now}),httpStatus:response.status};})(),
 ]);
 result.chain=chain.status==='fulfilled'?chain.value:{error:'CHAIN_READBACK_FAILED'};
 result.operations=api.status==='fulfilled'?api.value:{ready:false,reasons:['OPERATIONS_READBACK_FAILED']};
 result.ready=chain.status==='fulfilled'&&result.operations.ready&&chain.value.keeper.balanceWei!=='0'&&!chain.value.keeper.hasPendingNonce;
 return result;
}

async function main(){
 const {values}=parseArgs({options:{origin:{type:'string',default:'https://usufruct-mu.vercel.app'},direct:{type:'boolean',default:false},keeper:{type:'string',default:DEFAULT_SIGNER}}});
 const deployment=JSON.parse(readFileSync(new URL('deployments/sepolia.json',root),'utf8'));
 const evidence=JSON.parse(readFileSync(new URL('docs/evidence/sepolia-deployment.json',root),'utf8'));
 const client=createPublicClient({transport:http(process.env.SEPOLIA_RPC_URL??deployment.rpcUrl,{timeout:12000,retryCount:0})});
 const result=await verify({client,deployment,evidence,signer:values.keeper,origin:values.origin,direct:values.direct,token:process.env.OPERATIONS_GATEWAY_TOKEN});
 console.log(JSON.stringify(result,null,2));process.exitCode=result.ready?0:2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error(JSON.stringify({error:'OPERATIONS_VERIFICATION_FAILED',ready:false}));process.exitCode=1;});
