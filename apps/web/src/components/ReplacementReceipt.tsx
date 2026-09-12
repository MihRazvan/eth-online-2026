import { useState } from "react";
import type { FeeStripAdapter, TransactionProgress } from "../types";

export function ReplacementReceipt({ original, adapter, onResolved }: {
  original: TransactionProgress; adapter: FeeStripAdapter; onResolved: (rows: TransactionProgress[]) => Promise<void>;
}) {
  const [hash, setHash] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!adapter.reconcileReplacement || original.stage !== "pending") return null;
  return <details className="replacement-receipt">
    <summary>Replaced or cancelled in your wallet?</summary>
    <p className="fine">Paste the replacement hash from your wallet or block explorer. We verify the signed sender, chain, nonce and canonical receipt. On Sepolia, the replacement must also be finalized before another submission. A cancellation does not complete the original action.</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError("");
      try { await onResolved(await adapter.reconcileReplacement!(original, hash.trim())); }
      catch (error) { setError((error as Error).message); }
      finally { setBusy(false); }
    }}>
      <label>Replacement transaction hash<input aria-label={`Replacement transaction hash for ${original.hash}`} value={hash} onChange={(event) => setHash(event.target.value)} placeholder="0x…" maxLength={66} disabled={busy} required /></label>
      <button type="submit" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())}>{busy ? "Verifying replacement…" : "Check replacement receipt"}</button>
      {error && <p className="inline-warning" role="alert">{error}</p>}
    </form>
  </details>;
}
