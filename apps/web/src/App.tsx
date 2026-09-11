import { useEffect, useRef, useState } from "react";
import type {
  Action,
  FeeStripAdapter,
  Market,
  Scenario,
  Snapshot,
} from "./types";
import { FixtureAdapter } from "./fixtureAdapter";
import {
  integer,
  money,
  parseUsdc,
  sharePercent,
  validQuantity,
  parseClaims,
  formatClaims,
  claimCost,
  deadlineDate,
  CLAIM_UNIT,
} from "./amounts";

function Icon({
  name = "arrow",
  size = 18,
}: {
  name?: "arrow" | "back" | "lock" | "check" | "close" | "wallet" | "external";
  size?: number;
}) {
  const paths = {
    arrow: "M4 12h16m-6-6 6 6-6 6",
    back: "M20 12H4m6-6-6 6 6 6",
    lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4",
    check: "m5 12 4 4 10-10",
    close: "m6 6 12 12M6 18 18 6",
    wallet: "M3 6h17v15H3z M3 6V3h13v3 M15 11h6v5h-6z",
    external: "M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Tokens({ pair }: { pair: string }) {
  return (
    <span className="tokens" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r="18"
          fill={pair.startsWith("WBTC") ? "#ece2c8" : "#e1e4e7"}
        />
        {pair.startsWith("WBTC") ? (
          <path
            d="M14 8v20m4-20v20m-7-17h9c7 0 7 7 0 7h-7m0 0h8c7 0 7 7-1 7h-9"
            fill="none"
            stroke="#826322"
            strokeWidth="1.6"
          />
        ) : (
          <path d="m18 5 8 13-8 5-8-5zm0 20 8-5-8 11-8-11z" fill="#68717e" />
        )}
      </svg>
      <span>$</span>
    </span>
  );
}
function Pair({
  market,
}: {
  market: Pick<Market, "pair" | "tokenId" | "feeTier">;
}) {
  return (
    <span className="pair">
      <Tokens pair={market.pair} />
      <span>
        <b>{market.pair}</b>
        <small>
          Uniswap v4 · {market.feeTier} · NFT #{market.tokenId}
        </small>
      </span>
    </span>
  );
}
function Status({ market }: { market: Market }) {
  return (
    <span className={"range-status " + (market.inRange ? "" : "warning")}>
      {market.inRange ? "In range" : "Out of range"}
    </span>
  );
}
function Range({
  market,
  compact = false,
}: {
  market: Market;
  compact?: boolean;
}) {
  return (
    <div className={"range-view " + (compact ? "compact" : "")}>
      <div className="range-caption">
        <span>
          <Icon name="lock" size={12} /> Fixed price range
        </span>
        {!compact && <Status market={market} />}
      </div>
      <div className="range-track">
        <div className="range-fill" />
        <div className={"range-pin " + (!market.inRange ? "outside" : "")}>
          <span>{compact ? "Current price" : `$${market.currentPrice}`}</span>
        </div>
      </div>
      <div className="range-labels">
        <span>${market.lowerPrice}</span>
        <span>${market.upperPrice}</span>
      </div>
      {!compact && (
        <p className="fine">
          USDC per {market.pair.split(" / ")[0]}. Range and liquidity cannot
          change while fees are sold. Outside this band, the position earns no
          swap fees.
        </p>
      )}
    </div>
  );
}
function SplitReceipt({ market }: { market: Market }) {
  return (
    <div className="split-receipt">
      <div className="receipt-top">
        <span className="receipt-title">The position stays yours</span>
        <span className="nft-tag">NFT #{market.tokenId}</span>
        <Range market={market} compact />
      </div>
      <div className="receipt-bottom">
        <div>
          <span className="receipt-title">The fees can change hands</span>
          <strong>USDC income</strong>
        </div>
        <span className="receipt-date">
          {market.startDate.slice(0, 6)}–{market.endDate.slice(0, 6)}
          <br />
          <small>Exact cutoff: block {integer(market.endBlock)}</small>
        </span>
      </div>
    </div>
  );
}
function History({ market, fixture }: { market: Market; fixture: boolean }) {
  if (!fixture)
    return (
      <section className="history-section">
        <h2>Activity behind the income</h2>
        <p className="fine">
          Historical activity unavailable · Graph provider not connected
        </p>
        <p className="fine">
          No illustrative fee bars are shown in onchain mode. Historical
          analysis must identify its source interval and blocks; it cannot
          authorize payouts.
        </p>
      </section>
    );
  return (
    <section className="history-section">
      <div className="section-top">
        <div>
          <h2>Activity behind the income</h2>
          <p className="fine">
            Illustrative daily native USDC fees · previous 14 days
          </p>
        </div>
        <span className="source-tag">Fixture history</span>
      </div>
      <div
        className="history-chart"
        role="img"
        aria-label={
          "Illustrative daily USDC fees: " +
          market.history.join(", ") +
          ". Historical activity is not a forecast."
        }
      >
        {market.history.map((n, i) => (
          <div className="history-column" key={i}>
            <span style={{ height: `${n * 1.6}px` }} title={`${n} USDC`} />
            <small>
              {i === 0
                ? "29 Aug"
                : i === 6
                  ? "4 Sep"
                  : i === 13
                    ? "11 Sep"
                    : ""}
            </small>
          </div>
        ))}
      </div>
      <div className="history-foot">
        <span>
          Source blocks {integer(market.sourceFromBlock)}–
          {integer(market.sourceToBlock)}
        </span>
        <span>Includes fee-growth donations</span>
      </div>
      <p className="fine">
        Funded pool donations can inflate apparent activity. Direct transfers to
        escrow do not create fee entitlement. Graph analysis informs a price; it
        cannot authorize a payout.
      </p>
    </section>
  );
}
function Lifecycle({ market, held }: { market: Market; held: string }) {
  const afterCapture =
    market.phase === "captured" || market.phase === "allocated";
  const stages = [
    ["Fee capture", afterCapture ? "Captured" : "After cutoff", afterCapture],
    [
      "Original NFT",
      market.nftReturned
        ? "Returned"
        : afterCapture
          ? "Return available"
          : "In escrow",
      market.nftReturned,
    ],
    [
      "Proof allocation",
      market.phase === "allocated" ? "Allocated" : "Unresolved",
      market.phase === "allocated",
    ],
    [
      "Your redemption",
      market.phase === "allocated"
        ? BigInt(held) > 0n
          ? "Ready to redeem"
          : "No claims remaining"
        : "Waiting for proof",
      market.phase === "allocated" && BigInt(held) === 0n,
    ],
  ];
  return (
    <div className="lifecycle">
      {stages.map(([title, status, done], i) => (
        <div key={String(title)} className={done ? "done" : ""}>
          <span className="step-number">
            {done ? <Icon name="check" size={13} /> : i + 1}
          </span>
          <b>{title}</b>
          <small>{status}</small>
        </div>
      ))}
    </div>
  );
}
interface Review {
  title: string;
  action: Action;
  lines: [string, string][];
  warning: string;
  button: string;
}
export function App({ adapter }: { adapter: FeeStripAdapter }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [route, setRoute] = useState(location.hash.slice(1) || "market"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [quantity, setQuantity] = useState("1000"),
    [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [funding, setFunding] = useState(false),
    [fundAmount, setFundAmount] = useState("672"),
    [scenarioIncome, setScenarioIncome] = useState("840");
  const dialog = useRef<HTMLDialogElement>(null),
    lastFocus = useRef<HTMLElement | null>(null);
  const refresh = async () => setSnapshot(await adapter.load());
  useEffect(() => {
    let active = true;
    adapter
      .load()
      .then((s) => {
        if (active) setSnapshot(s);
      })
      .catch((e) => setError(String(e)));
    const change = () => {
      setRoute(location.hash.slice(1) || "market");
      setError("");
      setMessage("");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => {
      active = false;
      window.removeEventListener("hashchange", change);
    };
  }, [adapter]);
  useEffect(() => {
    if (review) {
      lastFocus.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      lastFocus.current?.focus();
    }
  }, [review]);
  const connect = async () => {
    setError("");
    try {
      await adapter.connect();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const begin = (r: Review) => {
    setError("");
    setMessage("");
    setReview(r);
  };
  const submit = async () => {
    if (!review) return;
    setBusy(true);
    setError("");
    try {
      const result = await adapter.execute(review.action);
      await refresh();
      setReview(null);
      setMessage(
        result.transactionHash
          ? `${result.description} Transaction: ${result.transactionHash}`
          : result.description,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!snapshot)
    return (
      <main className="loading">
        <h1>Opening FeeStrip</h1>
        <p role="status">Loading market and chain state…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const s = snapshot,
    fixture = adapter instanceof FixtureAdapter,
    connected = s.wallet.connected,
    wrongNetwork = connected && s.wallet.chainId !== s.chainId;
  const selected =
      s.markets.find((m) => m.id === route.replace("market/", "")) ??
      s.markets[0],
    detail = route.startsWith("market/"),
    positions = route === "positions",
    held = s.wallet.claims[selected?.id ?? ""] ?? "0";
  const filtered = s.markets.filter(
    (m) =>
      (filter === "all" ||
        (filter === "range" && m.inRange && m.phase === "active") ||
        (filter === "settling" && m.phase !== "active")) &&
      (m.pair + " " + m.tokenId).toLowerCase().includes(search.toLowerCase()),
  );
  const quantityOkay = validQuantity(quantity),
    quantityBase = quantityOkay ? parseClaims(quantity) : 0n,
    cost = claimCost(quantityBase, selected?.askMicros ?? "0"),
    quoteStale = BigInt(s.quote.expiresAt) < BigInt(s.timestamp),
    noQuote =
      !s.quote.available ||
      !selected ||
      BigInt(selected.availableClaims) === 0n;
  const canBuy =
    !!selected &&
    quantityOkay &&
    quantityBase <= BigInt(selected.availableClaims) &&
    !noQuote &&
    !quoteStale;
  const buy = () => {
    if (!selected) return;
    begin({
      title: "Review claim purchase",
      action: {
        type: "buyClaims",
        seriesId: selected.id,
        quantity: quantityBase.toString(),
        maximumPaymentMicros: cost.toString(),
        expiresAt: s.quote.expiresAt,
      },
      lines: [
        ["You pay", money(cost, 6) + " USDC"],
        ["You receive", formatClaims(quantityBase) + " fee claims"],
        [
          "Share of original Q",
          sharePercent(quantityBase.toString(), selected.originalSupply) +
            "% of " +
            formatClaims(selected.originalSupply),
        ],
        ["Maker", s.quote.maker],
        ["Quote expires", deadlineDate(s.quote.expiresAt)],
        ["Earning cutoff", "End of block " + integer(selected.endBlock)],
      ],
      warning:
        "These claims carry all unpaid income for the sold window, including income earned before this purchase. Income and resale liquidity are not guaranteed.",
      button: "Confirm claim purchase",
    });
  };
  const lifecycleAction = (
    type: "capture" | "withdrawNFT" | "settle" | "redeem" | "closeEarly",
    market: Market,
  ) => {
    const titles = {
      capture: "Capture actual fees",
      withdrawNFT: "Recover original NFT",
      settle: "Allocate fee reserve",
      redeem: "Redeem your USDC",
      closeEarly: "Recombine all rights",
    };
    begin({
      title: titles[type],
      action: { type, seriesId: market.id },
      lines: [
        ["Series", market.pair + " · NFT #" + market.tokenId],
        ["Exact earning cutoff", "End of block " + integer(market.endBlock)],
        ...(type === "redeem"
          ? ([
              [
                "Claims consumed",
                formatClaims(s.wallet.claims[market.id] ?? "0"),
              ],
              [
                "Payout",
                money(
                  (BigInt(s.wallet.claims[market.id] ?? "0") *
                    BigInt(market.allocatedMicros)) /
                    BigInt(market.originalSupply),
                  6,
                ) + " USDC",
              ],
            ] as [string, string][])
          : []),
      ],
      warning:
        type === "withdrawNFT"
          ? "The same original NFT returns after capture. The USDC reserve stays segregated while proof is pending; the residual beneficiary remains recorded."
          : type === "settle" && fixture
            ? "This fixture demonstrates the allocated state only. It does not generate or verify a historical proof."
            : type === "redeem"
              ? "Redemption uses the immutable original Q denominator with integer rounding down. Your claim tokens are consumed; other holders redeem independently."
              : "The action follows current contract state. Capture must be in a block strictly after N; proof allocation is a separate step.",
      button: fixture ? "Confirm fixture action" : "Confirm transaction",
    });
  };
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header>
        <a className="brand" href="#market" aria-label="FeeStrip market">
          <span className="brandmark" />
          feestrip
        </a>
        <nav aria-label="Main navigation">
          <a
            className={!positions ? "selected" : ""}
            aria-current={!positions ? "page" : undefined}
            href="#market"
          >
            Market
          </a>
          <a
            className={positions ? "selected" : ""}
            aria-current={positions ? "page" : undefined}
            href="#positions"
          >
            Your positions
          </a>
        </nav>
        <span className="network-label">
          {s.mode === "fixture" ? "Design sandbox" : s.network}
        </span>
        <button className="wallet-button" onClick={connect}>
          <Icon name="wallet" size={16} />
          {connected
            ? fixture
              ? "Fixture wallet"
              : s.wallet.address?.slice(0, 6) +
                "…" +
                s.wallet.address?.slice(-4)
            : fixture
              ? "Use fixture wallet"
              : "Connect wallet"}
        </button>
      </header>
      <main id="main-content">
        <div className="environment">
          <span className="fixture-indicator">
            {fixture ? "Deterministic fixtures" : "Onchain " + s.mode}
          </span>
          <span>
            {fixture ? "No live prices or transactions" : s.network}{" "}
            <span className="desktop-only">
              · Source block {integer(s.sourceBlock)}
            </span>
          </span>
          {BigInt(s.blockNumber) - BigInt(s.sourceBlock) > 100n && (
            <strong className="lag">
              Indexer lag:{" "}
              {integer(
                (BigInt(s.blockNumber) - BigInt(s.sourceBlock)).toString(),
              )}{" "}
              blocks
            </strong>
          )}
        </div>
        {wrongNetwork && (
          <div className="alert">
            <p>Wrong network. Switch to {s.network} before a transaction.</p>
            <button
              onClick={async () => {
                try {
                  await adapter.switchNetwork?.();
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Switch network
            </button>
          </div>
        )}
        {error && !review && (
          <div className="alert error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <Icon name="close" />
            </button>
          </div>
        )}
        {message && (
          <div className="alert success" role="status">
            <Icon name="check" />
            {message}
            <button aria-label="Dismiss status" onClick={() => setMessage("")}>
              <Icon name="close" />
            </button>
          </div>
        )}
        {!detail && !positions ? (
          <>
            <section className="intro">
              <div>
                <h1>
                  A market for
                  <br />
                  <span>future fees.</span>
                </h1>
                <p>
                  Buy a share of a Uniswap position’s USDC fees.
                  <br />
                  The position stays put. The income changes hands.
                </p>
              </div>
              {s.markets[0] ? (
                <SplitReceipt market={s.markets[0]} />
              ) : (
                <div className="split-receipt empty">
                  <h2>No active fee markets</h2>
                  <p>
                    Explore your supported positions to start a funded fee sale.
                  </p>
                  <a className="button" href="#positions">
                    Your positions <Icon />
                  </a>
                </div>
              )}
            </section>
            <section className="market">
              <div className="section-top">
                <h2>
                  Fee markets{" "}
                  <span>{String(filtered.length).padStart(2, "0")}</span>
                </h2>
                <div className="market-controls">
                  <div className="segmented" aria-label="Market filters">
                    {[
                      ["all", "All markets"],
                      ["range", "In range"],
                      ["settling", "Settling"],
                    ].map(([key, label]) => (
                      <button
                        aria-pressed={filter === key}
                        className={filter === key ? "active" : ""}
                        onClick={() => setFilter(key)}
                        key={key}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="search"
                    aria-label="Search markets"
                    placeholder="Search pair or NFT"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="table">
                <div className="table-head">
                  <span>Underlying position</span>
                  <span>Earning window ends</span>
                  <span>Ask / fee claim</span>
                  <span>Original supply Q</span>
                  <span>Position status</span>
                  <span />
                </div>
                {filtered.map((m) => (
                  <a
                    className="market-row"
                    href={"#market/" + m.id}
                    key={m.id}
                    aria-label={`Open ${m.pair} NFT ${m.tokenId}`}
                  >
                    <Pair market={m} />
                    <span data-label="Window ends">
                      {m.endDate}
                      <small>Block {integer(m.endBlock)}</small>
                    </span>
                    <span data-label="Ask / claim" className="numeric">
                      {BigInt(m.availableClaims) === 0n
                        ? "No quote"
                        : money(m.askMicros, 3)}
                      <small>native USDC</small>
                    </span>
                    <span data-label="Original Q">
                      {formatClaims(m.originalSupply)}
                      <small>
                        1 claim ={" "}
                        {sharePercent(CLAIM_UNIT.toString(), m.originalSupply)}%
                      </small>
                    </span>
                    <span>
                      <Status market={m} />
                      <small>
                        {m.phase === "active"
                          ? "Fixed through term"
                          : "Capture available"}
                      </small>
                    </span>
                    <Icon />
                  </a>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="empty">
                  <h3>No matching fee markets</h3>
                  <p>Try another pool pair, NFT number, or market filter.</p>
                  <button
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>
            <section className="understand">
              <h2>
                One position.
                <br />
                Two separate rights.
              </h2>
              <p>
                <b>The LP keeps the position.</b>
                <br />
                Its original NFT returns after fee capture. The range and
                liquidity stay fixed during the term.
              </p>
              <p>
                <b>Claim holders receive the fees.</b>
                <br />
                Each token carries its share of all unpaid USDC income in the
                exact sold window.
              </p>
            </section>
          </>
        ) : null}
        {detail && selected ? (
          <>
            <a className="back-link" href="#market">
              <Icon name="back" size={15} /> All fee markets
            </a>
            <div className="detail-heading">
              <div>
                <Pair market={selected} />
                <h1>
                  USDC fees.
                  <br />
                  <span>From this position.</span>
                </h1>
              </div>
              <div className="term-label">
                <span>
                  {selected.startDate} — {selected.endDate}
                </span>
                <b>End of block {integer(selected.endBlock)}</b>
                <small>
                  Dates are estimates. Blocks define the earning window.
                </small>
              </div>
            </div>
            <div className="detail-layout">
              <div className="detail-main">
                <section className="instrument">
                  <div className="section-top">
                    <h2>Behind this fee strip</h2>
                    <span className="nft-tag">
                      Original NFT #{selected.tokenId}
                    </span>
                  </div>
                  <Range market={selected} />
                  <dl className="instrument-facts">
                    <div>
                      <dt>Fixed liquidity</dt>
                      <dd>{integer(selected.liquidity)}</dd>
                    </div>
                    <div>
                      <dt>Original claim supply Q</dt>
                      <dd>{formatClaims(selected.originalSupply)}</dd>
                    </div>
                    <div>
                      <dt>Activation block</dt>
                      <dd>Block {integer(selected.startBlock)}</dd>
                    </div>
                    <div>
                      <dt>Native currency sold</dt>
                      <dd>USDC only</dd>
                    </div>
                  </dl>
                  <details>
                    <summary>Exact position &amp; ownership terms</summary>
                    <p className="fine">
                      Pool identifier: <code>{selected.poolId}</code>. Stored
                      ticks {selected.lowerTick} to {selected.upperTick}.
                      Pre-activation fees are cleared to the LP. Other-currency
                      fees and USDC outside the sold period belong to the
                      residual beneficiary. Retained fee claims own their
                      in-window share separately. NFT ownership does not
                      guarantee dollar value.
                    </p>
                  </details>
                </section>
                <History market={selected} fixture={fixture} />
                <section className="settlement-section">
                  <div className="section-top">
                    <h2>The path to redemption</h2>
                    <span className="source-tag">
                      {selected.phase === "active"
                        ? "Earning period"
                        : selected.phase === "matured"
                          ? "Cutoff reached"
                          : selected.phase === "captured"
                            ? "Proof pending"
                            : "Allocated"}
                    </span>
                  </div>
                  <Lifecycle market={selected} held={held} />
                  {(selected.phase === "captured" ||
                    selected.phase === "allocated") && (
                    <dl className="instrument-facts">
                      <div>
                        <dt>Actual captured USDC reserve</dt>
                        <dd>{money(selected.capturedMicros, 6)}</dd>
                      </div>
                      <div>
                        <dt>Sold-period allocation</dt>
                        <dd>
                          {selected.phase === "allocated"
                            ? money(selected.allocatedMicros, 6)
                            : "Unresolved · reserve preserved"}
                        </dd>
                      </div>
                      <div>
                        <dt>Residual USDC outside window</dt>
                        <dd>
                          {selected.phase === "allocated"
                            ? money(
                                BigInt(selected.capturedMicros) -
                                  BigInt(selected.allocatedMicros),
                                6,
                              )
                            : "Unresolved"}
                        </dd>
                      </div>
                      <div>
                        <dt>Original NFT #{selected.tokenId}</dt>
                        <dd>
                          {selected.nftReturned
                            ? "Returned to residual holder"
                            : "Return available after capture"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <p className="fine">
                    Capture, NFT return, proof allocation and redemption are
                    separate. A delayed prover cannot assign unresolved buyer
                    reserves to the seller. The captured NFT can return before
                    proof.
                  </p>
                  <div className="lifecycle-actions">
                    {selected.phase === "matured" && (
                      <button
                        onClick={() => lifecycleAction("capture", selected)}
                      >
                        Capture actual fees <Icon />
                      </button>
                    )}
                    {selected.phase === "captured" && (
                      <button
                        onClick={() => lifecycleAction("settle", selected)}
                      >
                        {fixture
                          ? "Preview fixture allocation"
                          : "Submit historical proof"}{" "}
                        <Icon />
                      </button>
                    )}
                    {selected.phase === "allocated" && BigInt(held) > 0n && (
                      <button
                        className="primary"
                        onClick={() => lifecycleAction("redeem", selected)}
                      >
                        Redeem {formatClaims(held)} claims <Icon />
                      </button>
                    )}
                    {fixture && selected.phase === "active" && (
                      <button
                        className="text-button"
                        onClick={async () => {
                          adapter.advance(selected.id);
                          await refresh();
                        }}
                      >
                        Fixture: advance beyond cutoff
                      </button>
                    )}
                  </div>
                </section>
              </div>
              <aside className="trade-panel">
                <div className="trade-header">
                  <h2>Buy fee claims</h2>
                  <span>Powered by SwapVM</span>
                </div>
                <p className="fine">
                  Your share includes all unpaid income from the entire sold
                  window.
                </p>
                <label htmlFor="quantity">
                  Claims to buy{" "}
                  <span>
                    {formatClaims(selected.availableClaims)} available
                  </span>
                </label>
                <div className="amount-input">
                  <input
                    id="quantity"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    aria-describedby="quantity-help"
                  />
                  <span>claims</span>
                </div>
                <p id="quantity-help" className="fine">
                  {quantityOkay
                    ? sharePercent(
                        quantityBase.toString(),
                        selected.originalSupply,
                      )
                    : "0.00"}
                  % of original {formatClaims(selected.originalSupply)} claims
                </p>
                <dl className="trade-facts">
                  <div>
                    <dt>Price per claim</dt>
                    <dd>{money(selected.askMicros, 6)} USDC</dd>
                  </div>
                  <div>
                    <dt>You pay</dt>
                    <dd>
                      {money(cost)} <small>USDC</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Break-even period fees</dt>
                    <dd>
                      {money(
                        quantityBase > 0n
                          ? (cost * BigInt(selected.originalSupply) +
                              quantityBase -
                              1n) /
                              quantityBase
                          : claimCost(
                              selected.originalSupply,
                              selected.askMicros,
                            ),
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="fine">
                  The whole series must earn this much USDC during the sold
                  window for this price to break even, before gas.
                </p>
                <div className="quote-info">
                  <span>Maker: {s.quote.maker}</span>
                  <span>Expires {deadlineDate(s.quote.expiresAt)}</span>
                  <span>
                    Balances are shared maker inventory, not a locked reserve.
                  </span>
                </div>
                {noQuote ? (
                  <div className="inline-warning">
                    No executable quote. Resale liquidity is not guaranteed.
                  </div>
                ) : quoteStale ? (
                  <div className="inline-warning">
                    Quote expired. Refresh before signing.
                  </div>
                ) : !quantityOkay ? (
                  <div className="inline-warning">
                    Enter a positive claim amount with at most 18 decimals.
                  </div>
                ) : quantityBase > BigInt(selected.availableClaims) ? (
                  <div className="inline-warning">
                    Quantity exceeds available maker inventory.
                  </div>
                ) : connected && cost > BigInt(s.wallet.usdcBalanceMicros) ? (
                  <div className="inline-warning">
                    Insufficient USDC for this purchase.
                  </div>
                ) : null}
                <button
                  className="primary wide"
                  disabled={
                    connected &&
                    (!canBuy ||
                      wrongNetwork ||
                      cost > BigInt(s.wallet.usdcBalanceMicros))
                  }
                  onClick={connected ? buy : connect}
                >
                  {connected
                    ? "Review purchase"
                    : fixture
                      ? "Use fixture wallet"
                      : "Connect wallet"}
                  <Icon />
                </button>
                <div className="scenario-box">
                  <h3>What would your claim earn?</h3>
                  <label htmlFor="scenario-income">
                    Scenario: total sold-period USDC
                  </label>
                  <input
                    id="scenario-income"
                    inputMode="decimal"
                    value={scenarioIncome}
                    onChange={(e) => setScenarioIncome(e.target.value)}
                  />
                  <ScenarioResult
                    income={scenarioIncome}
                    quantity={quantity}
                    supply={selected.originalSupply}
                    cost={cost}
                  />
                  <p className="fine">
                    An assumption you set, not a forecast. Fees can be zero if
                    the position leaves its range.
                  </p>
                </div>
              </aside>
            </div>
          </>
        ) : null}
        {positions ? (
          <>
            <section className="positions-intro">
              <h1>Your positions.</h1>
              <p>Keep the NFT. Put its future fees to work.</p>
            </section>
            {!connected ? (
              <div className="connect-state">
                <Icon name="wallet" size={36} />
                <h2>Your wallet holds the starting point.</h2>
                <p>
                  Connect to see supported hookless Uniswap v4 positions
                  containing native USDC, funded offers, and fee claims.
                </p>
                <button className="primary" onClick={connect}>
                  {fixture ? "Use fixture wallet" : "Connect wallet"} <Icon />
                </button>
              </div>
            ) : (
              <>
                <section className="position-list">
                  <div className="section-top">
                    <h2>Original positions</h2>
                    <span className="source-tag">
                      {fixture ? "Fixture wallet" : s.wallet.address}
                    </span>
                  </div>
                  {s.scenario === "no-positions" ? (
                    <div className="empty">
                      <h3>No supported positions</h3>
                      <p>
                        Only validated, nonempty, hookless canonical Uniswap v4
                        NFTs containing authentic USDC can be sold.
                      </p>
                    </div>
                  ) : (
                    s.positions.map((p) => {
                      const market = s.markets.find((m) => m.id === p.seriesId);
                      return (
                        <article className="position-entry" key={p.tokenId}>
                          <div className="position-title">
                            <Pair market={{ ...p, feeTier: "0.05%" }} />
                            <span className="source-tag">
                              {market
                                ? market.nftReturned
                                  ? "NFT returned"
                                  : "Held in escrow"
                                : "In your wallet"}
                            </span>
                          </div>
                          {market ? (
                            <>
                              <Range market={market} compact />
                              <Lifecycle
                                market={market}
                                held={s.wallet.claims[market.id] ?? "0"}
                              />
                              <p className="fine">
                                The original NFT stays fixed at ${p.lowerPrice}
                                –${p.upperPrice}. No range changes, liquidity
                                changes, fee collection, or withdrawal during
                                the active term.
                              </p>
                              <div className="position-buttons">
                                <a
                                  className="button"
                                  href={"#market/" + market.id}
                                >
                                  View fee strip <Icon />
                                </a>
                                {market.phase === "matured" && (
                                  <button
                                    onClick={() =>
                                      lifecycleAction("capture", market)
                                    }
                                  >
                                    Capture actual fees
                                  </button>
                                )}
                                {(market.phase === "captured" ||
                                  market.phase === "allocated") &&
                                  !market.nftReturned && (
                                    <button
                                      className="primary"
                                      onClick={() =>
                                        lifecycleAction("withdrawNFT", market)
                                      }
                                    >
                                      Recover NFT #{p.tokenId}
                                    </button>
                                  )}
                                {market.nftReturned && (
                                  <p className="fine">
                                    Residual beneficiary preserved.{" "}
                                    {market.phase === "captured"
                                      ? "USDC allocation is still unresolved."
                                      : "Residual USDC remains separately owed."}
                                  </p>
                                )}
                                {market.phase === "active" && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      lifecycleAction("closeEarly", market)
                                    }
                                  >
                                    Review early closure requirements
                                  </button>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="offer-columns">
                                <div>
                                  <h3>Sell a defined period of fees</h3>
                                  <p className="fine">
                                    Freeze this exact NFT, its range and
                                    liquidity. Pre-activation fees are cleared
                                    to you. A draft or approval alone never
                                    activates a sale.
                                  </p>
                                  <div className="mini-range">
                                    <Icon name="lock" size={14} /> $
                                    {p.lowerPrice} — ${p.upperPrice}{" "}
                                    <span>Fixed during term</span>
                                  </div>
                                </div>
                                <div className="funded-offer">
                                  <span className="range-status">
                                    Funded offer {fixture ? "· fixture" : ""}
                                  </span>
                                  <strong>
                                    {money(p.offer?.fundedMicros ?? "0")}{" "}
                                    <small>USDC upfront</small>
                                  </strong>
                                  <p className="fine">
                                    For {formatClaims(p.offer?.claims ?? "0")}{" "}
                                    of{" "}
                                    {formatClaims(
                                      p.offer?.originalSupply ??
                                        "10000000000000000000000",
                                    )}{" "}
                                    claims · ends block{" "}
                                    {integer(p.offer?.endBlock ?? "0")}
                                  </p>
                                  <p className="fine">
                                    You keep{" "}
                                    {formatClaims(
                                      (
                                        BigInt(
                                          p.offer?.originalSupply ??
                                            "10000000000000000000000",
                                        ) - BigInt(p.offer?.claims ?? "0")
                                      ).toString(),
                                    )}{" "}
                                    fee claims and the separate NFT return
                                    right.
                                  </p>
                                </div>
                              </div>
                              <div className="position-buttons">
                                <button
                                  className={p.approved ? "" : "primary"}
                                  onClick={() =>
                                    begin({
                                      title: "Approve NFT transfer",
                                      action: {
                                        type: "approvePosition",
                                        tokenId: p.tokenId,
                                      },
                                      lines: [
                                        ["NFT", p.pair + " #" + p.tokenId],
                                        [
                                          "Permission",
                                          "Allow escrow to transfer this NFT",
                                        ],
                                      ],
                                      warning:
                                        "Approval only allows NFT movement. It is not acceptance of commercial terms and does not activate or lock a sale.",
                                      button: "Approve NFT transfer",
                                    })
                                  }
                                  disabled={p.approved}
                                >
                                  {p.approved ? (
                                    <>
                                      <Icon name="check" /> NFT approved
                                    </>
                                  ) : (
                                    "1. Approve this NFT"
                                  )}
                                </button>
                                <button
                                  className={p.approved ? "primary" : ""}
                                  disabled={
                                    !p.approved || !p.offer || wrongNetwork
                                  }
                                  onClick={() => {
                                    if (p.offer)
                                      begin({
                                        title: "Accept funded fee sale",
                                        action: {
                                          type: "acceptOffer",
                                          tokenId: p.tokenId,
                                          offerId: p.offer.id,
                                          minimumProceedsMicros:
                                            p.offer.fundedMicros,
                                        },
                                        lines: [
                                          ["Original NFT", "#" + p.tokenId],
                                          [
                                            "Minimum proceeds",
                                            money(p.offer.fundedMicros, 6) +
                                              " USDC",
                                          ],
                                          [
                                            "Claims sold",
                                            formatClaims(p.offer.claims) +
                                              " / " +
                                              formatClaims(
                                                p.offer.originalSupply,
                                              ),
                                          ],
                                          [
                                            "Exact cutoff",
                                            "End of block " +
                                              integer(p.offer.endBlock),
                                          ],
                                          [
                                            "Offer deadline",
                                            deadlineDate(
                                              p.offer.deadlineTimestamp,
                                            ),
                                          ],
                                          [
                                            "Frozen price range",
                                            "$" +
                                              p.lowerPrice +
                                              " — $" +
                                              p.upperPrice,
                                          ],
                                        ],
                                        warning:
                                          "Acceptance atomically transfers funded USDC, clears old fees, escrows the exact NFT and fixes the earning baseline. You cannot change bands, liquidity, collect sold fees, or withdraw during the term.",
                                        button: "Accept exact funded terms",
                                      });
                                  }}
                                >
                                  2. Review funded sale <Icon />
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => setFunding(!funding)}
                                >
                                  Fund an offer
                                </button>
                              </div>
                              {funding && (
                                <form
                                  className="fund-form"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    try {
                                      const payment = parseUsdc(fundAmount);
                                      if (payment <= 0n)
                                        throw new Error(
                                          "Offer must be positive.",
                                        );
                                      begin({
                                        title: "Fund an exact offer",
                                        action: {
                                          type: "fundOffer",
                                          tokenId: p.tokenId,
                                          paymentMicros: payment.toString(),
                                          claims: "8000000000000000000000",
                                          endBlock:
                                            p.offer?.endBlock ??
                                            (
                                              BigInt(s.blockNumber) + 129000n
                                            ).toString(),
                                          deadlineTimestamp: (
                                            BigInt(s.timestamp) + 3600n
                                          ).toString(),
                                        },
                                        lines: [
                                          ["Escrow USDC", money(payment, 6)],
                                          ["Claims to buy", "8,000 of 10,000"],
                                          ["NFT", "#" + p.tokenId],
                                          [
                                            "Earning endpoint",
                                            "End of block " +
                                              integer(
                                                p.offer?.endBlock ??
                                                  (
                                                    BigInt(s.blockNumber) +
                                                    129000n
                                                  ).toString(),
                                              ),
                                          ],
                                          [
                                            "Offer deadline",
                                            deadlineDate(
                                              (
                                                BigInt(s.timestamp) + 3600n
                                              ).toString(),
                                            ),
                                          ],
                                        ],
                                        warning:
                                          "Funding escrows the buyer’s payment. Only the NFT owner can accept the exact offer; funding alone does not lock their NFT.",
                                        button: "Fund offer",
                                      });
                                    } catch (e) {
                                      setError((e as Error).message);
                                    }
                                  }}
                                >
                                  <label htmlFor="fund-amount">
                                    Upfront USDC for 8,000 claims
                                  </label>
                                  <input
                                    id="fund-amount"
                                    inputMode="decimal"
                                    value={fundAmount}
                                    onChange={(e) =>
                                      setFundAmount(e.target.value)
                                    }
                                  />
                                  <button type="submit">Review funding</button>
                                </form>
                              )}
                            </>
                          )}
                        </article>
                      );
                    })
                  )}
                </section>
                <section className="claim-holdings">
                  <div className="section-top">
                    <h2>Your fee claims</h2>
                    <span className="source-tag">Native USDC income</span>
                  </div>
                  {s.markets
                    .filter((m) => s.wallet.claims[m.id] !== undefined)
                    .map((m) => (
                      <div className="holding-row" key={m.id}>
                        <Pair market={m} />
                        <span>
                          {formatClaims(s.wallet.claims[m.id])}{" "}
                          <small>claims held</small>
                        </span>
                        <span>
                          {m.phase === "allocated"
                            ? BigInt(s.wallet.claims[m.id]) > 0n
                              ? "Redeemable"
                              : "Redeemed"
                            : m.phase === "captured"
                              ? "Proof pending"
                              : "Not yet redeemable"}
                          <small>
                            All unpaid sold-period income travels with claims
                          </small>
                        </span>
                        <a className="button" href={"#market/" + m.id}>
                          View claim <Icon />
                        </a>
                      </div>
                    ))}
                </section>
              </>
            )}
          </>
        ) : null}
        <section className="data-disclosure">
          <details>
            <summary>Data sources &amp; demo controls</summary>
            <p className="fine">
              {fixture
                ? "All positions, prices, balances and history shown here are deterministic fixtures. They are design and browser-test evidence only. No public-chain sale, Aqua execution, historical proof, or live Graph composition is implied."
                : "Onchain state authorizes actions. Graph analytics are contextual and may lag; verified receipt state must take precedence."}
            </p>
            <p className="fine">
              Current block {integer(s.blockNumber)} · Indexer source{" "}
              {integer(s.sourceBlock)} · Network {s.network}
            </p>
            {fixture && (
              <div className="demo-controls">
                <label htmlFor="scenario">
                  Fixture condition
                  <select
                    id="scenario"
                    value={s.scenario}
                    onChange={async (e) => {
                      adapter.setScenario(e.target.value as Scenario);
                      setError("");
                      await refresh();
                    }}
                  >
                    {[
                      ["normal", "Normal"],
                      ["wrong-network", "Wrong network"],
                      ["rejected-signature", "Rejected signature"],
                      ["insufficient-funds", "Insufficient funds"],
                      ["no-quotes", "No quotes"],
                      ["stale-quote", "Expired quote"],
                      ["transaction-failure", "Reverted transaction"],
                      ["indexer-lag", "Indexer lag"],
                      ["no-positions", "No supported positions"],
                    ].map(([v, t]) => (
                      <option value={v} key={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={async () => {
                    adapter.reset();
                    await refresh();
                    setError("");
                    setMessage("");
                    location.hash = "market";
                  }}
                >
                  Reset fixtures
                </button>
              </div>
            )}
          </details>
        </section>
      </main>
      <footer>
        <span>
          Uniswap v4 positions · Trading powered by SwapVM
          <br />
          <span>Integration acceptance: see project evidence</span>
        </span>
        <span>
          Variable income. No guaranteed return.
          <br />
          <a
            href="https://github.com/ScopeLift/fixed-fee-swap"
            target="_blank"
            rel="noreferrer"
          >
            Prior work: ScopeLift Fixed Fee Swap{" "}
            <Icon name="external" size={10} />
          </a>
        </span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) {
            setReview(null);
            setError("");
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const elements = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
            ),
          );
          const first = elements[0],
            last = elements[elements.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
        aria-labelledby="review-title"
      >
        <div className="dialog-header">
          <span className="source-tag">
            {fixture ? "Fixture transaction review" : "Transaction review"}
          </span>
          <button
            aria-label="Close transaction review"
            disabled={busy}
            onClick={() => {
              setReview(null);
              setError("");
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        {review && (
          <>
            <h2 id="review-title">{review.title}</h2>
            <dl className="review-lines">
              {review.lines.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="review-warning">{review.warning}</p>
            {error && (
              <p className="inline-warning" role="alert">
                {error}
              </p>
            )}
            {!connected ? (
              <button className="primary wide" onClick={connect}>
                {fixture ? "Use fixture wallet" : "Connect wallet"}
              </button>
            ) : (
              <button
                className="primary wide"
                disabled={busy || wrongNetwork}
                onClick={submit}
              >
                {busy ? "Awaiting confirmation…" : review.button}
                <Icon />
              </button>
            )}
            <p className="fine dialog-note">
              {fixture
                ? "Fixture only. No wallet signature, token transfer, or transaction hash is produced."
                : "Review the same terms in your wallet. A transaction can fail or be replaced before confirmation."}
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
function ScenarioResult({
  income,
  quantity,
  supply,
  cost,
}: {
  income: string;
  quantity: string;
  supply: string;
  cost: bigint;
}) {
  try {
    const total = parseUsdc(income),
      q = validQuantity(quantity) ? parseClaims(quantity) : 0n,
      payout = (total * q) / BigInt(supply),
      net = payout - cost;
    return (
      <dl className="scenario-results">
        <div>
          <dt>Your scenario payout</dt>
          <dd>{money(payout)}</dd>
        </div>
        <div>
          <dt>After purchase, before gas</dt>
          <dd className={net < 0n ? "negative" : ""}>{money(net)}</dd>
        </div>
      </dl>
    );
  } catch {
    return <p className="fine">Enter an amount with at most 6 decimals.</p>;
  }
}
