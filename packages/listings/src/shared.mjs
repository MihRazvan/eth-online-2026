import {hashTypedData, isAddress} from 'viem';

// Browser-safe: signatures advertise exact terms. FeeStrip does not consume them.
export const ORIGINAL_Q = 10000n * 10n ** 18n;
export const LISTING_INTENT = 'NONBINDING_FUNDED_OFFER_REQUEST';
const ZERO = `0x${'0'.repeat(40)}`;
const hex32 = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const address = value => typeof value === 'string' && isAddress(value, {strict:false}) && value.toLowerCase() !== ZERO;
export const sameAddress = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export function exactKeys(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length || names.some(name=>!Object.hasOwn(value,name))) throw new Error('INVALID_FIELDS');
}
function integer(value,max) {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) <= max;
}
export function validateScope(scope) {
  if (!scope || !Number.isSafeInteger(scope.chainId) || scope.chainId <= 0 || !['feeStrip','positionManager','usdc'].every(key=>address(scope[key]))) throw new Error('INVALID_SCOPE');
  return scope;
}
export function validateTerms(terms,scope) {
  exactKeys(terms,['schemaVersion','chainId','feeStrip','positionManager','usdc','seller','tokenId','positionCommitment','originalSupply','buyerQuantity','proceedsMicros','endBlock','deadlineTimestamp','nonce']);
  validateScope(terms);
  if (terms.schemaVersion !== 1 || !address(terms.seller) || !hex32(terms.positionCommitment) || /^0x0{64}$/i.test(terms.positionCommitment) || !hex32(terms.nonce)) throw new Error('INVALID_TERMS');
  for (const key of ['tokenId','originalSupply','buyerQuantity','proceedsMicros']) if (!integer(terms[key],2n**256n-1n) || BigInt(terms[key])===0n) throw new Error('INVALID_TERMS');
  for (const key of ['endBlock','deadlineTimestamp']) if (!integer(terms[key],2n**64n-1n)) throw new Error('INVALID_TERMS');
  if (BigInt(terms.originalSupply)!==ORIGINAL_Q || BigInt(terms.buyerQuantity)>ORIGINAL_Q || BigInt(terms.proceedsMicros)>1000n*10n**6n) throw new Error('INVALID_TERMS');
  if (scope) {validateScope(scope);if(scope.chainId!==terms.chainId || !['feeStrip','positionManager','usdc'].every(key=>sameAddress(scope[key],terms[key]))) throw new Error('WRONG_SCOPE');}
  return terms;
}
const domain = value => ({name:'usufruct Listing',version:'1',chainId:value.chainId,verifyingContract:value.feeStrip});
const listingFields = [
  ['intent','string'],['schemaVersion','uint32'],['positionManager','address'],['usdc','address'],['seller','address'],
  ['tokenId','uint256'],['positionCommitment','bytes32'],['originalSupply','uint256'],['buyerQuantity','uint256'],
  ['proceedsMicros','uint256'],['endBlock','uint64'],['deadlineTimestamp','uint64'],['nonce','bytes32'],
].map(([name,type])=>({name,type}));
export function listingTypedData(terms) {
  validateTerms(terms);
  const {chainId,feeStrip,...message}=terms;
  return {domain:domain(terms),types:{Listing:listingFields},primaryType:'Listing',message:{intent:LISTING_INTENT,...message}};
}
export function listingId(terms) { return hashTypedData(listingTypedData(terms)); }
export function validateCancellation(value,scope) {
  exactKeys(value,['chainId','feeStrip','seller','listingId']);
  if(!Number.isSafeInteger(value.chainId)||value.chainId<=0||!address(value.feeStrip)||!address(value.seller)||!hex32(value.listingId)) throw new Error('INVALID_CANCELLATION');
  if(scope&&(value.chainId!==scope.chainId||!sameAddress(value.feeStrip,scope.feeStrip))) throw new Error('WRONG_SCOPE');
  return value;
}
export function cancellationTypedData(value) {
  validateCancellation(value);
  return {domain:domain(value),types:{CancelListing:[{name:'intent',type:'string'},{name:'seller',type:'address'},{name:'listingId',type:'bytes32'}]},primaryType:'CancelListing',message:{intent:'WITHDRAW_NONBINDING_LISTING',seller:value.seller,listingId:value.listingId}};
}
export function validateTiming(terms,block,{publishing=false}={}) {
  const head=BigInt(block.number),time=BigInt(block.timestamp),end=BigInt(terms.endBlock),deadline=BigInt(terms.deadlineTimestamp);
  if(end<=head||deadline<time)throw new Error('EXPIRED');
  if(end<=head+32n||deadline<=time+60n)throw new Error('CLOSING_SOON');
  if(publishing&&(end>head+216000n||deadline>time+86400n))throw new Error('TERMS_TOO_DISTANT');
}
