import {createHash} from 'node:crypto';
import {normalizeConfig} from '../../settlement/src/chain.mjs';
export class KeeperError extends Error { constructor(code){super(code);this.code=code;} }
export const fail=code=>{throw new KeeperError(code);};
export const safeError=error=>error instanceof KeeperError?error.code: 'KEEPER_OPERATION_UNAVAILABLE';
const integer=(value,min,max,code)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail(code);return value;};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function keeperConfig(input){
 const c=normalizeConfig(structuredClone(input));delete c.fingerprint;
 for(const key of ['feeStrip','verifier','checkpoints','poolManager','usdc','expectedSigner'])if(/^0x0{40}$/i.test(c[key]??''))fail('ZERO_DEPLOYMENT_ADDRESS');
 if(!/^0x[0-9a-f]{40}$/i.test(c.expectedSigner??''))fail('EXPECTED_SIGNER_REQUIRED');
 c.expectedSigner=c.expectedSigner.toLowerCase();
 if(typeof c.enabled!=='boolean')fail('EXPLICIT_ENABLED_REQUIRED');
 for(const key of ['gasLimit','maxFeePerGas','maxPriorityFeePerGas','maxTxCostWei','dailyBudgetWei','minBalanceWei']){
  if(!/^[1-9][0-9]*$/.test(c[key]??''))fail('INVALID_BUDGET');
  c[key]=String(c[key]);
 }
 if(BigInt(c.gasLimit)>150000n||BigInt(c.gasLimit)<25000n||BigInt(c.maxPriorityFeePerGas)>BigInt(c.maxFeePerGas)||BigInt(c.maxTxCostWei)>BigInt(c.dailyBudgetWei))fail('INVALID_BUDGET');
 c.pageSize=integer(c.pageSize??20,1,100,'INVALID_PAGE_SIZE');
 c.maxHeadAgeSeconds=integer(c.maxHeadAgeSeconds??120,30,600,'INVALID_HEAD_AGE');
 c.intervalMs=integer(c.intervalMs??4000,1000,30000,'INVALID_INTERVAL');
 c.replaceAfterBlocks=integer(c.replaceAfterBlocks??3,1,32,'INVALID_REPLACEMENT_POLICY');
 c.maxReplacements=integer(c.maxReplacements??3,0,8,'INVALID_REPLACEMENT_POLICY');
 // A transaction must enter the next block. At head N+256 it is already too late.
 c.broadcastMarginBlocks=integer(c.broadcastMarginBlocks??2,1,32,'INVALID_WINDOW_MARGIN');
 // Enablement controls observation versus signing, not the immutable financial policy.
 const {enabled,...binding}=c;
 const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
 return freeze({...c,fingerprint:fingerprint(binding)});
}
/** Recognize old bindings only for this exact normalized policy and either enablement state. */
export function legacyKeeperFingerprints(input){
 const legacy={...keeperConfig(input)};delete legacy.fingerprint;
 // Preserve the legacy object's field order: its original hash used JSON.stringify directly.
 return [false,true].map(enabled=>fingerprint({...legacy,enabled}));
}
