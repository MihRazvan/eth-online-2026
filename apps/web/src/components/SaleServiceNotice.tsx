import { useState } from "react";
import type { SaleReadiness } from "../operations";

/** An actionable pause, not an operator dashboard. Adapter gates remain authoritative. */
export function SaleServiceNotice({
  readiness,
  refresh,
  disabled,
}: {
  readiness?: SaleReadiness;
  refresh: () => Promise<unknown>;
  disabled: boolean;
}) {
  const [checking, setChecking] = useState(false),
    [error, setError] = useState("");
  if (readiness?.ready === true) return null;
  return (
    <section
      className="sale-service-notice service-paused"
      aria-label="New-sale service status"
    >
      <div className="service-copy">
        <h2>New sales are paused</h2>
        <p>
          The project team is restoring settlement services. Existing claims and
          unaccepted-offer refunds remain available under their contract
          conditions.
        </p>
        <p className="fine">
          No wallet signature or extra USDC is needed to resolve this pause.
        </p>
      </div>
      <div className="service-next-step">
        <button
          disabled={disabled || checking}
          onClick={async () => {
            setChecking(true);
            setError("");
            try {
              await refresh();
            } catch {
              setError(
                "Could not check availability. Try again shortly; no transaction was requested.",
              );
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? "Checking…" : "Check service again"}
        </button>
      </div>
      {error && (
        <p className="inline-warning service-error" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
