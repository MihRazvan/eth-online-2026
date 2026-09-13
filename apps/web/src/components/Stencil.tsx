import {
  Barcode,
  Dither,
  Spiral,
  Wedge,
  ReferenceGlyphs,
  BackgroundField,
} from "./PrintFurniture";
import { useId } from "react";
import type { Market } from "../types";
import { formatClaims, integer, money, sharePercent } from "../amounts";

// Geometry follows the supplied usufruct-ui.html. Seeded variation is decorative identity,
// never fabricated market data; fill is used only for explicitly labelled live quantities.
export function Stencil({
  seed = "usufruct",
  fill = 0.6,
  className = "",
  animate = false,
  annotations,
}: {
  seed?: string;
  fill?: number;
  className?: string;
  animate?: boolean;
  annotations?: { tokenId: string; lowerTick: number; endBlock: string };
}) {
  const id = useId().replaceAll(":", "");
  let state = /^\d+$/.test(seed) ? Number(BigInt(seed) & 0xffffffffn) || 1 : [...seed].reduce((v, c) => (v * 31 + c.charCodeAt(0)) >>> 0, 17);
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const barbs = [];
  const axis = random() * 360,
    n = 13 + Math.floor(random() * 7);
  let angle = random() * 360;
  for (let i = 0; i < n; i++) {
    angle += (360 / n) * (0.55 + random() * 0.95);
    const len =
        (14 + random() * 30) *
          (1 + 0.55 * Math.cos(((angle - axis) * Math.PI) / 180)) +
        8,
      w = 3.4 + random() * 3.4,
      b = 54,
      t = 50 - len;
    barbs.push(
      <path
        key={i}
        d={`M${100 - w},${b} C${100 - w * 0.62},${b - len * 0.35} ${100 - w * 0.26},${b - len * 0.72} 100,${t} C${100 + w * 0.26},${b - len * 0.72} ${100 + w * 0.62},${b - len * 0.35} ${100 + w},${b} C${100 + w * 0.5},${b + 3} ${100 - w * 0.5},${b + 3} ${100 - w},${b} Z`}
        transform={`rotate(${angle} 100 100)`}
      />,
    );
  }
  const dots = Array.from({ length: 190 }, (_, i) => {
    const a = random() * Math.PI * 2,
      r = Math.sqrt(random()) * 46;
    return (
      <circle
        key={i}
        cx={100 + Math.cos(a) * r}
        cy={100 + Math.sin(a) * r}
        r={0.85 + random() * 0.95}
      />
    );
  });
  const lines = Array.from({ length: 10 }, (_, i) => {
    const t = (i / 10) * Math.PI * 2;
    return (
      <path
        key={i}
        d={`M100,100 L${100 + Math.sin(t) * 46},${100 - Math.cos(t) * 46}`}
      />
    );
  });
  return (
    <svg
      className={`stencil ${className} ${animate ? "stencil-motion" : ""}`}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={id}>
          <rect
            x="48"
            y={150 - 100 * Math.max(0, Math.min(1, fill))}
            width="104"
            height="104"
          />
        </clipPath>
      </defs>
      <g className="barbs" fill="currentColor">
        {barbs}
      </g>
      <circle
        cx="100"
        cy="100"
        r="50"
        fill="var(--bg)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <g fill="currentColor" clipPath={`url(#${id})`}>
        {dots}
      </g>
      <g className="ring" fill="none" stroke="currentColor" strokeWidth=".7">
        {lines}
        <circle cx="100" cy="100" r="34" />
      </g>
      <circle cx="100" cy="100" r="5" fill="var(--sel)" />
      {annotations && <g className="stencil-annotations" fill="currentColor" fontFamily="Space Mono, monospace" fontSize="5" letterSpacing=".3">
        <path d="M62 60 24 30H8 M145 74 180 52H194 M141 135 174 171H192" stroke="currentColor" strokeWidth=".45" fill="none" />
        <text x="8" y="26">NFT {annotations.tokenId}</text>
        <text x="194" y="48" textAnchor="end">TICK {annotations.lowerTick}</text>
        <text x="192" y="181" textAnchor="end">N {annotations.endBlock}</text>
      </g>}
    </svg>
  );
}
export function Registration() {
  return (
    <svg viewBox="0 0 30 30" width="15" height="15" aria-hidden="true">
      <path
        d="M15 2.5 27.5 15 15 27.5 2.5 15Z"
        fill="none"
        stroke="currentColor"
      />
      <path d="m15 9 6 6-6 6-6-6Z" fill="currentColor" />
    </svg>
  );
}
export function PrintStrip({ label }: { label: string }) {
  const seed = [...label].reduce((v, c) => v + c.charCodeAt(0), 101);
  return (
    <div className="print-strip">
      <Registration />
      <span className="bc">
        <Barcode seed={seed} />
      </span>
      <span className="wg">
        <Wedge seed={seed + 3} />
      </span>
      <span className="dt">
        <Dither seed={seed + 7} />
      </span>
      <span className="sp">
        <Spiral seed={seed + 13} />
      </span>
      <span className="bc">
        <Barcode seed={seed + 29} width={160} />
      </span>
      <span className="tele">{label}</span>
    </div>
  );
}
export function WindowClock({
  market,
  block,
}: {
  market: Market;
  block: string;
}) {
  const start = BigInt(market.startBlock),
    end = BigInt(market.endBlock),
    now = BigInt(block);
  const fraction =
    end > start
      ? Number(
          ((now < start ? 0n : now > end ? end - start : now - start) *
            10000n) /
            (end - start),
        ) / 100
      : 0;
  return (
    <div className="window-clock">
      <div className="wpbar" aria-hidden="true">
        <i style={{ width: `${fraction}%` }} />
      </div>
      <div className="wpmeta">
        <span>Start {integer(market.startBlock)}</span>
        <span>Read {integer(block)}</span>
        <span>End {integer(market.endBlock)}</span>
      </div>
      <p className="fine">
        Block progress · not fee income or settlement progress.
      </p>
    </div>
  );
}
export function MarketRow({ market, held }: { market: Market; held: string }) {
  const offered = BigInt(market.availableClaims),
    Q = BigInt(market.originalSupply),
    fraction = Q > 0n ? Number((offered * 10000n) / Q) / 10000 : 0;
  return (
    <a
      className={`market-row stencil-row ${BigInt(held) > 0n ? "owned" : ""}`}
      href={`#market/${market.id}`}
      aria-label={`Open ${market.pair} NFT ${market.tokenId}`}
    >
      <Stencil seed={market.tokenId} fill={fraction} />
      <div>
        <h3 className="display">NFT {market.tokenId}</h3>
        <p className="tele rowsub">
          {market.pair} · {market.feeTier} ·{" "}
          {market.inRange ? "in range" : "out of range"}
        </p>
        <p className="rowsub">
          End of block {integer(market.endBlock)} ·{" "}
          {market.phase === "active"
            ? "window open"
            : market.phase === "matured"
              ? "capture pending"
              : market.phase === "captured"
                ? "allocation pending"
                : market.phase === "allocated"
                  ? "allocation verified"
                  : "closed"}
        </p>
        <p className="fine">
          {formatClaims(market.availableClaims)} claims executable ·{" "}
          {sharePercent(market.availableClaims, market.originalSupply)}% of
          original Q
        </p>
      </div>
      <div className="rowright">
        <strong>
          {offered > 0n
            ? money(market.askMicros, 6) + " USDC"
            : "No executable quote"}
        </strong>
        <span className="tele">
          {offered > 0n ? "per fee claim" : "inventory unavailable"}
        </span>
        <span className="fine">
          Original Q {formatClaims(market.originalSupply)}
        </span>
        {BigInt(held) > 0n && (
          <span className="tele tele-sel">
            you hold {sharePercent(held, market.originalSupply)}% of Q
          </span>
        )}
      </div>
    </a>
  );
}
export function Landing({
  fixture,
  network,
  connected,
  onConnect,
}: {
  fixture: boolean;
  network: string;
  connected: boolean;
  onConnect: () => void;
}) {
  return (
    <section className="landing">
      <BackgroundField />
      <ReferenceGlyphs />
      <div className="hero">
        <h1 className="display">
          <span className="selword">
            <span className="hl" />
            <em>USUFRUCT</em>
          </span>
        </h1>
        <p className="hero-claim">
          One window of a Uniswap position’s fees. Sold once, up front.{" "}
          <b>The seed stays yours.</b>
        </p>
        <div className="cta">
          {connected ? (
            <a className="button primary" href="#pin">
              Pin a seed
            </a>
          ) : (
            <button className="button primary" onClick={onConnect}>
              {fixture ? "Use fixture wallet" : "Connect wallet"}
            </button>
          )}
          <a className="button ghost" href="#market">
            Look at the sheet first
          </a>
        </div>
      </div>
      <div className="plate">
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[0, 1].map((copy) => (
              <div className="ticker-unit" key={copy}>
                {[
                  "ONE WINDOW",
                  "SOLD ONCE",
                  "FIXED PERIOD",
                  "NATIVE USDC",
                  "THE SEED STAYS YOURS",
                  "NO ROLLOVER",
                  "EXACT ALLOCATION",
                ].map((word, i) => (
                  <span className="ticker-phrase" key={word}>
                    <span className={i % 3 === 2 ? "tele-sel" : ""}>
                      {word}
                    </span>
                    <span className="bcm">
                      <Barcode seed={400 + i * 17} width={90} height={16} />
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="poster">
          <div className="prow">
            <div>
              <h2>PIN</h2>
              <p>
                Choose one eligible position and publish your exact terms. A
                listing leaves the NFT in your wallet. Acceptance escrows the
                original NFT and freezes its liquidity and range.
              </p>
            </div>
            <span className="tele">01 · seller signs terms</span>
          </div>
          <div className="prow">
            <div>
              <h2>SELL</h2>
              <p>
                The funded buyer pays USDC at acceptance and receives claims to
                that window’s unpaid fees. Issued claims can then trade through
                Aqua.
              </p>
            </div>
            <span className="tele">02 · USDC up front</span>
          </div>
          <div className="prow">
            <div>
              <h2>RETURN</h2>
              <p>
                After the window, capture the fees and recover the same NFT.
                Claims redeem separately once the exact allocation is verified.
              </p>
            </div>
            <span className="tele">03 · separate rights</span>
          </div>
        </div>
        <PrintStrip label="one position / one agreed window" />
      </div>
      <div className="aperture">
        <span className="tele">open field</span>
        <span className="tele">no print · 01</span>
      </div>
      <div className="plate">
        <PrintStrip label="read the rights" />
        <h2 className="display secttl">WORDS USED HERE</h2>
        <dl className="definitions">
          <div>
            <dt>SEED</dt>
            <dd>
              The original canonical Uniswap v4 position NFT. Its return right
              is separate from the fee claims.
            </dd>
          </div>
          <div>
            <dt>WINDOW</dt>
            <dd>
              One agreed earning period, from activation through an exact end
              block. No automatic renewal.
            </dd>
          </div>
          <div>
            <dt>CLAIM</dt>
            <dd>
              A fraction of all unpaid USDC income from the window, including
              income before you bought.
            </dd>
          </div>
          <div>
            <dt>ORIGINAL Q</dt>
            <dd>
              The fixed initial claim supply. Another holder redeeming does not
              increase your fraction.
            </dd>
          </div>
          <div>
            <dt>CAPTURE</dt>
            <dd>
              Collection after the endpoint. The NFT can return while the fee
              allocation remains unresolved.
            </dd>
          </div>
          <div>
            <dt>ALLOCATION</dt>
            <dd>
              The contract verifies historical state and determines the period’s
              reserved USDC. Analytics do not decide payouts.
            </dd>
          </div>
        </dl>
        <div className="landing-note">
          <h3 className="tele tele-sel">Before you connect</h3>
          <p>
            {fixture
              ? "This is a deterministic fixture preview. Balances, markets and transitions are simulated."
              : `${network} · test assets only. Transactions use your wallet and public contracts.`}{" "}
            Fees may be zero. Resale depends on an executable quote. A funded
            offer alone does not escrow the NFT; the owner must accept.
          </p>
        </div>
      </div>
    </section>
  );
}
export function InformationPage({ page }: { page: "privacy" | "terms" }) {
  return (
    <section className="legal-page">
      <div className="pagehead">
        <h1 className="display">{page.toUpperCase()}</h1>
        <span className="tele">Interface information · 13 Sep 2026</span>
      </div>
      <div className="legal">
        {page === "privacy" ? (
          <>
            <div className="landing-note">
              <p>
                Wallet actions are public onchain. This interface also makes
                requests to hosting, RPC and configured data services. It does
                not make your activity anonymous.
              </p>
            </div>
            <h2>YOUR BROWSER</h2>
            <p>
              A session flag keeps the introduction from replaying. The app
              stores your color preference, pending listing terms and
              signatures, and transaction receipt records in local storage.
              Receipt records can include wallet addresses, contract addresses
              and transaction hashes. Clearing site data removes these local
              records, not the public transactions.
            </p>
            <h2>NETWORK REQUESTS</h2>
            <p>
              The web host serves the application. The configured RPC reads
              chain state; recovery and analysis endpoints serve proof and
              contextual data. These providers receive request information and
              may keep operational logs under their own policies. Connecting
              lets your wallet share its selected address with this page.
            </p>
            <h2>SELLER LISTINGS</h2>
            <p>
              Publishing sends the signed advertisement to the project’s listing
              service. It records the seller address, position and terms,
              signature, listing identity and cancellation status. Those
              advertisements can be read by other visitors. Pending terms and
              signatures are also saved in this browser so a failed request can
              resume without creating a second listing.
            </p>
            <h2>YOUR KEYS</h2>
            <p>
              Use your wallet to approve or reject transactions. Never enter a
              private key or recovery phrase into this application. Local
              development test wallets are restricted to explicitly enabled
              loopback environments.
            </p>
            <h2>INSPECT THE SOURCE</h2>
            <p>
              The application source and configuration are public. This page
              describes the current interface; it does not promise that
              third-party providers collect nothing.
            </p>
          </>
        ) : (
          <>
            <div className="landing-note">
              <p>
                Experimental software using test assets. This page explains the
                product’s operating limits; it is not a guarantee of returns,
                liquidity, proof availability or loss recovery.
              </p>
            </div>
            <h2>WHAT YOU BUY</h2>
            <p>
              A fee claim carries its fraction of all unpaid native USDC income
              for one exact window. It does not transfer the original NFT or
              other-currency fees. Original Q remains the denominator;
              redemptions round down to a USDC base unit.
            </p>
            <h2>WHAT IS LOCKED</h2>
            <p>
              Acceptance escrows the original NFT and fixes its range and
              liquidity. The NFT return-right holder can recover it after
              capture. Early closure requires reuniting that right with all
              original claims before the endpoint.
            </p>
            <h2>WHEN YOU CAN REDEEM</h2>
            <p>
              The earning endpoint, capture, NFT return, verified allocation and
              redemption are separate. Missing historical evidence can delay
              allocation. Captured unresolved USDC remains reserved; no
              analytics provider can choose its allocation.
            </p>
            <h2>TRANSACTIONS & COSTS</h2>
            <p>
              Review the chain, addresses, amounts and permissions in your
              wallet. Transactions may fail, be replaced or be cancelled before
              confirmation. Confirmed approvals may remain after a later action
              is rejected. Gas is separate from USDC consideration.
            </p>
            <h2>LIQUIDITY & TESTING</h2>
            <p>
              Fees may be zero and a secondary exit requires an executable
              quote. Fixture and local-chain evidence are labelled separately
              from public transactions. Independent review and tests do not
              constitute a security audit or commercial validation.
            </p>
          </>
        )}
        <a className="button" href="#home">
          Back to usufruct
        </a>
      </div>
    </section>
  );
}
export function Chrome({
  route,
  theme,
  onTheme,
  walletLabel,
  onConnect,
}: {
  route: string;
  theme: string;
  onTheme: () => void;
  walletLabel: string;
  onConnect: () => void;
}) {
  const home = route === "home";
  return (
    <>
      <div className="titlebar">
        <a className="path" href="#home">
          usufruct.exe — /
          {home ? "" : route === "positions" ? "holdings" : route}
        </a>
        <button onClick={onTheme} aria-label="Switch colour mode">
          [ {theme === "dark" ? "light" : "dark"} ]
        </button>
        <span aria-hidden="true">[ □ ] [ × ]</span>
      </div>
      {!home && (
        <header className="main-nav">
          <nav aria-label="Main navigation">
            <a href="#home">usufruct</a>
            <a
              href="#market"
              aria-current={
                route === "market" || route.startsWith("market/")
                  ? "page"
                  : undefined
              }
            >
              Market
            </a>
            <a
              href="#pin"
              aria-current={
                route === "pin" || route.startsWith("pin/") ? "page" : undefined
              }
            >
              Pin a seed
            </a>
            <a
              href="#positions"
              aria-current={route === "positions" ? "page" : undefined}
            >
              Holdings
            </a>
          </nav>
          <button className="wallet-button" onClick={onConnect}>
            {walletLabel}
          </button>
        </header>
      )}
    </>
  );
}
export function ClaimSelection({
  market,
  quantity,
  onChange,
}: {
  market: Market;
  quantity: bigint;
  onChange: (value: string) => void;
}) {
  const Q = BigInt(market.originalSupply),
    available = BigInt(market.availableClaims);
  const basisPoints = Q > 0n ? (quantity * 10000n) / Q : 0n;
  const fraction = Number(basisPoints) / 100;
  const write = (units: bigint) => onChange(formatClaims(units).replaceAll(",", ""));
  return (
    <div className="claim-selection">
      <div className="selection-word">
        <span className="selection-band" style={{ width: `${Math.max(0, Math.min(100, fraction))}%` }} aria-hidden="true" />
        <h1 className="display">NFT {market.tokenId}</h1>
        <input
          className="selection-surface"
          type="range"
          min="0"
          max="10000"
          step="1"
          value={Math.max(0, Math.min(10000, Number(basisPoints)))}
          disabled={available === 0n}
          aria-label="Select claim share"
          aria-valuetext={`${formatClaims(quantity)} claims, ${sharePercent(quantity.toString(), market.originalSupply)} percent of original Q`}
          onChange={(event) => {
            const units = (Q * BigInt(event.target.value)) / 10000n;
            write(units > available ? available : units);
          }}
        />
      </div>
      <div className="selection-hint">
        <span>Drag or use arrow keys to select</span>
        <button className="text-button" disabled={available === 0n} onClick={() => write(available)}>
          Select all executable
        </button>
      </div>
    </div>
  );
}
