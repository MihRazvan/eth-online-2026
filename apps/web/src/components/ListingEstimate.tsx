import { useEffect, useRef, useState } from "react";
import type { PositionFeeEstimate } from "../feeEstimate";
import { money, parseUsdc } from "../amounts";

const decimal = (n: bigint) => `${n / 1_000_000n}.${(n % 1_000_000n).toString().padStart(6, "0")}`;
export function ListingEstimate({ tokenId, commitment, endBlock, currentBlock, blockSeconds = 12, percentage, onUse, estimateFees }: {
  tokenId: string; commitment?: string; endBlock: string; currentBlock: string; blockSeconds?: number; percentage: string;
  onUse: (value: string) => void; estimateFees?: (tokenId: string) => Promise<PositionFeeEstimate>;
}) {
  const reader = useRef(estimateFees); reader.current = estimateFees;
  const [history, setHistory] = useState<PositionFeeEstimate | null>(null), [loading, setLoading] = useState(false);
  const [assumption, setAssumption] = useState<string | null>(null), [discount, setDiscount] = useState("15");
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    let active = true; setHistory(null); setAssumption(null); setDetailsOpen(false);
    if (!reader.current) { setLoading(false); setDetailsOpen(true); return; }
    setLoading(true);
    reader.current(tokenId).then(result => { if (active) { setHistory(result); if (result.status === "unavailable") setDetailsOpen(true); } })
      .catch(() => { if (active) { setHistory({ status: "unavailable", code: "HISTORY_UNAVAILABLE" }); setDetailsOpen(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tokenId, commitment]);
  let projected: bigint | null = null;
  const observed = history?.status === "available" && (!commitment || history.positionCommitment.toLowerCase() === commitment.toLowerCase()) ? history : null;
  try {
    const remaining = BigInt(endBlock) - BigInt(currentBlock);
    if (observed && remaining > 0n && Number.isSafeInteger(blockSeconds) && blockSeconds > 0)
      projected = observed.sampleUsdcMicros * remaining * BigInt(blockSeconds) / observed.durationSeconds;
  } catch { /* Invalid draft endpoint has no projection. */ }
  const value = assumption ?? (projected === null ? "" : decimal(projected));
  let gross: bigint | null = null, suggested: bigint | null = null;
  try {
    if (!value.trim() || !/^\d+(\.\d{1,2})?$/.test(percentage) || !/^\d{1,2}$/.test(discount)) throw new Error();
    const share = Number(percentage), reduction = Number(discount);
    if (share <= 0 || share > 100 || reduction < 0 || reduction > 95) throw new Error();
    gross = parseUsdc(value) * BigInt(Math.round(share * 100)) / 10000n;
    suggested = gross * BigInt(100 - reduction) / 100n;
  } catch { /* Keep invalid or unavailable assumptions distinct from zero. */ }
  const useable = suggested !== null && suggested > 0n;
  return <section className="est listing-estimate" aria-label="Window fee estimate">
    <div className="esthead"><div><span className="tele">Estimated ask · your offered share</span>
      <div className="estval">{suggested === null ? "—" : money(suggested, 6).replace("$", "")} <small>USDC</small></div></div>
      <button className="estuse" type="button" disabled={!useable} onClick={() => { if (useable) onUse(decimal(suggested!)); }}>Use estimate</button></div>
    <div className="estimate-range" aria-label="Illustrative fee scenarios">
      {[50n, 100n, 150n].map(rate => <div key={String(rate)}><span className="estimate-bar" style={{ height: Number(rate) / 3 + "px" }} />
        <span className="tele">{rate === 100n ? "Your scenario" : `${rate}% of scenario`}</span>
        <strong>{gross === null ? "—" : money(gross * rate / 100n, 6)} USDC</strong></div>)}
    </div>
    <div className="estrow"><span className="tele">{assumption !== null ? "Your assumption" : loading ? "Reading recent fees…" : observed ? "Recent pool fee model" : "Add your fee assumption"}</span><span className="tele tele-sel">{discount}% discount</span></div>
    <p className="estnote">{observed && assumption === null ? "Projects the recent fee rate, assuming acceptance now. Includes donations; future fees can be zero." : "Choose a whole-window fee assumption to estimate an asking price. This does not predict or allocate your payout."}</p>
    <details open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>Adjust estimate & view basis</summary>
      <div className="field"><label htmlFor={`estimate-income-${tokenId}`}>Assumed whole-window fees (USDC)</label><input id={`estimate-income-${tokenId}`} inputMode="decimal" value={value} onChange={e => setAssumption(e.target.value)} placeholder="Enter an assumption" /></div>
      <div className="field"><label htmlFor={`estimate-discount-${tokenId}`}>Asking discount (%)</label><input id={`estimate-discount-${tokenId}`} inputMode="numeric" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
      {observed && <p className="fine">Observed range model: {money(observed.sampleUsdcMicros, 6)} USDC over {(Number(observed.durationSeconds) / 3600).toFixed(1)} hours, finalized blocks {observed.source.fromBlock.toLocaleString()}–{observed.source.toBlock.toLocaleString()}. Applies this position’s present liquidity to historical range fee growth. Continuous liquidity history is unverified.</p>}
      {!observed && !loading && <p className="fine">Recent history is unavailable for this position. An empty estimate does not mean zero fees.</p>}
      <p className="fine">The three bars are illustrative assumptions, not probabilities or a confidence interval. Your asking price changes only when you select Use estimate. The contract determines the actual payout.</p>
    </details>
  </section>;
}
