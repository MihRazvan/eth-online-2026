/** Signed advertisements never authorize custody, payment or claim issuance. */
export interface SellerListingTerms {
  schemaVersion: 1;
  chainId: number;
  feeStrip: `0x${string}`;
  positionManager: `0x${string}`;
  usdc: `0x${string}`;
  seller: `0x${string}`;
  tokenId: string;
  positionCommitment: `0x${string}`;
  originalSupply: string;
  buyerQuantity: string;
  proceedsMicros: string;
  endBlock: string;
  deadlineTimestamp: string;
  nonce: `0x${string}`;
}
export interface SellerListing {
  listingId: `0x${string}`;
  terms: SellerListingTerms;
  signature: `0x${string}`;
  status: "available" | "cancelled" | "expired" | "stale" | "unavailable";
  reason?: string | null;
  observedBlock?: string;
  observedHash?: string;
  observedAt?: string;
}
export interface ListingDirectory {
  status: "available" | "unavailable";
  listings: SellerListing[];
  nextCursor?: string | null;
  reason?: string;
}
