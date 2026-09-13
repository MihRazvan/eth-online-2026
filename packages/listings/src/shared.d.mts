import type {Address, Hex, TypedDataDefinition} from 'viem';
export interface ListingScope {chainId:number;feeStrip:Address;positionManager:Address;usdc:Address}
export interface SellerListing extends ListingScope {
  schemaVersion:1;seller:Address;tokenId:string;positionCommitment:Hex;originalSupply:string;
  buyerQuantity:string;proceedsMicros:string;endBlock:string;deadlineTimestamp:string;nonce:Hex;
}
export interface SignedListing {listingId:Hex;terms:SellerListing;signature:Hex}
export interface ListingCancellation {chainId:number;feeStrip:Address;seller:Address;listingId:Hex}
export interface SignedCancellation extends ListingCancellation {signature:Hex}
export interface ListingObservation extends SignedListing {
  status:'available'|'cancelled'|'expired'|'stale'|'unavailable';reason:string|null;
  observedBlock:string;observedHash:Hex;observedAt:string;
}
export const ORIGINAL_Q:bigint;
export const LISTING_INTENT:'NONBINDING_FUNDED_OFFER_REQUEST';
export function sameAddress(a:unknown,b:unknown):boolean;
export function exactKeys(value:unknown,names:string[]):void;
export function validateScope<T extends ListingScope>(scope:T):T;
export function validateTerms<T extends SellerListing>(terms:T,scope?:ListingScope):T;
export function listingTypedData(terms:SellerListing):TypedDataDefinition;
export function listingId(terms:SellerListing):Hex;
export function validateCancellation<T extends ListingCancellation>(value:T,scope?:ListingScope):T;
export function cancellationTypedData(value:ListingCancellation):TypedDataDefinition;
export function validateTiming(terms:SellerListing,block:{number:string|bigint;timestamp:string|bigint},options?:{publishing?:boolean}):void;
