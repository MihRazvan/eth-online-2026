import { formatClaims, integer, money, sharePercent } from "../amounts";
import type { Market } from "../types";

export function fruitColor(pair: string) {
  return pair.startsWith("WBTC")
    ? "#afbf61"
    : pair.startsWith("USDC")
      ? "#edcc58"
      : pair.startsWith("ARB")
        ? "#754466"
        : "#bd4432";
}
export function Fruit({
  pair = "",
  small = false,
}: {
  pair?: string;
  small?: boolean;
}) {
  return (
    <svg
      className={"fruit-glyph " + (small ? "small" : "")}
      viewBox="0 0 44 48"
      aria-hidden="true"
    >
      <path
        d="M22 14V3m0 7c2-5 6-6 10-5-1 4-5 6-10 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M22 14c-8-5-17 1-17 12 0 10 7 17 17 17s17-7 17-17c0-11-9-17-17-12Z"
        fill={fruitColor(pair)}
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}
export function Ticket() {
  return (
    <svg className="ticket-glyph" viewBox="0 0 26 20" aria-hidden="true">
      <path
        d="m3 2 21 3-2 14L1 16Z"
        fill="#d9bd88"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="m7 4-2 12"
        stroke="currentColor"
        strokeWidth=".8"
        strokeDasharray="1 2"
      />
    </svg>
  );
}
export function fruitMarkState(
  available: bigint,
  originalSupply: bigint,
  index: number,
): "empty" | "partial" | "full" {
  if (originalSupply <= 0n || available <= 0n) return "empty";
  const scaled = available * 10n;
  return scaled >= BigInt(index + 1) * originalSupply
    ? "full"
    : scaled > BigInt(index) * originalSupply
      ? "partial"
      : "empty";
}
export function FruitBand({ market }: { market: Market }) {
  const Q = BigInt(market.originalSupply),
    available = BigInt(market.availableClaims);
  return (
    <div
      className="fruit-band"
      aria-label={`${sharePercent(market.availableClaims, market.originalSupply)} percent of original claim supply currently offered`}
    >
      <div className="fruit-dots" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={
              fruitMarkState(available, Q, i) !== "empty"
                ? "fruit-dot filled"
                : "fruit-dot"
            }
            style={
              fruitMarkState(available, Q, i) !== "empty"
                ? {
                    background: fruitColor(market.pair),
                    opacity:
                      fruitMarkState(available, Q, i) === "partial" ? 0.5 : 1,
                  }
                : undefined
            }
          />
        ))}
      </div>
      <span>
        <b>{formatClaims(market.availableClaims)}</b> claims available ·{" "}
        {sharePercent(market.availableClaims, market.originalSupply)}% of Q
      </span>
    </div>
  );
}
export function CabinetPreview({
  markets,
  claims,
  connected,
  onConnect,
}: {
  markets: Market[];
  claims: Record<string, string>;
  connected: boolean;
  onConnect: () => void;
}) {
  const held = connected
    ? markets.filter((m) => BigInt(claims[m.id] ?? "0") > 0n)
    : [];
  return (
    <section className="cabinet-preview">
      <div className="section-top">
        <div>
          <h2>Your cabinet</h2>
          <p>
            Fee claims you hold. One agreed window; the unpaid income travels
            with them.
          </p>
        </div>
        <a className="text-link" href="#positions">
          Open cabinet ↗
        </a>
      </div>
      {!connected ? (
        <div className="cabinet-empty">
          <Ticket />
          <p>Connect your wallet to see your own fee claims.</p>
          <button onClick={onConnect}>Connect to view holdings</button>
        </div>
      ) : !held.length ? (
        <div className="cabinet-empty">
          <Ticket />
          <p>
            No fee claims in this wallet yet. Explore a position above to review
            its exact rights.
          </p>
        </div>
      ) : (
        <div className="specimen-grid">
          {held.map((m) => {
            const q = BigInt(claims[m.id]),
              payout =
                (q * BigInt(m.allocatedMicros)) / BigInt(m.originalSupply);
            return (
              <a
                key={m.id}
                href={"#market/" + m.id}
                className="cabinet-specimen"
              >
                <div className="specimen-top">
                  <Fruit pair={m.pair} />
                  <span>
                    specimen
                    <br />
                    no. {m.tokenId}
                  </span>
                </div>
                <h3>{m.pair}</h3>
                <p>
                  <b>{formatClaims(q)}</b> claims ·{" "}
                  {sharePercent(claims[m.id], m.originalSupply)}% of Q
                </p>
                <div className="specimen-rule" />
                <p>
                  {m.phase === "allocated"
                    ? "Ready to redeem"
                    : m.phase === "captured"
                      ? "Captured · proof allocation pending"
                      : m.phase === "matured"
                        ? "Period ended · capture pending"
                        : m.phase === "closed"
                          ? "Closed by recombination"
                          : "Earning period open"}
                </p>
                <strong className="specimen-value">
                  {m.phase === "allocated"
                    ? money(payout, 6) + " USDC"
                    : "Final amount unknown"}
                </strong>
                <small>Through block {integer(m.endBlock)}</small>
                <span className="specimen-open">Read the fee claim ↗</span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
