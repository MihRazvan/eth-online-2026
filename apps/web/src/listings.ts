import { recoverTypedDataAddress } from "viem";
import { listingId, listingTypedData, validateTerms } from "../../../packages/listings/src/shared.mjs";
import type { ListingDirectory, SellerListing, SellerListingTerms } from "./listingTypes";
import type { Action } from "./types";

export type ListingScope = Pick<SellerListingTerms, "chainId" | "feeStrip" | "positionManager" | "usdc">;
const endpoint = "/api/listings";
const unavailable = "The listing directory is unavailable. Publishing needs the project listing service; no sale or NFT transfer has occurred.";

async function request(query = "", body?: unknown) {
  const response = await fetch(endpoint + query, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(body === undefined ? 4000 : 12000),
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(unavailable);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 256 * 1024) { await response.body?.cancel(); throw new Error(unavailable); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(unavailable);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 256 * 1024) throw new Error(unavailable); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Verify signed identity in the browser too; chain checks still precede funding. */
export async function verifiedListing(value: unknown, scope: ListingScope): Promise<SellerListing> {
  if (!value || typeof value !== "object") throw new Error(unavailable);
  const record = value as SellerListing;
  validateTerms(record.terms, scope);
  if (!/^0x[0-9a-fA-F]{130}$/.test(record.signature ?? "") || listingId(record.terms).toLowerCase() !== record.listingId?.toLowerCase()) throw new Error("Listing signature or identity is invalid.");
  const signer = await recoverTypedDataAddress({ ...listingTypedData(record.terms), signature: record.signature });
  if (signer.toLowerCase() !== record.terms.seller.toLowerCase()) throw new Error("Listing signer does not match the seller.");
  if (!["available", "cancelled", "expired", "stale", "unavailable"].includes(record.status)) throw new Error(unavailable);
  return record;
}
export async function readListingDirectory(scope: ListingScope, query = ""): Promise<ListingDirectory> {
  try {
    const body = await request(query);
    if (!Array.isArray(body.listings) || body.listings.length > 50) throw new Error(unavailable);
    const listings = await Promise.all(body.listings.map((row: unknown) => verifiedListing(row, scope)));
    return { status: "available", listings, nextCursor: body.nextCursor ?? null };
  } catch { return { status: "unavailable", listings: [], reason: unavailable }; }
}
export async function readSellerListing(id: string, scope: ListingScope): Promise<SellerListing> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new Error("Invalid listing identifier.");
  const body = await request("?listingId=" + encodeURIComponent(id));
  const record = await verifiedListing(body.listing, scope);
  if (record.listingId.toLowerCase() !== id.toLowerCase()) throw new Error("The listing service returned a different listing.");
  return record;
}
export async function publishSellerListing(terms: SellerListingTerms, signature: `0x${string}`, scope: ListingScope) {
  const id = listingId(terms);
  try {
    await request("", { operation: "publish", listing: { listingId: id, terms, signature } });
  } catch {
    // A lost response can follow a successful idempotent publish. Read the exact ID.
    const retained = await readSellerListing(id, scope).catch(() => null);
    if (!retained || retained.signature !== signature || retained.status !== "available") throw new Error(unavailable);
    return retained;
  }
  return readSellerListing(id, scope);
}
export async function cancelSellerListing(cancellation: { chainId: number; feeStrip: `0x${string}`; seller: `0x${string}`; listingId: `0x${string}`; signature: `0x${string}` }, scope: ListingScope) {
  try { await request("", { operation: "cancel", cancellation }); }
  catch { const record = await readSellerListing(cancellation.listingId, scope).catch(() => null); if (record?.status !== "cancelled") throw new Error("Listing withdrawal could not be confirmed. Check its current status before retrying. Existing funded offers are unchanged."); }
  const record = await readSellerListing(cancellation.listingId, scope);
  if (record.status !== "cancelled") throw new Error("The listing withdrawal has not been confirmed.");
}
export function assertListingFunding(record: SellerListing, action: Extract<Action, { type: "fundOffer" }>) {
  const t = record.terms;
  if (record.status !== "available" || record.listingId.toLowerCase() !== action.listingId?.toLowerCase() || t.tokenId !== action.tokenId || t.seller.toLowerCase() !== action.seller?.toLowerCase() || t.positionCommitment.toLowerCase() !== action.positionCommitment?.toLowerCase() || t.buyerQuantity !== action.claims || t.proceedsMicros !== action.paymentMicros || t.endBlock !== action.endBlock || t.deadlineTimestamp !== action.deadlineTimestamp) throw new Error("This listing is no longer available with the exact terms you reviewed. Review it again; any confirmed allowance remains.");
}
