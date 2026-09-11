import {createPublicClient,http,keccak256,encodeAbiParameters,parseAbi,zeroHash} from 'viem';
import {fail} from './store.mjs';

export const feeStripAbi=parseAbi([
 'function nextSeriesId() view returns (uint256)',
 'function verifier() view returns (address)', 'function poolManager() view returns (address)', 'function usdc() view returns (address)',
 'function series(uint256) view returns ((uint256 tokenId,address claim,address residualOwner,(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,int24 tickLower,int24 tickUpper,uint128 liquidity,uint64 activationBlock,uint64 endBlock,uint256 baselineX128,uint256 quantity,uint256 capturedUSDC,uint256 otherReserve,uint256 soldUSDC,uint256 redeemedQuantity,uint256 paidClaims,uint256 residualUSDC,bool captured,bool allocated,bool nftReturned,bool closed))',
]);
export const verifierAbi=parseAbi(['function chainId() view returns (uint256)','function poolManager() view returns (address)','function managerCodeHash() view returns (bytes32)','function checkpoints() view returns (address)','function storageSlots(bytes32,int24,int24,bool) pure returns (bytes32[4])','function endpointGrowth(bytes32) view returns (bool verified,uint256 value)']);
export const checkpointAbi=parseAbi(['function hashes(uint256) view returns (bytes32)']);
const address=/^0x[0-9a-f]{40}$/i,hash=/^0x[0-9a-f]{64}$/i;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const poolId=key=>keccak256(encodeAbiParameters([{type:'tuple',components:[{name:'currency0',type:'address'},{name:'currency1',type:'address'},{name:'fee',type:'uint24'},{name:'tickSpacing',type:'int24'},{name:'hooks',type:'address'}]}],[key]));
export function normalizeConfig(config){
 if(!config||![31337,11155111].includes(config.chainId))fail('UNSUPPORTED_CHAIN');
 for(const key of ['feeStrip','verifier','checkpoints','poolManager','usdc'])if(!address.test(config[key]??''))fail('INVALID_DEPLOYMENT_ADDRESS');
 for(const value of [config.genesisHash,config.managerCodeHash,...['feeStrip','verifier','checkpoints','poolManager'].map(k=>config.codeHashes?.[k])])if(!hash.test(value??'')||same(value,zeroHash))fail('MISSING_DEPLOYMENT_PIN');
 if(!Array.isArray(config.rpcUrls)||!config.rpcUrls.length||config.rpcUrls.length>3)fail('INVALID_RPC_CONFIGURATION');
 for(const url of config.rpcUrls){let parsed;try{parsed=new URL(url);}catch{fail('INVALID_RPC_CONFIGURATION');}
  const local=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
  if(!['http:','https:'].includes(parsed.protocol)||(!local&&parsed.protocol!=='https:')||(config.chainId===31337&&!local))fail('INVALID_RPC_CONFIGURATION');
 }
 if(config.chainId===11155111&&(!same(config.poolManager,'0xE03A1074c86CFeDd5C142C4F04F1a1536e203543')||!same(config.usdc,'0x1c7d4b196cb0c7b01d743fbc6116a902379c7238')))fail('NONCANONICAL_PUBLIC_DEPLOYMENT');
 const identity={chainId:String(config.chainId),genesisHash:config.genesisHash.toLowerCase(),managerCodeHash:config.managerCodeHash.toLowerCase(),codeHashes:Object.fromEntries(['feeStrip','verifier','checkpoints','poolManager'].map(k=>[k,config.codeHashes[k].toLowerCase()]))};
 for(const key of ['feeStrip','verifier','checkpoints','poolManager','usdc'])identity[key]=config[key].toLowerCase();
 if(!same(identity.codeHashes.poolManager,identity.managerCodeHash))fail('MANAGER_PIN_MISMATCH');
 return {...config,...identity,chainId:config.chainId,identity};
}
export const clientsFor=config=>config.rpcUrls.map(url=>createPublicClient({chain:{id:config.chainId,name:'Configured FeeStrip network',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[url]}}},transport:http(url,{timeout:8000,retryCount:0})}));
const read=(client,address,abi,functionName,args=[],blockNumber)=>client.readContract({address,abi,functionName,args,blockNumber});
export async function assertNetwork(client,config){
 const [chainId,genesis]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n})]);
 if(chainId!==config.chainId||!same(genesis.hash,config.genesisHash))fail('NETWORK_IDENTITY_CHANGED');
}
export async function observe(client,config){
 await assertNetwork(client,config);
 const head=await client.getBlock({blockTag:'latest'});
 const [codes,bindings,finalized]=await Promise.all([
  Promise.all(['feeStrip','verifier','checkpoints','poolManager'].map(async key=>[key,await client.getBytecode({address:config[key],blockNumber:head.number})])),
  Promise.all([
   read(client,config.feeStrip,feeStripAbi,'verifier',[],head.number),read(client,config.feeStrip,feeStripAbi,'poolManager',[],head.number),read(client,config.feeStrip,feeStripAbi,'usdc',[],head.number),
   read(client,config.verifier,verifierAbi,'chainId',[],head.number),read(client,config.verifier,verifierAbi,'poolManager',[],head.number),read(client,config.verifier,verifierAbi,'managerCodeHash',[],head.number),read(client,config.verifier,verifierAbi,'checkpoints',[],head.number),
  ]),
  client.getBlock({blockTag:'finalized'}).catch(()=>null),
 ]);
 if(codes.some(([key,code])=>!code||!same(keccak256(code),config.codeHashes[key])))fail('DEPLOYMENT_CODE_CHANGED');
 if(!same(bindings[0],config.verifier)||!same(bindings[1],config.poolManager)||!same(bindings[2],config.usdc)||bindings[3]!==BigInt(config.chainId)||!same(bindings[4],config.poolManager)||!same(bindings[5],config.managerCodeHash)||!same(bindings[6],config.checkpoints))fail('DEPLOYMENT_BINDINGS_CHANGED');
 if(finalized&&finalized.number>head.number)fail('FINALITY_INCONSISTENT');
 return {head,finalized};
}
async function mapBounded(items,fn,limit=8){const results=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const i=cursor++;results[i]=await fn(items[i]);}}));return results;}
export async function discover(client,config,observation,{known=[],pageSize=100}={}){
 const {head}=observation,next=await read(client,config.feeStrip,feeStripAbi,'nextSeriesId',[],head.number);
 if(next<1n||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000)fail('INVALID_SERIES_TERMS');
 const existing=known.filter(j=>BigInt(j.series_id)<next);
 // Endpoint finality does not finalize a later allocation/closure transaction.
 const ids=existing.map(j=>BigInt(j.series_id));
 const last=existing.reduce((max,j)=>BigInt(j.series_id)>max?BigInt(j.series_id):max,0n);
 let cursor=last+1n;
 for(let i=0;i<pageSize&&cursor<next;i++,cursor++)ids.push(cursor);
 const terms=await mapBounded(ids,async id=>{
  const s=await read(client,config.feeStrip,feeStripAbi,'series',[id],head.number);
  if(s.quantity===0n||s.liquidity===0n||s.endBlock<=s.activationBlock||s.activationBlock>head.number||s.tickLower>=s.tickUpper)fail('INVALID_SERIES_TERMS');
  const pool=poolId(s.key),currency0=same(s.key.currency0,config.usdc);
  if(!currency0&&!same(s.key.currency1,config.usdc))fail('INVALID_SERIES_CURRENCY');
  const [activation,slots]=await Promise.all([client.getBlock({blockNumber:s.activationBlock}),read(client,config.verifier,verifierAbi,'storageSlots',[pool,s.tickLower,s.tickUpper,currency0],head.number)]);
  return {chainId:String(config.chainId),genesisHash:config.genesisHash,feeStrip:config.feeStrip,verifier:config.verifier,manager:config.poolManager,managerCodeHash:config.managerCodeHash,checkpoints:config.checkpoints,
   seriesId:String(id),tokenId:String(s.tokenId),claim:s.claim.toLowerCase(),originalSupply:String(s.quantity),liquidity:String(s.liquidity),baselineX128:String(s.baselineX128),activationBlock:String(s.activationBlock),activationHash:activation.hash.toLowerCase(),endBlock:String(s.endBlock),poolId:pool,tickLower:s.tickLower,tickUpper:s.tickUpper,usdcIsCurrency0:currency0,slots:[...slots],lifecycle:s.closed?'closed':s.allocated?'allocated':s.captured?'captured':'active'};
 });
 await assertObservation(client,observation);
 return {terms,complete:cursor>=next};
}
export async function assertObservation(client,{head,finalized}){
 const canonical=await client.getBlock({blockNumber:head.number});
 if(!same(canonical.hash,head.hash))fail('DISCOVERY_REORG');
 if(finalized){const block=await client.getBlock({blockNumber:finalized.number});if(!same(block.hash,finalized.hash))fail('FINALITY_INCONSISTENT');}
}
export async function endpointObservation(client,config,job,{head,finalized}){
 const n=BigInt(job.terms.endBlock);
 const key=keccak256(encodeAbiParameters([{type:'uint256'},{type:'bytes32'},{type:'int24'},{type:'int24'},{type:'bool'}],[n,job.terms.poolId,job.terms.tickLower,job.terms.tickUpper,job.terms.usdcIsCurrency0]));
 const [endpoint,activation,checkpoint,cached]=await Promise.all([
  client.getBlock({blockNumber:n}),client.getBlock({blockNumber:BigInt(job.terms.activationBlock)}),
  read(client,config.checkpoints,checkpointAbi,'hashes',[n],head.number),
  read(client,config.verifier,verifierAbi,'endpointGrowth',[key],head.number),
 ]);
 if(!same(activation.hash,job.terms.activationHash))fail('ACTIVATION_ORPHANED');
 if(!same(checkpoint,zeroHash)&&!same(checkpoint,endpoint.hash))fail('CHECKPOINT_CONFLICT');
 return {hash:endpoint.hash.toLowerCase(),checkpointHash:same(checkpoint,zeroHash)?null:checkpoint.toLowerCase(),growthCached:cached[0],finalized:!!finalized&&finalized.number>=n};
}
