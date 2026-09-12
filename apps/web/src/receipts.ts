import type { TransactionProgress } from "./types";
const KEY = "usufruct:transaction-receipts:v1";
export type SavedReceipt = TransactionProgress & { updatedAt: number };
export function readReceipts(): SavedReceipt[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is SavedReceipt => !!row && typeof row === "object" && /^0x[a-fA-F0-9]{64}$/.test(row.hash) && /^0x[a-fA-F0-9]{40}$/.test(row.account) && /^0x[a-fA-F0-9]{40}$/.test(row.feeStrip) && Number.isSafeInteger(row.chainId) && ["pending", "confirmed", "failed", "replaced"].includes(row.stage) && typeof row.label === "string" && Number.isFinite(row.updatedAt)).slice(0, 20);
  } catch { return []; }
}
export function saveReceipt(progress: TransactionProgress): SavedReceipt[] {
  if (!progress.hash || !["pending", "confirmed", "failed", "replaced"].includes(progress.stage)) return readReceipts();
  const existing = readReceipts();
  const previous = existing.find((row) => row.hash === progress.hash && row.chainId === progress.chainId);
  const rows = [{ ...previous, ...progress, updatedAt: Date.now() }, ...existing.filter((row) => row.hash !== progress.hash || row.chainId !== progress.chainId)].slice(0, 20);
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* Wallet and chain remain authoritative if storage is disabled. */ }
  return rows;
}
