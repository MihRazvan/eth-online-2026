export interface SaleReadiness { ready: boolean; reason: string }
/** Operational health only permits new commitments; it never authorizes payouts. */
export function validateOperations(body: unknown, scope: { chainId: number; feeStrip: string }, now = Date.now()): SaleReadiness {
  const unavailable = { ready: false, reason: "New sales are paused: endpoint checkpointing and recoverable proof storage are not verified. Existing claims and refunds remain available." };
  if (!body || typeof body !== "object") return unavailable;
  const value = body as Record<string, any>;
  if (value.schemaVersion !== 1 || value.chainId !== String(scope.chainId) || typeof value.feeStrip !== "string" || value.feeStrip.toLowerCase() !== scope.feeStrip.toLowerCase() || value.allocationAuthority !== "contract-only" || !Number.isSafeInteger(value.observedAt) || now - value.observedAt > 60000 || value.observedAt > now + 5000) return unavailable;
  if (value.checks?.protocol?.ready === false && value.checks.protocol.code === "CONTRACT_UPGRADE_REQUIRED") return { ready: false, reason: "New sales are paused while the reviewed-position contract upgrade is deployed. Existing claims and refunds remain available." };
  if (value.readyForNewSales !== true) return unavailable;
  for (const check of ["protocol", "keeper", "retention", "replication"]) if (value.checks?.[check]?.ready !== true || typeof value.checks[check].code !== "string") return unavailable;
  return { ready: true, reason: "Checkpointing and recoverable proof storage passed the latest operational check. Fee income remains uncertain." };
}
export async function readOperations(scope: { chainId: number; feeStrip: string }): Promise<SaleReadiness> {
  try {
    const response = await fetch("/api/operations", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Unavailable");
    return validateOperations(await response.json(), scope);
  } catch { return validateOperations(null, scope); }
}
