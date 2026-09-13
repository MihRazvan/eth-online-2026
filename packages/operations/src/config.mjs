import {readFileSync,mkdirSync,lstatSync,chmodSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {resolve,dirname,parse,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {normalizeConfig} from '../../settlement/src/chain.mjs';

const root=new URL('../../../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
export function privateDirectory(path){
 const absolute=resolve(path),base=parse(absolute).root;
 let current=base;
 for(const part of absolute.slice(base.length).split(sep).filter(Boolean)){
  current=resolve(current,part);
  try{mkdirSync(current,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  const stat=lstatSync(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('UNSAFE_DATA_PATH');
 }
 chmodSync(absolute,0o700);return absolute;
}
export function privateJSON(path,value){
 privateDirectory(dirname(path));const temporary=`${path}.${randomUUID()}.tmp`,fd=openSync(temporary,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temporary,path);
 const dir=openSync(dirname(path),'r');try{fsyncSync(dir);}finally{closeSync(dir);}
}
/** Deployment identity comes from committed evidence. Runtime secrets never alter contract pins. */
export function hostedConfig(env=process.env){
 const deployment=read('deployments/sepolia.json'),evidence=read('docs/evidence/sepolia-deployment.json');
 const codeHashes={poolManager:evidence.pins.poolManager};
 for(const name of ['feeStrip','verifier','checkpoints']){
  if(deployment[name].toLowerCase()!==evidence.contracts[name].address.toLowerCase())throw new Error('DEPLOYMENT_EVIDENCE_MISMATCH');
  codeHashes[name]=evidence.contracts[name].observedRuntimeHash;
 }
 const rpcUrls=[env.SEPOLIA_RPC_URL,env.SEPOLIA_BACKUP_RPC_URL].filter(Boolean);
 const base=normalizeConfig({chainId:11155111,fundingCommitmentVersion:deployment.fundingCommitmentVersion??0,genesisHash:'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',
  ...Object.fromEntries(['feeStrip','verifier','checkpoints','poolManager','usdc'].map(key=>[key,deployment[key]])),codeHashes,managerCodeHash:codeHashes.poolManager,rpcUrls});
 const directory=resolve(env.OPERATIONS_DATA_DIR??'/data');
 const port=Number(env.PORT??8789);if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('INVALID_PORT');
 if(typeof env.OPERATIONS_GATEWAY_TOKEN!=='string'||env.OPERATIONS_GATEWAY_TOKEN.length<32)throw new Error('GATEWAY_TOKEN_REQUIRED');
 const retention={...base,database:resolve(directory,'retention.sqlite'),artifactRoots:[resolve(directory,'proof-primary'),resolve(directory,'proof-secondary')]};
 const enabled=env.KEEPER_ENABLED==='true';
 if(env.KEEPER_ENABLED&&!['true','false'].includes(env.KEEPER_ENABLED))throw new Error('INVALID_KEEPER_ENABLED');
 if(enabled&&!env.KEEPER_EXPECTED_SIGNER)throw new Error('EXPECTED_KEEPER_SIGNER_REQUIRED');
 const keeper=env.KEEPER_EXPECTED_SIGNER?{...base,database:resolve(directory,'checkpoint.sqlite'),expectedSigner:env.KEEPER_EXPECTED_SIGNER,enabled,
  gasLimit:env.KEEPER_GAS_LIMIT??'80000',maxFeePerGas:env.KEEPER_MAX_FEE_WEI??'30000000000',maxPriorityFeePerGas:env.KEEPER_PRIORITY_FEE_WEI??'1000000000',
  maxTxCostWei:env.KEEPER_MAX_TX_COST_WEI??'2400000000000000',dailyBudgetWei:env.KEEPER_DAILY_BUDGET_WEI??'10000000000000000',minBalanceWei:env.KEEPER_MIN_BALANCE_WEI??'1000000000000000',intervalMs:4000}:null;
 const remote=env.PROOF_S3_ENDPOINT?{endpoint:env.PROOF_S3_ENDPOINT,bucket:env.PROOF_S3_BUCKET,region:env.PROOF_S3_REGION??'auto',
  accessKeyId:env.PROOF_S3_ACCESS_KEY_ID,secretAccessKey:env.PROOF_S3_SECRET_ACCESS_KEY,forcePathStyle:env.PROOF_S3_PATH_STYLE==='true'}:null;
 return {directory,port,retention,keeper,remote,listings:{chainId:deployment.chainId,feeStrip:deployment.feeStrip,positionManager:deployment.positionManager,usdc:deployment.usdc},gatewayToken:env.OPERATIONS_GATEWAY_TOKEN};
}
