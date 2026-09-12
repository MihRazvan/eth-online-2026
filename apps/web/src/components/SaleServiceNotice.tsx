import { useState } from "react";
import type { SaleReadiness } from "../operations";

/** Service ownership stays distinct from wallet prerequisites and contract rights. */
export function SaleServiceNotice({ readiness, refresh, disabled }: {
  readiness?: SaleReadiness; refresh: () => Promise<unknown>; disabled: boolean;
}) {
  const [checking, setChecking] = useState(false), [error, setError] = useState("");
  const ready = readiness?.ready === true;
  return <section className={`sale-service-notice ${ready ? "service-ready" : "service-paused"}`} aria-label="New-sale service status">
    <div className="service-copy">
      <span className="source-tag">Project service check</span>
      <h2>{ready ? "New-sale service check passed" : "New sales are paused"}</h2>
      <p>{ready ? "The latest check verified endpoint preservation. Review your wallet and the exact sale terms before signing." : "The project team needs to verify fee-endpoint preservation before new offers can be funded or accepted."}</p>
      {!ready && <p className="fine">You can explore positions and inspect existing claims. Unaccepted-offer refunds and existing claims follow their own contract conditions.</p>}
    </div>
    <div className="service-next-step">
      <b>{ready ? "Next step: your wallet and terms" : "Next step: project team"}</b>
      <p className="fine">{ready ? "A service check does not guarantee fee income or a successful transaction." : "No wallet signature or extra USDC is needed to resolve this service pause."}</p>
      <button disabled={disabled || checking} onClick={async () => {
        setChecking(true); setError("");
        try { await refresh(); }
        catch { setError("The service check could not be refreshed. Try again shortly; no transaction was requested."); }
        finally { setChecking(false); }
      }}>{checking ? "Checking service…" : "Check service again"}</button>
      <span className="fine">Read-only check · no signature</span>
    </div>
    <details className="service-details"><summary>Service-check details</summary><p className="fine">{readiness?.reason ?? "No verified service observation is available for this deployment."}</p></details>
    {error && <p className="inline-warning service-error" role="status">{error}</p>}
  </section>;
}
