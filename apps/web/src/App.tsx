import type { SellerListing } from "./listingTypes";
import {
  ListingForm,
  ListingRows,
  ListingDetail,
  PendingListingDrafts,
} from "./components/ListingControls";
import {
  Chrome,
  Landing,
  InformationPage,
  MarketRow,
  Stencil,
  PrintStrip,
  WindowClock,
  ClaimSelection,
} from "./components/Stencil";
import { ReplacementReceipt } from "./components/ReplacementReceipt";
import { SaleServiceNotice } from "./components/SaleServiceNotice";
import { OfferForm } from "./components/OfferForm";
import { parsePositionRoute, positionRoute } from "./offerTerms";
import { readReceipts, saveReceipt } from "./receipts";
import type { TransactionProgress } from "./types";
import { Ticket } from "./components/Orchard";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { useEffect, useRef, useState } from "react";
import type {
  Action,
  FeeStripAdapter,
  Market,
  Scenario,
  Snapshot,
  Position,
  AnalysisResult,
} from "./types";
import { FixtureAdapter } from "./fixtureAdapter";
import { MakerStrategies, SellToBid } from "./components/QuoteControls";
import {
  EntitlementReceipt,
  FEE_CLAIM_RIGHTS,
} from "./components/EntitlementReceipt";
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
function Pair({
  market,
}: {
  market: Pick<Market, "pair" | "tokenId" | "feeTier">;
}) {
  return (
    <span className="pair">
      <Stencil seed={market.tokenId} className="small" />
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
          {market.priceIsIndicative ? " · indicative ratios" : ""}
        </span>
        {!compact && <Status market={market} />}
      </div>
      <div className="range-track">
        <div className="range-fill" />
        <div
          className={"range-pin " + (!market.inRange ? "outside" : "")}
          style={
            market.currentRangePercent === undefined
              ? undefined
              : { left: `${market.currentRangePercent}%` }
          }
        >
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
  if (market.phase === "closed")
    return (
      <p className="fine">
        All original rights were recombined and the original NFT returned. This
        series is closed.
      </p>
    );
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
function currentRoute() {
  const raw = location.hash.slice(1);
  if (!raw || raw === "/" || raw === "landing" || raw === "home") return "home";
  if (raw === "holdings" || raw === "/holdings") return "positions";
  if (raw === "/positions") return "market";
  return raw.startsWith("/") ? raw.slice(1) : raw;
}
export function App({ adapter }: { adapter: FeeStripAdapter }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [snapshotVersion, setSnapshotVersion] = useState(0),
    [route, setRoute] = useState(currentRoute),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [quantity, setQuantity] = useState("1000"),
    [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [funding, setFunding] = useState(false),
    [pinToken, setPinToken] = useState<string | null>(null),
    [pinStep, setPinStep] = useState(1),
    [listingLookup, setListingLookup] = useState<{
      id: string;
      listing?: SellerListing;
      error?: string;
      loading?: boolean;
      version?: number;
    }>({ id: "" }),
    [positionLookup, setPositionLookup] = useState(""),
    [findingPosition, setFindingPosition] = useState(false),
    [offerSelection, setOfferSelection] = useState<string | null>(null),
    [progress, setProgress] = useState<TransactionProgress | null>(null),
    [receipts, setReceipts] = useState(readReceipts),
    [scenarioIncome, setScenarioIncome] = useState("840"),
    [makerQuoteSeries, setMakerQuoteSeries] = useState<string | null>(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("usufruct-theme") === "light"
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("usufruct-theme", theme);
    } catch {}
  }, [theme]);
  const toggleTheme = () =>
    setTheme((value) => (value === "dark" ? "light" : "dark"));
  useEffect(() => {
    if (!route.startsWith("listing/") || !adapter.readListing) return;
    const id = route.slice(8);
    let active = true;
    setListingLookup({ id, loading: true, version: snapshotVersion });
    adapter
      .readListing(id)
      .then((listing) => {
        if (active) setListingLookup({ id, listing, version: snapshotVersion });
      })
      .catch((error) => {
        if (active)
          setListingLookup({
            id,
            error: (error as Error).message,
            version: snapshotVersion,
          });
      });
    return () => {
      active = false;
    };
  }, [adapter, route, snapshotVersion]);
  const dialog = useRef<HTMLDialogElement>(null),
    lastFocus = useRef<HTMLElement | null>(null);
  const refreshVersion = useRef(0),
    paused = useRef(false);
  paused.current = busy || !!review;
  const refresh = async () => {
    const version = ++refreshVersion.current;
    const next = await adapter.load();
    if (version === refreshVersion.current) {
      setSnapshot(next);
      setSnapshotVersion((value) => value + 1);
    }
    return next;
  };
  useEffect(
    () =>
      adapter.subscribeProgress?.((next) => {
        setProgress(next);
        if (next.hash) setReceipts(saveReceipt(next));
      }),
    [adapter],
  );
  useEffect(() => {
    let active = true,
      running = false;
    const tick = async () => {
      if (
        !active ||
        running ||
        document.visibilityState !== "visible" ||
        paused.current
      )
        return;
      running = true;
      try {
        await refresh();
      } catch {
        /* Preserve the last snapshot; action preflight always re-reads chain state. */
      } finally {
        running = false;
      }
    };
    const walletChanged = () => {
      ++refreshVersion.current;
      setError(
        "Wallet or network changed. Close any open review and review again for the current account.",
      );
      void refresh().catch(() => {});
    };
    const unsubscribe = adapter.subscribeWallet?.(walletChanged);
    const interval = window.setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      active = false;
      clearInterval(interval);
      unsubscribe?.();
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [adapter]);
  useEffect(() => {
    const target = parsePositionRoute(route);
    if (!target || !adapter.findPosition) return;
    let active = true;
    setPinStep(target.offerId ? 3 : 2);
    setPinToken(target.tokenId);
    setOfferSelection(target.offerId ?? null);
    setFindingPosition(true);
    adapter
      .findPosition(target.tokenId)
      .then(() => (active ? refresh() : undefined))
      .catch((error) => {
        if (active) setError((error as Error).message);
      })
      .finally(() => {
        if (active) setFindingPosition(false);
      });
    return () => {
      active = false;
    };
  }, [adapter, route]);
  useEffect(() => {
    if (!adapter.readTransaction || !snapshot?.wallet.address) return;
    let active = true;
    const pending = receipts.filter(
      (row) =>
        row.stage === "pending" &&
        row.chainId === snapshot.chainId &&
        row.feeStrip.toLowerCase() === snapshot.feeStrip?.toLowerCase() &&
        row.account.toLowerCase() === snapshot.wallet.address?.toLowerCase(),
    );
    Promise.all(
      pending.map(async (row) => {
        const stage = await adapter.readTransaction!(row.hash!);
        if (active && stage !== "pending")
          setReceipts(saveReceipt({ ...row, stage }));
      }),
    ).catch(() => {});
    return () => {
      active = false;
    };
  }, [adapter, snapshot]);
  useEffect(() => {
    let active = true;
    refresh().catch((e) => {
      if (active) setError(String(e));
    });
    const change = () => {
      setRoute(currentRoute());
      setError("");
      setMessage("");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => {
      active = false;
      ++refreshVersion.current;
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
  const copyLink = async (hash: string) => {
    const url = location.origin + location.pathname + hash;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(
        "Link copied. The other wallet can open the exact position or funded offer.",
      );
    } catch {
      setMessage("Copy this link: " + url);
    }
  };
  const begin = (r: Review) => {
    setError("");
    setMessage("");
    if (
      receipts.some(
        (row) =>
          row.stage === "pending" &&
          row.chainId === snapshot?.chainId &&
          row.feeStrip.toLowerCase() === snapshot?.feeStrip?.toLowerCase() &&
          row.account.toLowerCase() === snapshot?.wallet.address?.toLowerCase(),
      )
    ) {
      setError(
        "A broadcast transaction is still unresolved. Check Saved transaction receipts and your wallet, then refresh before starting another action. Do not repeat the payment.",
      );
      return;
    }
    setProgress(null);
    setReview({
      ...r,
      action: { ...r.action, reviewedAccount: snapshot?.wallet.address },
    });
  };
  const submit = async () => {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await adapter.execute(review.action);
      setReview(null);
      if (review.action.type === "publishListing" && result.listingId) {
        history.pushState(null, "", "#listing/" + result.listingId);
        setRoute("listing/" + result.listingId);
        window.scrollTo(0, 0);
      }
      if (review.action.type === "acceptOffer") {
        // Keep the confirmed receipt visible when opening the new holding.
        // A hashchange would clear it as part of ordinary navigation.
        history.pushState(null, "", "#positions");
        setRoute("positions");
        window.scrollTo(0, 0);
      }
      setMessage(
        result.transactionHash
          ? `${result.description} Transaction: ${result.transactionHash}`
          : result.description,
      );
      try {
        await refresh();
      } catch {
        setError(
          `${result.transactionHash ? "Transaction confirmed" : "Action completed"}, but the latest state could not be loaded. Refresh chain state before starting another action; do not repeat the completed action.`,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!snapshot) {
    const fixture = adapter instanceof FixtureAdapter;
    const intro = route === "home";
    const info = route === "privacy" || route === "terms";
    return (
      <div className={"app " + (intro ? "onlanding" : "")}>
        <Chrome
          route={route}
          theme={theme}
          onTheme={toggleTheme}
          onConnect={connect}
          walletLabel={fixture ? "Use fixture wallet" : "Connect wallet"}
        />
        <main id="main-content">
          {intro ? (
            <Landing
              fixture={fixture}
              network={
                adapter.mode === "local"
                  ? "Local development chain"
                  : "Ethereum Sepolia"
              }
              connected={false}
              onConnect={connect}
            />
          ) : info ? (
            <InformationPage page={route as "privacy" | "terms"} />
          ) : (
            <section className="loading-state">
              <Stencil seed="loading" className="loading-stencil" animate />
              <h1>OPENING THE SHEET</h1>
              <p role="status">Reading market and chain state…</p>
            </section>
          )}
          {error && (
            <p className="inline-warning" role="alert">
              {error}
            </p>
          )}
        </main>
        <footer>
          <span className="tele">
            usufruct ·{" "}
            {fixture
              ? "deterministic fixture preview"
              : "waiting for chain state"}
          </span>
          <nav aria-label="Information">
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a
              href="https://github.com/MihRazvan/eth-online-2026#prior-work-and-attribution"
              target="_blank"
              rel="noreferrer"
            >
              Source &amp; credits ↗
            </a>
          </nav>
        </footer>
      </div>
    );
  }
  const s = snapshot,
    fixture = adapter instanceof FixtureAdapter,
    connected = s.wallet.connected,
    wrongNetwork = connected && s.wallet.chainId !== s.chainId;
  const selected =
      s.markets.find((m) => m.id === route.replace("market/", "")) ??
      s.markets[0],
    detail = route.startsWith("market/"),
    listingPage = route.startsWith("listing/"),
    home = route === "home",
    information = route === "privacy" || route === "terms",
    positions = route === "positions",
    pin = route === "pin" || route.startsWith("pin/"),
    held = s.wallet.claims[selected?.id ?? ""] ?? "0";
  const listingReadCurrent =
    listingLookup.id === route.slice(8) &&
    listingLookup.version === snapshotVersion;
  const listingReading =
    !!adapter.readListing && (!listingReadCurrent || !!listingLookup.loading);
  const currentListing = adapter.readListing
    ? listingReadCurrent && !listingLookup.loading && !listingLookup.error
      ? listingLookup.listing
      : undefined
    : s.listingDirectory?.listings.find(
        (row) => row.listingId === route.slice(8),
      );
  const pinCandidates =
    s.scenario === "no-positions" ? [] : s.positions.filter((p) => !p.seriesId);
  const rawPinPosition =
    pinCandidates.find((p) => p.tokenId === pinToken) ??
    (parsePositionRoute(route) ? undefined : pinCandidates[0]);
  const pinPosition =
    rawPinPosition && offerSelection
      ? {
          ...rawPinPosition,
          offer: rawPinPosition.offers?.find(
            (offer) => offer.id === offerSelection,
          ),
        }
      : rawPinPosition;
  const linkedMarket = parsePositionRoute(route)
    ? s.markets.find(
        (market) => market.tokenId === parsePositionRoute(route)!.tokenId,
      )
    : undefined;
  const accountChanged =
    !!review?.action.reviewedAccount &&
    review.action.reviewedAccount.toLowerCase() !==
      s.wallet.address?.toLowerCase();
  const salesPaused = s.mode === "testnet" && !s.saleReadiness?.ready;
  const noGas = !fixture && connected && s.wallet.ethBalanceWei === "0";
  const visiblePositions = pin
    ? pinPosition
      ? [pinPosition]
      : []
    : s.positions.filter((p) => !!p.seriesId);
  const filtered = s.markets.filter(
    (m) =>
      (filter === "all" ||
        (filter === "range" && m.inRange && m.phase === "active") ||
        (filter === "settling" && m.phase !== "active")) &&
      (m.pair + " " + m.tokenId).toLowerCase().includes(search.toLowerCase()),
  );
  const selectedQuote = selected?.quote ?? s.quote;
  const quantityOkay = validQuantity(quantity),
    quantityBase = quantityOkay ? parseClaims(quantity) : 0n,
    cost =
      selectedQuote.ratioClaimUnits && selectedQuote.ratioUsdcUnits
        ? (quantityBase * BigInt(selectedQuote.ratioUsdcUnits) +
            BigInt(selectedQuote.ratioClaimUnits) -
            1n) /
          BigInt(selectedQuote.ratioClaimUnits)
        : claimCost(quantityBase, selected?.askMicros ?? "0"),
    quoteStale = BigInt(selectedQuote.expiresAt) < BigInt(s.timestamp),
    noQuote =
      !selectedQuote.available ||
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
        expiresAt: selectedQuote.expiresAt,
        strategyHash: selectedQuote.strategyHash,
      },
      lines: [
        ["You pay", money(cost, 6) + " USDC"],
        [
          "Minimum fee claims received",
          formatClaims(quantityBase) + " fee claims",
        ],
        [
          "Share of original Q",
          sharePercent(quantityBase.toString(), selected.originalSupply) +
            "% of " +
            formatClaims(selected.originalSupply),
        ],
        ["Maker", selectedQuote.maker],
        ["Quote expires", deadlineDate(selectedQuote.expiresAt)],
        ["Earning cutoff", "End of block " + integer(selected.endBlock)],
      ],
      warning:
        FEE_CLAIM_RIGHTS + " Income and resale liquidity are not guaranteed.",
      button: "Confirm claim purchase",
    });
  };
  const lifecycleAction = (
    type:
      | "capture"
      | "withdrawNFT"
      | "settle"
      | "redeem"
      | "closeEarly"
      | "withdrawResidual",
    market: Market,
  ) => {
    const titles = {
      withdrawResidual: "Withdraw residual fees",
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
            : type === "settle"
              ? "Allocation uses verified onchain endpoint growth when cached; otherwise it verifies retained historical proof. The contract computes the allocation. Unpaid claim reserves stay segregated until allocation succeeds."
              : type === "redeem"
                ? "Redemption uses the immutable original Q denominator with integer rounding down. Your claim tokens are consumed; other holders redeem independently."
                : "The action follows current contract state. Capture must be in a block strictly after N; proof allocation is a separate step.",
      button: fixture ? "Confirm fixture action" : "Confirm transaction",
    });
  };
  return (
    <div
      className={
        "app " +
        (home ? "onlanding" : "") +
        (pin ? " pin-stage-" + pinStep : "")
      }
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Chrome
        route={route}
        theme={theme}
        onTheme={toggleTheme}
        onConnect={connect}
        walletLabel={
          connected
            ? fixture
              ? "Fixture wallet"
              : s.wallet.address!.slice(0, 6) +
                "…" +
                s.wallet.address!.slice(-4)
            : fixture
              ? "Use fixture wallet"
              : "Connect wallet"
        }
      />
      <main id="main-content">
        <div className="environment">
          <span className="fixture-indicator">
            {fixture ? "Deterministic fixtures" : "Onchain " + s.mode}
          </span>
          <span>{fixture ? "No live prices or transactions" : s.network} </span>
          {BigInt(s.blockNumber) - BigInt(s.sourceBlock) > 100n && (
            <strong className="lag">
              Data is behind the network. Refresh before reviewing a
              transaction.
            </strong>
          )}
          {!fixture && (
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await refresh();
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Refresh chain state
            </button>
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
        {!home && !information && s.mode === "testnet" && (
          <SaleServiceNotice
            readiness={s.saleReadiness}
            refresh={refresh}
            disabled={busy || !!review}
          />
        )}
        {home && (
          <Landing
            fixture={fixture}
            network={s.network}
            connected={connected}
            onConnect={connect}
          />
        )}
        {information && <InformationPage page={route as "privacy" | "terms"} />}
        {listingPage && (
          <>
            <a className="back-link" href="#market">
              ← All positions
            </a>
            {currentListing ? (
              (() => {
                const listing = currentListing;
                return (
                  <div className="listing-layout">
                    <div>
                      <Stencil
                        seed={listing.terms.tokenId}
                        fill={
                          Number(
                            (BigInt(listing.terms.buyerQuantity) * 10000n) /
                              BigInt(listing.terms.originalSupply),
                          ) / 10000
                        }
                      />
                      <PrintStrip label="signed advertisement / custody checked separately" />
                    </div>
                    <div>
                      <ListingDetail
                        listing={listing}
                        snapshot={s}
                        disabled={busy || !!review || wrongNetwork}
                        onReview={begin}
                        onError={setError}
                      />
                      {!connected && (
                        <button className="primary" onClick={connect}>
                          {fixture ? "Use fixture wallet" : "Connect wallet"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <section className="empty">
                <h2>
                  {listingLookup.loading
                    ? "Reading listing"
                    : "Listing unavailable"}
                </h2>
                <p>
                  {listingLookup.error ??
                    s.listingDirectory?.reason ??
                    "This listing is not in the current directory. Refresh its source before funding."}
                </p>
                <button
                  onClick={() =>
                    refresh().catch((error) => setError(error.message))
                  }
                >
                  Refresh listing state
                </button>
              </section>
            )}
          </>
        )}
        {route === "market" ? (
          <>
            <section className="pagehead market-pagehead">
              <h1 className="display">MARKET</h1>
              <div className="tele">
                {s.network}
                <br />
                {s.markets.length} issued windows
              </div>
            </section>
            <p className="lede">
              Buy a share of one position’s unpaid USDC fees for one exact
              window. The claims carry the whole period’s unpaid income; the
              original NFT return right stays separate.
            </p>
            <section className="seller-listings">
              <div className="section-top">
                <h2>Seller listings</h2>
                <span className="tele">Signed terms · no custody yet</span>
              </div>
              {s.listingDirectory?.listings.length ? (
                <ListingRows
                  listings={s.listingDirectory.listings}
                  art={(tokenId) => <Stencil seed={tokenId} />}
                />
              ) : (
                <div className="listing-empty">
                  <p>
                    {s.listingDirectory?.status === "available"
                      ? "No seller listings yet. Publish exact terms for a buyer to fund."
                      : "The listing directory is unavailable. Issued fee claims below still come from chain state."}
                  </p>
                  <a className="button ghost" href="#pin">
                    Pin a seed
                  </a>
                </div>
              )}
            </section>
            <section className="market">
              <div className="section-top">
                <h2>
                  Fee claims{" "}
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
              <p className="fine inventory-key">
                Stencil fill shows executable claims as a fraction of original
                Q. Unavailable inventory is not evidence of a sale.
              </p>
              <div className="table stencil-rows">
                {filtered.map((m) => (
                  <MarketRow
                    key={m.id}
                    market={m}
                    held={connected ? (s.wallet.claims[m.id] ?? "0") : "0"}
                  />
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="empty">
                  <h3>
                    {s.markets.length
                      ? "No matching fee markets"
                      : "No fee sales yet"}
                  </h3>
                  <p>
                    {s.markets.length
                      ? "Try another pool pair, NFT number, or market filter."
                      : "A market appears when a position owner accepts a funded offer."}
                  </p>
                  {s.markets.length ? (
                    <button
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  ) : (
                    <a className="button" href="#pin">
                      Explore positions
                    </a>
                  )}
                </div>
              )}
            </section>
            <PrintStrip label="fixed original Q / native USDC / one window" />
          </>
        ) : null}
        {detail && selected ? (
          <>
            <a className="back-link" href="#market">
              <Icon name="back" size={15} /> All positions
            </a>
            <div className="detail-heading">
              <div className="detail-stencil">
                <Stencil
                  seed={selected.tokenId}
                  fill={
                    BigInt(selected.originalSupply) > 0n
                      ? Number(
                          (BigInt(selected.availableClaims) * 10000n) /
                            BigInt(selected.originalSupply),
                        ) / 10000
                      : 0
                  }
                />
                <span className="tele">
                  NFT {selected.tokenId} · executable fraction of Q
                </span>
              </div>
              <div>
                <Pair market={selected} />
                <h1>NFT {selected.tokenId}</h1>
                <p className="tele">One window · issued fee claims</p>
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
                <EntitlementReceipt
                  market={selected}
                  quantity={
                    connected ? (s.wallet.claims[selected.id] ?? "0") : null
                  }
                  chainId={s.chainId}
                  sourceBlock={s.sourceBlock}
                  feeStrip={s.feeStrip}
                  mode={s.mode}
                />
                <section className="instrument">
                  <div className="section-top">
                    <h2>The original position</h2>
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
                    {selected.baselineX128 && (
                      <p className="fine">
                        Cleared native-USDC fee-growth baseline X128:{" "}
                        <code>{selected.baselineX128}</code>
                      </p>
                    )}
                  </details>
                </section>
                {fixture ? (
                  <History market={selected} fixture />
                ) : (
                  <AnalysisPanel
                    adapter={adapter}
                    market={selected}
                    quantity={quantityBase.toString()}
                    price={cost.toString()}
                    hasQuote={!noQuote && !quoteStale}
                  />
                )}
                <RecoveryPanel
                  adapter={adapter}
                  market={selected}
                  sourceBlock={s.sourceBlock}
                />
                <section className="settlement-section">
                  <div className="section-top">
                    <h2>The path to redemption</h2>
                    <span className="source-tag">
                      {selected.phase === "active"
                        ? "Earning period"
                        : selected.phase === "closed"
                          ? "Closed"
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
                        <dt>USDC captured at collection</dt>
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
                          : "Allocate fee reserve"}{" "}
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
                <WindowClock market={selected} block={s.blockNumber} />
                <ClaimSelection
                  market={selected}
                  quantity={quantityBase}
                  onChange={setQuantity}
                />
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
                    <dd>
                      {noQuote
                        ? "Unavailable"
                        : money(selected.askMicros, 6) + " USDC"}
                    </dd>
                  </div>
                  <div>
                    <dt>You pay</dt>
                    <dd>
                      {noQuote ? "—" : money(cost)} <small>USDC</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Break-even period fees</dt>
                    <dd>
                      {noQuote
                        ? "—"
                        : money(
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
                  <span>Maker: {selectedQuote.maker}</span>
                  {selectedQuote.advertisedClaims && (
                    <span>
                      Advertised lot:{" "}
                      {formatClaims(selectedQuote.advertisedClaims)} claims ·
                      executable now:{" "}
                      {formatClaims(selectedQuote.executableClaims ?? "0")}{" "}
                      claims.
                    </span>
                  )}
                  {selectedQuote.available && (
                    <span>Expires {deadlineDate(selectedQuote.expiresAt)}</span>
                  )}
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
                    cost={canBuy ? cost : null}
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
        {(positions || pin) && (
          <PendingListingDrafts snapshot={s} onReview={begin} />
        )}
        {positions || pin ? (
          <>
            <section className="positions-intro">
              <div>
                <h1>{pin ? "PIN A SEED" : "HOLDINGS"}</h1>
                <p>
                  {pin
                    ? "Publish one exact window of your position’s future USDC fees."
                    : "Your fee claims, position return rights and open offers."}
                  <br />{" "}
                  {pin
                    ? "Listing leaves the NFT in your wallet. Only accepting a funded offer starts escrow."
                    : "Keep the original window in view. Harvest only after allocation is verified."}
                </p>
              </div>
              <span className="accession-label">
                {pin ? "accession form" : "collection ledger"}
                <br />{" "}
                {pinPosition && pin
                  ? "NFT no. " + pinPosition.tokenId
                  : "one window. separate rights."}
              </span>
            </section>
            {pin && (
              <nav className="pin-steps" aria-label="Pin workflow">
                <button
                  className={pinStep === 1 ? "on" : ""}
                  onClick={() => setPinStep(1)}
                >
                  1 · Choose a position
                </button>
                <button
                  className={pinStep === 2 ? "on" : ""}
                  disabled={!pinPosition}
                  onClick={() => setPinStep(2)}
                >
                  2 · Set your listing
                </button>
                <button
                  className={pinStep === 3 ? "on" : ""}
                  disabled={!pinPosition}
                  onClick={() => setPinStep(3)}
                >
                  3 · Funded offers{" "}
                  {pinPosition?.offers?.length ?? (pinPosition?.offer ? 1 : 0)}
                </button>
              </nav>
            )}

            {pin && linkedMarket && (
              <p className="inline-warning" role="status">
                This position has an activated sale.{" "}
                <a href={"#market/" + linkedMarket.id}>
                  View its issued fee claims
                </a>
                . Claims can be offered for resale from Holdings; execution
                requires a counterparty.
              </p>
            )}

            {connected && !fixture && (positions || pin) && (
              <section
                className="wallet-prerequisites"
                aria-label="Wallet prerequisites"
              >
                <h2>Your wallet</h2>
                <p>
                  {money(s.wallet.usdcBalanceMicros, 6)} test USDC ·{" "}
                  {s.wallet.ethBalanceWei === undefined
                    ? "ETH balance unavailable"
                    : (Number(s.wallet.ethBalanceWei) / 1e18).toPrecision(5) +
                      " ETH for gas"}
                  .
                </p>
                {s.mode === "testnet" && (
                  <p className="fine">
                    <a
                      href="https://faucet.circle.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get test USDC from Circle
                    </a>{" "}
                    (choose Ethereum Sepolia) ·{" "}
                    <a
                      href="https://ethereum.org/en/developers/docs/networks/#sepolia"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Find a Sepolia ETH faucet
                    </a>
                    . Faucet availability and limits can vary.
                  </p>
                )}
                {noGas && (
                  <p className="inline-warning">
                    Add ETH before onchain transactions. Listing signatures do
                    not require gas. USDC cannot pay Ethereum transaction fees.
                  </p>
                )}
                <p className="fine">
                  Use{" "}
                  {s.mode === "local"
                    ? "the local development chain and its test tokens"
                    : "Ethereum Sepolia and its authentic test USDC"}
                  . Check your wallet’s network and receive both test assets
                  before funding. Every transaction estimates gas before
                  requesting a signature; proof allocation may cost
                  substantially more than approval or funding.
                </p>
              </section>
            )}
            {connected &&
              !fixture &&
              (positions || pin) &&
              receipts.some(
                (row) =>
                  row.chainId === s.chainId &&
                  row.feeStrip.toLowerCase() === s.feeStrip?.toLowerCase() &&
                  row.account.toLowerCase() === s.wallet.address?.toLowerCase(),
              ) && (
                <details className="transaction-receipts">
                  <summary>Saved transaction receipts</summary>
                  <p className="fine">
                    Stored on this browser for this account and deployment.
                    Chain state controls available actions. Confirmed allowances
                    remain if a later signature was rejected.
                  </p>
                  {receipts
                    .filter(
                      (row) =>
                        row.chainId === s.chainId &&
                        row.feeStrip.toLowerCase() ===
                          s.feeStrip?.toLowerCase() &&
                        row.account.toLowerCase() ===
                          s.wallet.address?.toLowerCase(),
                    )
                    .map((row) => (
                      <article key={row.hash} className="receipt-row">
                        <b>
                          {row.label} · {row.stage}
                        </b>
                        {s.chainId === 11155111 ? (
                          <a
                            href={"https://sepolia.etherscan.io/tx/" + row.hash}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View transaction
                          </a>
                        ) : (
                          <code>{row.hash}</code>
                        )}
                        {row.replacementHash && (
                          <small>
                            Replacement:{" "}
                            {s.chainId === 11155111 ? (
                              <a
                                href={
                                  "https://sepolia.etherscan.io/tx/" +
                                  row.replacementHash
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                view transaction
                              </a>
                            ) : (
                              <code>{row.replacementHash}</code>
                            )}
                            .{" "}
                            {row.stage === "replaced"
                              ? "Its chain confirmation is checked again before another signature. Public replacements must be finalized."
                              : "The original submission remains guarded. Check the replacement receipt again before another action."}
                          </small>
                        )}
                        {row.offerId && row.action?.type === "fundOffer" && (
                          <a
                            href={positionRoute(
                              row.action.tokenId,
                              row.offerId,
                            )}
                          >
                            Share offer #{row.offerId} with the seller
                          </a>
                        )}
                        <ReplacementReceipt
                          original={row}
                          adapter={adapter}
                          onResolved={async (rows) => {
                            for (const next of rows)
                              setReceipts(saveReceipt(next));
                            setMessage(
                              "The original transaction was superseded. Its replacement is recorded; check the refreshed offer or holding before another action.",
                            );
                            try {
                              await refresh();
                            } catch {
                              setError(
                                "Replacement verified, but the latest state could not be loaded. Refresh before reviewing another action.",
                              );
                            }
                          }}
                        />
                        {row.label === "Token allowance" && (
                          <small>
                            Allowance only permits spending. It does not fund or
                            activate a sale, and can remain after cancellation.
                          </small>
                        )}
                        {row.action?.type === "fundOffer" &&
                          row.offerId &&
                          row.stage === "confirmed" && (
                            <small>
                              This receipt confirms escrow funding, not issued
                              claims. Check the offer’s current state. After
                              acceptance, open Holdings to find your claims and
                              publish a sell quote.
                            </small>
                          )}
                      </article>
                    ))}
                </details>
              )}
            {!connected && !pin ? (
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
                {positions && (
                  <section className="claim-holdings">
                    <div className="section-top">
                      <h2>
                        Your claims <small>fee claims</small>
                      </h2>
                      <span className="source-tag">Native USDC income</span>
                    </div>
                    {!s.markets.some(
                      (market) => s.wallet.claims[market.id] !== undefined,
                    ) && (
                      <div className="empty-claims">
                        <h3>No fee claims yet</h3>
                        <p>
                          Funded offers are escrowed payments, not claims.
                          Claims arrive only after the seller accepts an offer.
                        </p>
                        <a href="#market">
                          Browse the Orchard for issued claims <Icon />
                        </a>
                      </div>
                    )}
                    {s.markets
                      .filter((m) => s.wallet.claims[m.id] !== undefined)
                      .map((m) => (
                        <div className="holding-row" key={m.id}>
                          <Pair market={m} />
                          <span>
                            {formatClaims(s.wallet.claims[m.id])}{" "}
                            <small>fee claims held</small>
                          </span>
                          <span>
                            {BigInt(s.wallet.claims[m.id]) === 0n
                              ? "No unredeemed claims in this wallet"
                              : m.phase === "allocated"
                                ? "Ready to redeem"
                                : m.phase === "captured"
                                  ? "Proof allocation pending"
                                  : m.phase === "matured"
                                    ? "Capture pending"
                                    : "Earning period open"}
                            <small>
                              All unpaid sold-period income travels with claims
                            </small>
                          </span>
                          <div className="holding-actions">
                            <a className="button" href={"#market/" + m.id}>
                              Read claim &amp; recovery <Icon />
                            </a>
                            {m.phase !== "closed" && (
                              <button
                                className="button"
                                onClick={() =>
                                  setMakerQuoteSeries(
                                    makerQuoteSeries === m.id ? null : m.id,
                                  )
                                }
                              >
                                {BigInt(s.wallet.claims[m.id]) > 0n
                                  ? "Publish sell quote"
                                  : "Publish buy quote"}
                              </button>
                            )}
                          </div>
                          {m.phase !== "closed" &&
                            BigInt(s.wallet.claims[m.id]) > 0n && (
                              <SellToBid
                                market={m}
                                balance={s.wallet.claims[m.id]}
                                disabled={wrongNetwork}
                                onReview={begin}
                              />
                            )}
                          <EntitlementReceipt
                            market={m}
                            quantity={s.wallet.claims[m.id]}
                            chainId={s.chainId}
                            sourceBlock={s.sourceBlock}
                            feeStrip={s.feeStrip}
                            mode={s.mode}
                            compact
                          />
                          {makerQuoteSeries === m.id && (
                            <MakerQuote
                              market={m}
                              balance={s.wallet.claims[m.id]}
                              cashBalance={s.wallet.usdcBalanceMicros}
                              timestamp={s.timestamp}
                              onReview={begin}
                            />
                          )}
                        </div>
                      ))}
                  </section>
                )}
                {positions && (
                  <section
                    className="funded-offers"
                    aria-label="Your funded offers"
                  >
                    <div className="section-top">
                      <h2>Your funded offers</h2>
                      <span className="source-tag">
                        {money(
                          s.fundedOffers.reduce(
                            (sum, o) => sum + BigInt(o.fundedMicros),
                            0n,
                          ),
                          6,
                        )}{" "}
                        USDC in unaccepted offers
                      </span>
                    </div>
                    <p className="fine">
                      Unaccepted funding is separate from fee-claim reserves. An
                      expired offer still needs cancellation to return your
                      USDC.
                    </p>
                    {s.fundedOffers.length === 0 ? (
                      <p className="fine">
                        No USDC is waiting in your unaccepted offers.
                      </p>
                    ) : (
                      s.fundedOffers.map((offer) => (
                        <article className="funded-offer-row" key={offer.id}>
                          <div>
                            <b>
                              Offer #{offer.id} · NFT #{offer.tokenId}
                            </b>
                            {!fixture && (
                              <div className="offer-share-links">
                                <a
                                  href={positionRoute(offer.tokenId, offer.id)}
                                >
                                  Open seller review link
                                </a>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    copyLink(
                                      positionRoute(offer.tokenId, offer.id),
                                    )
                                  }
                                >
                                  Copy offer link
                                </button>
                              </div>
                            )}
                            <small>
                              {offer.expired
                                ? "Expired · funds recoverable"
                                : "Awaiting seller acceptance"}
                            </small>
                          </div>
                          <div>
                            <b>{money(offer.fundedMicros, 6)} USDC</b>
                            <small>
                              {formatClaims(offer.claims)} of{" "}
                              {formatClaims(offer.originalSupply)} claims
                            </small>
                            <small>Ends block {integer(offer.endBlock)}</small>
                          </div>
                          <button
                            disabled={wrongNetwork}
                            onClick={() =>
                              begin({
                                title: "Cancel funded offer",
                                action: {
                                  type: "cancelOffer",
                                  offerId: offer.id,
                                },
                                lines: [
                                  ["Offer", "#" + offer.id],
                                  ["Original NFT", "#" + offer.tokenId],
                                  [
                                    "USDC returned to your wallet",
                                    money(offer.fundedMicros, 6) + " USDC",
                                  ],
                                  ["Seller", offer.seller],
                                ],
                                warning:
                                  "The refund is confirmed only when cancellation succeeds onchain. If the seller accepts first, cancellation reverts. Cancelling this unaccepted offer does not redeem claims or take money from another series.",
                                button: fixture
                                  ? "Cancel fixture offer"
                                  : "Cancel offer and recover USDC",
                              })
                            }
                          >
                            Review cancellation
                          </button>
                        </article>
                      ))
                    )}
                  </section>
                )}
                {positions && (
                  <section className="owned-listings">
                    <div className="section-top">
                      <h2>Your listings</h2>
                      <span className="tele">Advertisements · not escrow</span>
                    </div>
                    {s.listingDirectory?.listings.some(
                      (row) =>
                        row.terms.seller.toLowerCase() ===
                        s.wallet.address?.toLowerCase(),
                    ) ? (
                      <ListingRows
                        listings={s.listingDirectory.listings.filter(
                          (row) =>
                            row.terms.seller.toLowerCase() ===
                            s.wallet.address?.toLowerCase(),
                        )}
                        art={(tokenId) => <Stencil seed={tokenId} />}
                      />
                    ) : (
                      <p className="fine">
                        No seller listings found for this wallet in the current
                        directory.
                      </p>
                    )}
                  </section>
                )}
                {positions && (
                  <MakerStrategies
                    strategies={s.strategies.filter(
                      (q) =>
                        q.maker.toLowerCase() ===
                        s.wallet.address?.toLowerCase(),
                    )}
                    markets={s.markets}
                    disabled={wrongNetwork}
                    onReview={begin}
                  />
                )}
                {pin && (
                  <section className="pin-selection">
                    <div className="pin-step-heading">
                      <i>i.</i>
                      <div>
                        <h2>Choose a position</h2>
                        <p>
                          A seed is one canonical Uniswap position. Review its
                          exact fee window before accepting a sale.
                        </p>
                      </div>
                    </div>
                    {adapter.findPosition && (
                      <form
                        className="position-lookup"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          setFindingPosition(true);
                          setError("");
                          setMessage("");
                          try {
                            const id =
                              await adapter.findPosition!(positionLookup);
                            const next = await refresh();
                            if (
                              !next.positions.some(
                                (position) => position.tokenId === id,
                              ) &&
                              !next.markets.some(
                                (market) => market.tokenId === id,
                              )
                            )
                              throw new Error(
                                "Position details could not be loaded. Check the NFT ID and try again.",
                              );
                            setPinToken(id);
                            location.hash = positionRoute(id);
                            setMessage(
                              `Found position #${id}. Finding a position does not approve or transfer it.`,
                            );
                          } catch (error) {
                            setError((error as Error).message);
                          } finally {
                            setFindingPosition(false);
                          }
                        }}
                      >
                        <label htmlFor="position-lookup">
                          NFT ID or Uniswap link
                        </label>
                        <div className="position-lookup-fields">
                          <input
                            id="position-lookup"
                            value={positionLookup}
                            onChange={(event) =>
                              setPositionLookup(event.target.value)
                            }
                            placeholder="39220 or a Sepolia v4 position link"
                            maxLength={300}
                            required
                            disabled={findingPosition || wrongNetwork}
                          />
                          <button
                            type="submit"
                            disabled={
                              findingPosition ||
                              wrongNetwork ||
                              !positionLookup.trim()
                            }
                          >
                            {findingPosition ? "Finding…" : "Find position"}
                          </button>
                        </div>
                        <p>{s.positionDiscoveryNotice}</p>
                      </form>
                    )}
                    {findingPosition && (
                      <p className="fine">
                        Loading the linked canonical position…
                      </p>
                    )}
                    {pinCandidates.length === 0 && !findingPosition && (
                      <div className="empty">
                        <h3>No supported positions to pin</h3>
                        <p>
                          Only validated, nonempty, hookless canonical Uniswap
                          v4 NFTs containing authentic USDC can be sold. Find a
                          position by its exact NFT ID or open the market to
                          read issued claims.
                        </p>
                        <a className="text-link" href="#market">
                          Explore the market ↗
                        </a>
                      </div>
                    )}
                    <fieldset className="tree-options">
                      <legend className="sr-only">
                        Choose a position to pin
                      </legend>
                      {pinCandidates.map((p) => (
                        <label
                          className={
                            pinPosition?.tokenId === p.tokenId
                              ? "tree-option chosen"
                              : "tree-option"
                          }
                          key={p.tokenId}
                        >
                          <input
                            type="radio"
                            name="pin-position"
                            checked={pinPosition?.tokenId === p.tokenId}
                            onChange={() => {
                              setPinStep(2);
                              setPinToken(p.tokenId);
                              setOfferSelection(null);
                              if (!fixture)
                                location.hash = positionRoute(p.tokenId);
                              setFunding(false);
                            }}
                          />
                          <Stencil seed={p.tokenId} />
                          <span>
                            <b>{p.pair}</b>{" "}
                            {p.feeTier ?? "Fee tier unavailable"}{" "}
                            <small>#{p.tokenId}</small>
                          </span>
                          <span>
                            {p.ownedByWallet === false
                              ? "Other wallet · offer target"
                              : "In your wallet"}
                            <small>
                              Range ${p.lowerPrice}–${p.upperPrice}
                            </small>
                          </span>
                          <span>
                            {p.offer
                              ? "Funded offer available"
                              : "No funded offer yet"}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  </section>
                )}
                <section
                  hidden={pin && !!linkedMarket}
                  className={
                    "position-list " +
                    (pin ? "pin-workflow" : "cabinet-positions")
                  }
                >
                  <div className="section-top">
                    <h2>{pin ? "Selected position" : "Your seeds"}</h2>
                    <span className="source-tag address">
                      {fixture ? "Fixture wallet" : s.wallet.address}
                    </span>
                  </div>
                  {s.scenario === "no-positions" ||
                  visiblePositions.length === 0 ? (
                    <div className="empty">
                      <h3>
                        {pin
                          ? "No supported positions to pin"
                          : "No escrowed seeds in this wallet"}
                      </h3>
                      <p>
                        Only validated, nonempty, hookless canonical Uniswap v4
                        NFTs containing authentic USDC can be sold.
                      </p>
                      <a className="text-link" href={pin ? "#market" : "#pin"}>
                        {pin ? "Explore the market ↗" : "Pin a seed ↗"}
                      </a>
                    </div>
                  ) : (
                    visiblePositions.map((p) => {
                      const market = s.markets.find((m) => m.id === p.seriesId);
                      return (
                        <article className="position-entry" key={p.tokenId}>
                          <div className="position-title">
                            <Pair
                              market={{
                                ...p,
                                feeTier: p.feeTier ?? "Fee tier unavailable",
                              }}
                            />
                            <span className="source-tag">
                              {market
                                ? market.nftReturned
                                  ? "NFT returned"
                                  : "Held in escrow"
                                : p.ownedByWallet === false
                                  ? "Offer target · other wallet"
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
                              {!connected && (
                                <button className="primary" onClick={connect}>
                                  Connect wallet to fund or manage this position
                                </button>
                              )}
                              <div className="position-buttons">
                                <a
                                  className="button"
                                  href={"#market/" + market.id}
                                >
                                  View fee claim <Icon />
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
                                {!fixture &&
                                  (market.phase === "captured" ||
                                    market.phase === "allocated") &&
                                  (BigInt(market.residualUsdcMicros ?? "0") >
                                    0n ||
                                    BigInt(market.otherReserve ?? "0") >
                                      0n) && (
                                    <button
                                      onClick={() =>
                                        lifecycleAction(
                                          "withdrawResidual",
                                          market,
                                        )
                                      }
                                    >
                                      Withdraw residual fees
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
                              <div className="offer-columns accession-terms">
                                <div>
                                  <div className="specimen-ticket">
                                    <span>specimen no. {p.tokenId}</span>
                                    <h3>{p.pair}</h3>
                                    <p>
                                      One original NFT.
                                      <br /> One agreed earning window.
                                    </p>
                                    <div className="specimen-seal">
                                      <Stencil seed={p.tokenId} />
                                      <Ticket />
                                      <span>
                                        Original NFT #{p.tokenId}
                                        <br /> Range fixed on acceptance
                                      </span>
                                    </div>
                                  </div>
                                  <h3>What acceptance freezes</h3>
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
                                <div>
                                  {p.ownedByWallet !== false && (
                                    <ListingForm
                                      position={p}
                                      snapshot={s}
                                      disabled={
                                        busy || !!review || wrongNetwork
                                      }
                                      onReview={begin}
                                      onError={setError}
                                    />
                                  )}
                                  <div className="funded-review">
                                    {!fixture && (
                                      <p className="fine">
                                        <a href={positionRoute(p.tokenId)}>
                                          Position link
                                        </a>{" "}
                                        ·{" "}
                                        <button
                                          className="text-button"
                                          onClick={() =>
                                            copyLink(positionRoute(p.tokenId))
                                          }
                                        >
                                          Copy position link
                                        </button>
                                        . Owner:{" "}
                                        <span className="address">
                                          {p.owner}
                                        </span>
                                      </p>
                                    )}
                                    {(p.offers?.length ?? 0) > 0 && (
                                      <label>
                                        Funded offer to review
                                        <select
                                          aria-label="Funded offer to review"
                                          value={p.offer?.id ?? ""}
                                          onChange={(event) => {
                                            setOfferSelection(
                                              event.target.value,
                                            );
                                            location.hash = positionRoute(
                                              p.tokenId,
                                              event.target.value,
                                            );
                                          }}
                                        >
                                          {!p.offer && (
                                            <option value="">
                                              Choose an available offer
                                            </option>
                                          )}
                                          {p.offers!.map((offer) => (
                                            <option
                                              key={offer.id}
                                              value={offer.id}
                                            >
                                              #{offer.id} ·{" "}
                                              {money(offer.fundedMicros, 6)}{" "}
                                              USDC ·{" "}
                                              {formatClaims(offer.claims)}{" "}
                                              claims
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                    <FundedOffer
                                      position={p}
                                      fixture={fixture}
                                    />
                                    {!!p.unavailableOffersCount && (
                                      <p className="fine">
                                        {p.unavailableOffersCount} unaccepted
                                        offer(s) have expired or no longer match
                                        this position’s current owner, pool,
                                        range or liquidity. Buyers can cancel
                                        them from Holdings to recover their
                                        exact funding.
                                      </p>
                                    )}
                                    {!p.offer && (
                                      <p className="fine">
                                        Publish your exact listing or share the
                                        position link. A separate buyer funds an
                                        offer, then you approve and accept its
                                        exact terms here. Expired or consumed
                                        offers cannot be accepted.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {pin && pinStep === 2 && (
                                <div className="actions">
                                  <button
                                    className="btn ghost"
                                    onClick={() => setPinStep(1)}
                                  >
                                    ← Choose another position
                                  </button>
                                  <button
                                    className="btn"
                                    onClick={() => setPinStep(3)}
                                  >
                                    Review funded offers →
                                  </button>
                                </div>
                              )}
                              {pin && (
                                <div className="pin-step-heading pin-sign">
                                  <i>iii.</i>
                                  <div>
                                    <h2>Accept a funded offer</h2>
                                    <p>
                                      Approval grants permission. Only accepting
                                      the exact funded offer starts the sale.
                                    </p>
                                  </div>
                                </div>
                              )}
                              {salesPaused && (
                                <p
                                  id={`sale-pause-${p.tokenId}`}
                                  className="inline-warning"
                                >
                                  NFT approval and sale acceptance are paused
                                  while the project team restores settlement
                                  services. Check availability above before
                                  trying again.
                                </p>
                              )}
                              <div className="position-buttons">
                                <button
                                  className={p.approved ? "" : "primary"}
                                  aria-describedby={
                                    salesPaused
                                      ? `sale-pause-${p.tokenId}`
                                      : undefined
                                  }
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
                                  disabled={
                                    !connected ||
                                    noGas ||
                                    salesPaused ||
                                    p.approved ||
                                    p.ownedByWallet === false ||
                                    wrongNetwork
                                  }
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
                                  aria-describedby={
                                    salesPaused
                                      ? `sale-pause-${p.tokenId}`
                                      : undefined
                                  }
                                  disabled={
                                    !connected ||
                                    noGas ||
                                    salesPaused ||
                                    !p.approved ||
                                    !p.offer ||
                                    wrongNetwork ||
                                    p.ownedByWallet === false
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
                                          expectedTerms: {
                                            buyer: p.offer.maker,
                                            claims: p.offer.claims,
                                            originalSupply:
                                              p.offer.originalSupply,
                                            endBlock: p.offer.endBlock,
                                            deadlineTimestamp:
                                              p.offer.deadlineTimestamp,
                                          },
                                        },
                                        lines: [
                                          ["Original NFT", "#" + p.tokenId],
                                          ["Offer", "#" + p.offer.id],
                                          ["Buyer", p.offer.maker],
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
                                  disabled={p.ownedByWallet === true}
                                  onClick={() => setFunding(!funding)}
                                >
                                  Fund an offer
                                </button>
                              </div>
                              {p.ownedByWallet === true && (
                                <p className="fine">
                                  You own this NFT. Share its position link with
                                  a separate buyer so their USDC funds the
                                  offer. Return here to approve and accept.
                                </p>
                              )}
                              {funding && (
                                <OfferForm
                                  key={p.tokenId}
                                  position={p}
                                  snapshot={s}
                                  disabled={
                                    !connected ||
                                    wrongNetwork ||
                                    noGas ||
                                    salesPaused
                                  }
                                  onReview={begin}
                                  onError={setError}
                                />
                              )}
                            </>
                          )}
                        </article>
                      );
                    })
                  )}
                </section>
              </>
            )}
          </>
        ) : null}
        {fixture && !home && !information && (
          <section className="data-disclosure">
            <details>
              <summary>
                {fixture ? "Data sources & demo controls" : "Network & data"}
              </summary>
              <p className="fine">
                {fixture
                  ? "All positions, prices, balances and history shown here are deterministic fixtures. They are design and browser-test evidence only. No public-chain sale, Aqua execution, historical proof, or live Graph composition is implied."
                  : "Onchain state authorizes actions. Graph analytics are contextual and may lag; verified receipt state must take precedence."}
              </p>
              <p className="fine">
                Current block {integer(s.blockNumber)} ·{" "}
                {fixture ? "Indexer source" : "RPC read block"}{" "}
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
        )}
      </main>
      <footer>
        <span className="tele">
          usufruct ·{" "}
          {fixture
            ? "deterministic fixture preview"
            : s.network + " · test assets"}
          <br />
          Trading powered by SwapVM
        </span>
        <nav aria-label="Information">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a
            href="https://github.com/MihRazvan/eth-online-2026#prior-work-and-attribution"
            target="_blank"
            rel="noreferrer"
          >
            Source & credits ↗
          </a>
        </nav>
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
            {fixture
              ? "Fixture transaction review"
              : review?.action.type === "publishListing" ||
                  review?.action.type === "cancelListing"
                ? "Listing signature review"
                : "Transaction review"}
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
                disabled={
                  busy ||
                  wrongNetwork ||
                  accountChanged ||
                  (noGas &&
                    review.action.type !== "publishListing" &&
                    review.action.type !== "cancelListing") ||
                  progress?.stage === "pending"
                }
                onClick={submit}
              >
                {busy ? "Awaiting confirmation…" : review.button}
                <Icon />
              </button>
            )}
            {accountChanged && (
              <p className="inline-warning">
                The connected account differs from this review. Close and review
                again.
              </p>
            )}
            {progress && (
              <p className="fine" aria-live="polite">
                {progress.label}:{" "}
                {progress.stage === "signature"
                  ? "review and sign in your wallet"
                  : progress.stage === "pending"
                    ? "submitted; waiting for chain confirmation"
                    : progress.stage === "estimating"
                      ? "checking execution and gas"
                      : progress.stage}
                .
                {progress.maximumFeeWei && (
                  <>
                    {" "}
                    Estimated gas ceiling:{" "}
                    {(Number(progress.maximumFeeWei) / 1e18).toPrecision(
                      4,
                    )}{" "}
                    ETH. Wallet fees can vary.
                  </>
                )}
              </p>
            )}
            <p className="fine dialog-note">
              {fixture
                ? "Fixture only. No wallet signature, token transfer, or transaction hash is produced."
                : review?.action.type === "publishListing" ||
                    review?.action.type === "cancelListing"
                  ? "This wallet signature updates an advertisement. It does not submit a transaction, approve tokens or transfer the NFT."
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
  cost: bigint | null;
}) {
  try {
    const total = parseUsdc(income),
      q = validQuantity(quantity) ? parseClaims(quantity) : 0n,
      payout = (total * q) / BigInt(supply),
      net = cost === null ? null : payout - cost;
    return (
      <dl className="scenario-results">
        <div>
          <dt>Your scenario payout</dt>
          <dd>{money(payout)}</dd>
        </div>
        <div>
          <dt>After purchase, before gas</dt>
          <dd className={net !== null && net < 0n ? "negative" : ""}>
            {net === null ? "Unavailable" : money(net)}
          </dd>
        </div>
      </dl>
    );
  } catch {
    return <p className="fine">Enter an amount with at most 6 decimals.</p>;
  }
}
function FundedOffer({
  position: p,
  fixture,
}: {
  position: Position;
  fixture: boolean;
}) {
  if (!p.offer)
    return (
      <div className="funded-offer">
        <h3>No funded offer yet</h3>
        <p className="fine">
          A buyer can escrow a concrete offer below. The NFT stays with its
          owner until that owner accepts the exact terms.
        </p>
      </div>
    );
  return (
    <div className="funded-offer">
      <span className="range-status">
        Funded offer {fixture ? "· fixture" : ""}
      </span>
      <strong>
        {money(p.offer.fundedMicros)} <small>USDC upfront</small>
      </strong>
      <dl className="accession-facts">
        <div>
          <dt>Claims sold / original Q</dt>
          <dd>
            {formatClaims(p.offer.claims)} /{" "}
            {formatClaims(p.offer.originalSupply)}
          </dd>
          <small>
            Residual owner keeps{" "}
            {formatClaims(
              BigInt(p.offer.originalSupply) - BigInt(p.offer.claims),
            )}{" "}
            fee claims and the separate NFT return right.
          </small>
        </div>
        <div>
          <dt>One earning window</dt>
          <dd>Through block {integer(p.offer.endBlock)}</dd>
          <small>Fees before activation are cleared to the owner.</small>
        </div>
        <div>
          <dt>Offer expires</dt>
          <dd>{deadlineDate(p.offer.deadlineTimestamp)}</dd>
        </div>
      </dl>
      <p className="fine">Buyer {p.offer.maker}</p>
    </div>
  );
}
function MakerQuote({
  market,
  balance,
  cashBalance,
  timestamp,
  onReview,
}: {
  market: Market;
  balance: string;
  cashBalance: string;
  timestamp: string;
  onReview: (review: Review) => void;
}) {
  const [amount, setAmount] = useState("1000"),
    [cash, setCash] = useState("84"),
    [minutes, setMinutes] = useState("60"),
    [error, setError] = useState(""),
    [claimsIn, setClaimsIn] = useState(BigInt(balance) === 0n);
  return (
    <form
      className="maker-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const quantity = parseClaims(amount),
            usdc = parseUsdc(cash);
          if (
            quantity <= 0n ||
            usdc <= 0n ||
            (claimsIn ? usdc > BigInt(cashBalance) : quantity > BigInt(balance))
          )
            throw new Error(
              "Choose positive amounts within your maker inventory balance.",
            );
          if (
            !/^\d+$/.test(minutes) ||
            BigInt(minutes) < 1n ||
            BigInt(minutes) > 10080n
          )
            throw new Error("Quote duration must be 1–10,080 minutes.");
          const expiresAt = (
            BigInt(timestamp) +
            BigInt(minutes) * 60n
          ).toString();
          onReview({
            title: "Publish a maker quote",
            action: {
              type: "publishQuote",
              claimsIn,
              seriesId: market.id,
              quantity: quantity.toString(),
              usdcMicros: usdc.toString(),
              expiresAt,
            },
            lines: [
              [
                "Direction",
                claimsIn ? "Buy claims with your USDC" : "Sell claims for USDC",
              ],
              ["Advertised claim lot", formatClaims(quantity)],
              [
                claimsIn ? "USDC inventory" : "Total ask for this lot",
                money(usdc, 6) + " USDC",
              ],
              [
                "Price ratio",
                formatClaims(quantity) +
                  " claims / " +
                  money(usdc, 6) +
                  " USDC",
              ],
              ["Expires", deadlineDate(expiresAt)],
              ["Series", market.pair + " · NFT #" + market.tokenId],
            ],
            warning: `Approve only this ${claimsIn ? "USDC" : "claim"} inventory to Aqua, then ship the exact fee-claim strategy. Tokens remain in your wallet. Other apps can share this inventory; a quote is not separately locked capital or guaranteed resale liquidity. A series state change invalidates this strategy.`,
            button: "Approve and publish quote",
          });
          setError("");
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <div>
        <h3>Publish a maker quote</h3>
        <p className="fine">
          Advertise an exact price ratio through Aqua / SwapVM. Wallet
          inventory: {formatClaims(balance)} claims and {money(cashBalance, 6)}{" "}
          USDC. Publishing does not lock these assets.
        </p>
      </div>
      <label>
        Maker direction
        <select
          aria-label="Maker direction"
          value={claimsIn ? "bid" : "ask"}
          onChange={(e) => setClaimsIn(e.target.value === "bid")}
        >
          <option value="ask">Sell claims (ask)</option>
          <option value="bid">Buy claims (bid)</option>
        </select>
      </label>
      <div className="maker-fields">
        <label>
          Claim quantity
          <input
            aria-label="Maker claim quantity"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          {claimsIn ? "USDC offered for lot" : "Total USDC ask"}
          <input
            aria-label="Maker total USDC ask"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          Expires in minutes
          <input
            aria-label="Maker quote duration"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>
      {error && (
        <p className="inline-warning" role="alert">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Review maker quote <Icon />
      </button>
    </form>
  );
}
function AnalysisPanel({
  adapter,
  market,
  quantity,
  price,
  hasQuote,
}: {
  adapter: FeeStripAdapter;
  market: Market;
  quantity: string;
  price: string;
  hasQuote: boolean;
}) {
  const [saved, setSaved] = useState<{
      key: string;
      result: AnalysisResult;
    } | null>(null),
    [loading, setLoading] = useState(""),
    [gas, setGas] = useState("0");
  const requestRevision = useRef(0);
  let executionCost = "0",
    valid = true;
  try {
    executionCost = parseUsdc(gas).toString();
  } catch {
    valid = false;
  }
  const key = [market.id, quantity, price, executionCost].join(":"),
    result = saved?.key === key ? saved.result : undefined;
  const inputsReady = valid && BigInt(quantity) > 0n;
  const checking = loading === key;
  const load = async () => {
    if (!adapter.readAnalysis || !hasQuote || !inputsReady) return;
    const revision = ++requestRevision.current;
    setLoading(key);
    try {
      const value = await adapter.readAnalysis(
        market.id,
        quantity,
        price,
        executionCost,
      );
      if (revision === requestRevision.current)
        setSaved({ key, result: value });
    } catch {
      if (revision === requestRevision.current)
        setSaved({
          key,
          result: {
            status: "unavailable",
            reason: "Verified analysis could not be loaded.",
          },
        });
    } finally {
      if (revision === requestRevision.current) setLoading("");
    }
  };
  const available =
    hasQuote && inputsReady && !checking && result?.status === "available"
      ? result.analysis
      : undefined;
  const hasLagBreakdown =
    available?.indexingLagBlocks !== undefined &&
    available?.finalityLagBlocks !== undefined;
  const stateTitle = !adapter.readAnalysis
    ? "Analysis is not configured"
    : !hasQuote
      ? "Waiting for an executable quote"
      : !inputsReady
        ? "Check the comparison inputs"
        : checking
          ? "Checking the analysis sources"
          : result?.status === "unavailable"
            ? "Source comparison unavailable"
            : !available
              ? "Source comparison not requested"
              : available.stale
                ? "Source comparison is behind the chain"
                : "Source comparison loaded";
  const stateDescription = !adapter.readAnalysis
    ? "This page has no analysis connection. Purchase terms and contract recovery information remain separate."
    : !hasQuote
      ? "A maker needs to publish an executable ask before its purchase break-even can be compared. You can still inspect this claim’s terms and recovery information."
      : !inputsReady
        ? "Enter a positive claim quantity in Claims to buy and a valid, nonnegative USDC execution cost below."
        : checking
          ? "Comparing Substreams activity and Subgraph instrument data at a common source block. This check needs no wallet signature."
          : result?.status === "unavailable"
            ? "The project’s analysis service could not provide a usable comparison. Retry this read-only check or share the details below with the project team."
            : !available
              ? "Load the sources for the selected quantity and price. A wallet connection is not required."
              : available.stale
                ? "This is an older source snapshot. Refresh the comparison before using it to assess a purchase."
                : available.sourceFinalized && hasLagBreakdown
                  ? "Fresh against finalized history. The delay from the chain tip includes Ethereum finality; additional indexing lag is shown separately. This snapshot does not predict future fees."
                  : "This snapshot describes the selected purchase and observed history. It does not predict future fees.";
  return (
    <section className="history-section sourced-analysis">
      <div className="section-top">
        <h2>Activity behind the income</h2>
        <span className="source-tag">Substreams + Subgraph</span>
      </div>
      <div className="analysis-availability" role="status" aria-live="polite">
        <b>{stateTitle}</b>
        <p>{stateDescription}</p>
      </div>
      <p className="fine">
        Request a common-block comparison from the configured sources. It
        informs a purchase; only the onchain historical proof can allocate fees.
      </p>
      <div className="analysis-controls">
        <label>
          Estimated execution cost, USDC
          <input
            aria-label="Analysis execution cost"
            inputMode="decimal"
            value={gas}
            onChange={(e) => setGas(e.target.value)}
          />
        </label>
        <button
          disabled={
            !adapter.readAnalysis || !hasQuote || !inputsReady || checking
          }
          onClick={load}
        >
          {checking
            ? "Loading verified sources…"
            : result
              ? "Refresh sourced analysis"
              : "Load sourced analysis"}
        </button>
      </div>
      {hasQuote &&
        inputsReady &&
        !checking &&
        result?.status === "unavailable" && (
          <details className="analysis-unavailable-details">
            <summary>Why this comparison is unavailable</summary>
            <p className="fine">{result.reason}</p>
          </details>
        )}
      {available && (
        <>
          <p className="source-tag">
            {available.sourceFinalized === true &&
            available.substreamsFinalBlock !== null &&
            available.substreamsFinalBlock >= available.sourceBlock
              ? "Finalized at source"
              : "Provisional source state"}
          </p>
          <dl className="instrument-facts">
            <div>
              <dt>Break-even, before execution cost</dt>
              <dd>{money(available.grossBreakEvenUSDC, 6)} USDC</dd>
            </div>
            <div>
              <dt>Break-even, including execution cost</dt>
              <dd>{money(available.netBreakEvenUSDC, 6)} USDC</dd>
            </div>
            <div>
              <dt>Observed range occupancy</dt>
              <dd>
                {available.occupancyBps === null
                  ? "Unknown"
                  : (available.occupancyBps / 100).toFixed(2) + "%"}
              </dd>
            </div>
            <div>
              <dt>History coverage</dt>
              <dd>
                {(available.coverageBps / 100).toFixed(2)}% ·{" "}
                {available.knownBlocks}/{available.totalBlocks} blocks
              </dd>
            </div>
            <div>
              <dt>Common source block</dt>
              <dd>{available.sourceBlock.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>
                {hasLagBreakdown ? "Total lag from chain tip" : "Source lag"}
              </dt>
              <dd>
                {available.lagBlocks} blocks
                {available.stale ? " · stale" : ""}
              </dd>
            </div>
            {hasLagBreakdown && (
              <>
                <div>
                  <dt>Finality delay</dt>
                  <dd>
                    {available.finalityLagBlocks} blocks{" "}
                    <small>· expected wait for finality</small>
                  </dd>
                </div>
                <div>
                  <dt>Additional indexing lag</dt>
                  <dd>
                    {available.indexingLagBlocks} blocks behind{" "}
                    {available.sourceFinalized ? "finalized" : "chain"} head
                  </dd>
                </div>
              </>
            )}
          </dl>
          <p className="fine">
            Block hash <code>{available.sourceHash}</code>
          </p>
          <details>
            <summary>Source identity &amp; analysis limits</summary>
            <p className="fine">
              Subgraph deployment: <code>{available.subgraphDeployment}</code>
              <br /> Substreams package:{" "}
              <code>{available.substreamsPackage}</code>
            </p>
            {available.caveats.map((text, i) => (
              <p className="fine" key={i}>
                {text}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
