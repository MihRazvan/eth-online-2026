import { useEffect, useState } from "react";
import type { FeeStripAdapter, Market, RecoveryResult } from "../types";
import { integer } from "../amounts";
const time = (value: number | null) =>
  value === null || !Number.isFinite(new Date(value).getTime())
    ? "Not observed"
    : new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
export function RecoveryPanel({
  adapter,
  market,
  sourceBlock,
}: {
  adapter: FeeStripAdapter;
  market: Market;
  sourceBlock: string;
}) {
  const [result, setResult] = useState<RecoveryResult | null>(null),
    [revision, setRevision] = useState(0),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setResult(null);
    setError("");
    const request =
      adapter.readRecovery?.(market.id) ??
      Promise.resolve({
        status: "unavailable",
        reason: "A recovery provider is not connected.",
      } as const);
    request
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active)
          setResult({
            status: "unavailable",
            reason: "Recovery observation could not be loaded.",
          });
      });
    return () => {
      active = false;
    };
  }, [adapter, market.id, sourceBlock, revision]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const observation =
    result && result.status !== "unavailable" ? result.observation : null;
  const stale =
    result?.status === "stale" ||
    (observation &&
      (observation.lastObservedAt === null ||
        now - observation.lastObservedAt > 120000));
  const canDownload =
    !!observation?.artifactDigest &&
    ["retained", "unavailable"].includes(observation.state) &&
    !!adapter.downloadRecoveryArtifact;
  const download = async () => {
    if (!adapter.downloadRecoveryArtifact) return;
    setBusy(true);
    setError("");
    try {
      const file = await adapter.downloadRecoveryArtifact(market.id);
      const url = URL.createObjectURL(
        new Blob([file.json], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="recovery-panel" aria-label="Historical proof recovery">
      <div className="section-top">
        <h2>Historical proof recovery</h2>
        <span className={"recovery-status " + (stale ? "stale" : "")}>
          {!result
            ? "Checking observation"
            : result.status === "unavailable"
              ? result.simulated
                ? "Fixture · no proof service"
                : "Unavailable"
              : stale
                ? "Stale observation"
                : "Observed"}
        </span>
      </div>
      <p className="recovery-intro">
        A retained witness helps recover the fee allocation at the exact
        endpoint. The contract verifies it; this service cannot decide your
        payout.
      </p>
      {result?.status === "unavailable" ? (
        <p className="recovery-unavailable">{result.reason}</p>
      ) : observation ? (
        <>
          {stale && (
            <p className="recovery-unavailable">
              These are last observed facts, not current guarantees. Refresh
              before relying on availability.
            </p>
          )}
          <dl className="recovery-facts">
            <div>
              <dt>Witness artifact</dt>
              <dd>
                {observation.artifactDigest &&
                ["retained", "unavailable"].includes(observation.state)
                  ? "Retained candidate"
                  : observation.state === "orphaned"
                    ? "Orphaned · not usable"
                    : "No retained artifact"}
              </dd>
              <small>
                {observation.copies} filesystem{" "}
                {observation.copies === 1 ? "copy" : "copies"} reported.
                Separate paths do not establish independent hosts or failure
                domains.
              </small>
            </div>
            <div>
              <dt>Endpoint hash checkpoint</dt>
              <dd>
                {observation.checkpointSaved
                  ? "Saved onchain · observed"
                  : "Not observed as saved"}
              </dd>
              <small>
                A saved block hash anchors the endpoint. It is not the storage
                proof or a finality guarantee.
              </small>
            </div>
            <div>
              <dt>Endpoint finality</dt>
              <dd>
                {observation.finalized && observation.finalityObserved
                  ? "Finalized at source · observed"
                  : "Finality not confirmed"}
              </dd>
              <small>
                Finality is separate from artifact retention and the onchain
                checkpoint.
              </small>
            </div>
            <div>
              <dt>Verified growth cache</dt>
              <dd>
                {observation.growthCached
                  ? "Cached onchain · observed"
                  : "Not observed as cached"}
              </dd>
              <small>
                The verifier cache is separate from saved proof bytes. Only
                contract verification authorizes allocation.
              </small>
            </div>
          </dl>
          <details className="recovery-scope">
            <summary>Exact recovery scope &amp; observation</summary>
            <dl>
              <div>
                <dt>Chain / series</dt>
                <dd>
                  {observation.chainId} / {observation.seriesId}
                </dd>
              </div>
              <div>
                <dt>Escrow contract</dt>
                <dd>{observation.feeStrip}</dd>
              </div>
              <div>
                <dt>Pool manager</dt>
                <dd>{observation.manager}</dd>
              </div>
              <div>
                <dt>Verifier</dt>
                <dd>{observation.verifier}</dd>
              </div>
              <div>
                <dt>Earning endpoint</dt>
                <dd>End of block {integer(observation.endBlock)}</dd>
              </div>
              <div>
                <dt>Endpoint hash</dt>
                <dd>{observation.endpointHash ?? "Not observed"}</dd>
              </div>
              <div>
                <dt>Artifact SHA-256</dt>
                <dd>{observation.artifactDigest ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Observation</dt>
                <dd>
                  Block {observation.lastObservedBlock ?? "unknown"} ·{" "}
                  {time(observation.lastObservedAt)}
                </dd>
              </div>
              <div>
                <dt>Observation block hash</dt>
                <dd>{observation.lastObservedHash ?? "Unavailable"}</dd>
              </div>
            </dl>
            <p className="fine">
              Observation freshness expires after two minutes, or sooner when
              the service reports an error or incomplete discovery. Downloading
              checks the current artifact digest and deployment metadata; it
              does not establish canonical proof validity.
            </p>
          </details>
        </>
      ) : null}
      <div className="recovery-actions">
        <button disabled={busy} onClick={() => setRevision((x) => x + 1)}>
          Refresh recovery status
        </button>
        <button disabled={busy || !canDownload} onClick={download}>
          {busy ? "Checking retained artifact…" : "Download proof JSON"}
        </button>
      </div>
      {error && (
        <p role="alert" className="recovery-error">
          {error}
        </p>
      )}
      <p className="fine">
        NFT return, reserve allocation and holder redemption remain independent
        steps. Missing proof does not erase unpaid fee claims.
      </p>
    </section>
  );
}
