import { useState } from "react";
import { deadlineDate, formatClaims, money, parseClaims } from "../amounts";
import { strategyStatus } from "../quotes";
import type { Action, MakerStrategy, Market } from "../types";
export interface QuoteReview {
  title: string;
  action: Action;
  lines: [string, string][];
  warning: string;
  button: string;
}
export function MakerStrategies({
  strategies,
  markets,
  disabled,
  onReview,
}: {
  strategies: MakerStrategy[];
  markets: Market[];
  disabled: boolean;
  onReview: (review: QuoteReview) => void;
}) {
  return (
    <section className="maker-strategies" aria-label="Your maker quotes">
      <div className="section-top">
        <h2>Your maker quotes</h2>
        <span className="source-tag">Aqua / SwapVM</span>
      </div>
      <p className="fine">
        Quotes share wallet inventory. Each capacity is independent; adding them
        would count the same funds more than once.
      </p>
      {strategies.length === 0 ? (
        <p className="fine">
          No identified maker quotes from this wallet. Published quotes will
          stay here after expiry, depletion or cancellation.
        </p>
      ) : (
        strategies.map((q) => {
          const m = markets.find((m) => m.id === q.seriesId);
          return (
            <article className="strategy-row" key={q.strategyHash}>
              <div className="strategy-title">
                <h3>
                  {q.claimsIn ? "Buy claims" : "Sell claims"}{" "}
                  <span>
                    {m?.pair ?? "Fee claims"} · series {q.seriesId}
                    <span className="strategy-reference">
                      Strategy{" "}
                      {q.strategyHash.startsWith("0x")
                        ? q.strategyHash.slice(0, 10) +
                          "…" +
                          q.strategyHash.slice(-6)
                        : q.strategyHash}
                    </span>
                  </span>
                </h3>
                <span
                  className={
                    "strategy-state " +
                    (BigInt(q.executableClaims) > 0n ? "executable" : "")
                  }
                >
                  {strategyStatus(q)}
                </span>
              </div>
              <dl className="strategy-amounts">
                <div>
                  <dt>Advertised lot</dt>
                  <dd>
                    {formatClaims(q.advertisedClaims)} <small>claims</small>
                  </dd>
                </div>
                <div>
                  <dt>Executable now</dt>
                  <dd>
                    {formatClaims(q.executableClaims)} <small>claims</small>
                  </dd>
                </div>
                <div>
                  <dt>USDC for advertised lot</dt>
                  <dd>{money(q.advertisedUSDC, 6)}</dd>
                </div>
              </dl>
              <div className="strategy-bottom">
                <details>
                  <summary>Exact strategy &amp; capacity limits</summary>
                  <dl>
                    <div>
                      <dt>Strategy hash</dt>
                      <dd>{q.strategyHash}</dd>
                    </div>
                    <div>
                      <dt>App</dt>
                      <dd>{q.app}</dd>
                    </div>
                    <div>
                      <dt>Claim token</dt>
                      <dd>{q.claimToken}</dd>
                    </div>
                    <div>
                      <dt>USDC token</dt>
                      <dd>{q.cashToken}</dd>
                    </div>
                    <div>
                      <dt>Expiry timestamp</dt>
                      <dd>{deadlineDate(q.expiresAt)}</dd>
                    </div>
                    <div>
                      <dt>Virtual output inventory</dt>
                      <dd>
                        {q.claimsIn
                          ? money(q.virtualOutput, 6) + " USDC"
                          : formatClaims(q.virtualOutput) + " claims"}
                      </dd>
                    </div>
                    <div>
                      <dt>Maker wallet output balance</dt>
                      <dd>
                        {q.claimsIn
                          ? money(q.walletOutput, 6) + " USDC"
                          : formatClaims(q.walletOutput) + " claims"}
                      </dd>
                    </div>
                    <div>
                      <dt>Aqua output allowance</dt>
                      <dd>
                        {q.claimsIn
                          ? money(q.allowanceOutput, 6) + " USDC"
                          : formatClaims(q.allowanceOutput) + " claims"}
                      </dd>
                    </div>
                  </dl>
                  <p className="fine">
                    Executable size is capped by the lot, remaining virtual
                    inventory, actual wallet balance, allowance and integer
                    rounding. It can change before confirmation.
                  </p>
                </details>
                <button
                  disabled={disabled || !q.cancellable}
                  onClick={() =>
                    onReview({
                      title: "Cancel maker quote",
                      action: {
                        type: "dockQuote",
                        strategyHash: q.strategyHash,
                        app: q.app,
                        claimToken: q.claimToken,
                        cashToken: q.cashToken,
                      },
                      lines: [
                        ["Strategy hash", q.strategyHash],
                        ["App", q.app],
                        ["Claim token", q.claimToken],
                        ["USDC token", q.cashToken],
                        [
                          "Direction",
                          q.claimsIn
                            ? "Maker buys claims"
                            : "Maker sells claims",
                        ],
                      ],
                      warning:
                        "This docks only the reviewed Aqua strategy. Wallet tokens and token approvals stay in place; no fee-claim reserve is withdrawn. A fill may complete before cancellation confirms. Refresh to see the final balances.",
                      button: "Cancel this maker quote",
                    })
                  }
                >
                  {q.cancellable
                    ? "Review quote cancellation"
                    : "Quote cancelled / unavailable"}
                </button>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
export function SellToBid({
  market,
  balance,
  disabled,
  onReview,
}: {
  market: Market;
  balance: string;
  disabled: boolean;
  onReview: (review: QuoteReview) => void;
}) {
  const [amount, setAmount] = useState("1"),
    [error, setError] = useState("");
  const bid = market.bid;
  if (!bid?.available)
    return (
      <p className="no-bid-note">
        No executable bid. Resale liquidity is not guaranteed.
      </p>
    );
  return (
    <form
      className="sell-to-bid"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          const q = parseClaims(amount);
          if (
            !bid?.available ||
            !bid.strategyHash ||
            !bid.ratioClaimUnits ||
            !bid.ratioUsdcUnits
          )
            throw new Error(
              "No executable bid. Resale liquidity is not guaranteed.",
            );
          if (
            q <= 0n ||
            q > BigInt(balance) ||
            q > BigInt(bid.executableClaims ?? "0")
          )
            throw new Error(
              "Choose a quantity within your balance and the executable bid capacity.",
            );
          const proceeds =
            (q * BigInt(bid.ratioUsdcUnits)) / BigInt(bid.ratioClaimUnits);
          if (proceeds <= 0n)
            throw new Error(
              "This amount rounds to zero USDC; choose a larger quantity.",
            );
          onReview({
            title: "Review claim sale",
            action: {
              type: "sellClaims",
              seriesId: market.id,
              quantity: q.toString(),
              minimumUSDC: proceeds.toString(),
              expiresAt: bid.expiresAt,
              strategyHash: bid.strategyHash,
            },
            lines: [
              ["Claims you sell", formatClaims(q)],
              ["Minimum USDC received", money(proceeds, 6) + " USDC"],
              ["Maker", bid.maker],
              ["Strategy hash", bid.strategyHash],
              ["Expires", deadlineDate(bid.expiresAt)],
            ],
            warning:
              "These claims transfer their share of all unpaid native-USDC income for the whole sold period to the buyer, including earlier accrued income. This sale does not transfer your separate NFT return right. The bid can change or become unavailable before confirmation.",
            button: "Confirm claim sale",
          });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h3>Sell to an executable bid</h3>
      <p className="fine">
        {bid?.available ? (
          <>
            Maker bid: up to {formatClaims(bid.executableClaims ?? "0")} claims
            now. Advertised lot: {formatClaims(bid.advertisedClaims ?? "0")}{" "}
            claims for {money(bid.ratioUsdcUnits ?? "0", 6)} USDC.
          </>
        ) : (
          "No executable bid. Resale liquidity is not guaranteed."
        )}
      </p>
      <div className="sell-bid-fields">
        <label>
          Claims to sell
          <input
            aria-label="Claims to sell"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button type="submit" disabled={disabled || !bid?.available}>
          Review claim sale
        </button>
      </div>
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
