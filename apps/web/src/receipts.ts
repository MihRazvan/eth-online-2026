import type { TransactionProgress } from "./types";
const KEY = "usufruct:transaction-receipts:v1";
export type SavedReceipt = TransactionProgress & { updatedAt: number };
// Never evict a duplicate-submission guard when another wallet generates history.
// New writes stop at this bound; existing guards remain readable even above it.
export const MAX_RECEIPT_GUARDS = 128;
// Authenticated public replacements can age out only after Ethereum finality.
// Browser storage and the configured RPC must remain trustworthy; a receipt log
// cannot protect against intentional deletion or a consensus finality failure.
export const guardsSubmission = (row: TransactionProgress) => row.stage === "pending" || (row.stage === "replaced" && !(typeof row.replacementFinalizedBlockNumber === "string" && /^\d+$/.test(row.replacementFinalizedBlockNumber) && /^0x[a-fA-F0-9]{64}$/.test(row.replacementFinalizedBlockHash ?? "")));
function retain(rows: SavedReceipt[]): SavedReceipt[] {
  let completed = 0;
  return rows.filter((row) => guardsSubmission(row) || completed++ < 20);
}
export function readReceipts(): SavedReceipt[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(rows)) return [];
    return retain(rows.filter((row): row is SavedReceipt => !!row && typeof row === "object" && /^0x[a-fA-F0-9]{64}$/.test(row.hash) && /^0x[a-fA-F0-9]{40}$/.test(row.account) && /^0x[a-fA-F0-9]{40}$/.test(row.feeStrip) && Number.isSafeInteger(row.chainId) && ["pending", "confirmed", "failed", "replaced"].includes(row.stage) && typeof row.label === "string" && Number.isFinite(row.updatedAt)));
  } catch { return []; }
}
export function saveReceipt(progress: TransactionProgress): SavedReceipt[] {
  if (!progress.hash || !["pending", "confirmed", "failed", "replaced"].includes(progress.stage)) return readReceipts();
  const existing = readReceipts();
  const previous = existing.find((row) => row.hash === progress.hash && row.chainId === progress.chainId);
  const rows = retain([{ ...previous, ...progress, updatedAt: Date.now() }, ...existing.filter((row) => row.hash !== progress.hash || row.chainId !== progress.chainId)]);
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* Wallet and chain remain authoritative if storage is disabled. */ }
  return rows;
}
