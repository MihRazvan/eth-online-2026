import { listingId, validateTerms } from "../../../packages/listings/src/shared.mjs";
import type { SellerListingTerms } from "./listingTypes";
const key = "usufruct.pending-listings.v1";
interface PendingListing { terms: SellerListingTerms; signature?: `0x${string}` }
function read(): PendingListing[] {
  try {
    const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(rows) || rows.length > 20) return [];
    return rows.filter(row => { try { validateTerms(row.terms); return row.signature === undefined || /^0x[0-9a-fA-F]{130}$/.test(row.signature); } catch { return false; } });
  } catch { return []; }
}
export function pendingListing(id: string) { return read().find(row => listingId(row.terms).toLowerCase() === id.toLowerCase()); }
export function pendingListingTerms(chainId: number, feeStrip: string, seller?: string) {
  return seller ? read().filter(row => row.terms.chainId === chainId && row.terms.feeStrip.toLowerCase() === feeStrip.toLowerCase() && row.terms.seller.toLowerCase() === seller.toLowerCase()).map(row => row.terms) : [];
}
export function savePendingListing(terms: SellerListingTerms, signature?: `0x${string}`) {
  const id = listingId(terms), rows = read().filter(row => listingId(row.terms) !== id);
  if (rows.length >= 20) throw new Error("Too many unfinished listing drafts. Resume an existing publication first.");
  const value = JSON.stringify([...rows, { terms, signature }]);
  try { localStorage.setItem(key, value); if (localStorage.getItem(key) !== value) throw new Error(); }
  catch { throw new Error("Enable browser storage for listing recovery before signing. No publication was sent."); }
}
export function clearPendingListing(id: string) {
  try { localStorage.setItem(key, JSON.stringify(read().filter(row => listingId(row.terms).toLowerCase() !== id.toLowerCase()))); } catch { /* Confirmed server state remains authoritative. */ }
}
