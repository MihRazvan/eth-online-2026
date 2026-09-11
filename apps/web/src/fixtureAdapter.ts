import { claimCost } from "./amounts";
import type {
  Action,
  ActionResult,
  FeeStripAdapter,
  Market,
  Scenario,
  Snapshot,
  WalletState,
} from "./types";
const primary: Market = {
  id: "fs-1482",
  pair: "WETH / USDC",
  tokenId: "1482",
  feeTier: "0.05%",
  poolId: "fixture:WETH-USDC-500-hookless",
  lowerPrice: "2,800",
  upperPrice: "3,600",
  currentPrice: "3,241.60",
  lowerTick: -202000,
  upperTick: -199490,
  liquidity: "84571903275812",
  inRange: true,
  startBlock: "11842000",
  endBlock: "11972000",
  startDate: "12 Sep 2026",
  endDate: "30 Sep 2026",
  originalSupply: "10000000000000000000000",
  askMicros: "84000",
  availableClaims: "6000000000000000000000",
  phase: "active",
  capturedMicros: "0",
  allocatedMicros: "0",
  redeemedClaims: "0",
  nftReturned: false,
  historicalUsdcMicros: "465200000",
  history: [29, 41, 35, 57, 43, 64, 51, 39, 69, 54, 46, 62, 47, 58],
  sourceFromBlock: "11743000",
  sourceToBlock: "11842994",
};
export function initialFixture(): Snapshot {
  return {
    mode: "fixture",
    network: "Sepolia design fixture",
    chainId: 11155111,
    blockNumber: "11843000",
    timestamp: "1789200000",
    sourceBlock: "11842994",
    scenario: "normal",
    fundedOffers: [],
    wallet: {
      connected: false,
      usdcBalanceMicros: "2500000000",
      claims: {
        "fs-1482": "250000000000000000000",
        "fs-1484": "400000000000000000000",
      },
    },
    quote: {
      maker: "Fixture maker A",
      expiresAt: "1789200240",
      available: true,
    },
    positions: [
      {
        tokenId: "2041",
        pair: "WETH / USDC",
        lowerPrice: "2,800",
        upperPrice: "3,600",
        liquidity: "84571903275812",
        approved: false,
        offer: {
          id: "offer-2041",
          fundedMicros: "672000000",
          claims: "8000000000000000000000",
          originalSupply: "10000000000000000000000",
          endBlock: "11972000",
          deadlineTimestamp: "1789214400",
          maker: "Fixture buyer B",
        },
      },
      {
        tokenId: "1484",
        pair: "WETH / USDC",
        lowerPrice: "2,800",
        upperPrice: "3,600",
        liquidity: "84571903275812",
        approved: true,
        seriesId: "fs-1484",
      },
    ],
    markets: [
      primary,
      {
        ...primary,
        id: "fs-1483",
        tokenId: "1483",
        pair: "WBTC / USDC",
        lowerPrice: "85,000",
        upperPrice: "120,000",
        currentPrice: "103,840",
        askMicros: "126000",
        endDate: "15 Oct 2026",
        endBlock: "12080000",
        historicalUsdcMicros: "713400000",
        poolId: "fixture:WBTC-USDC-500-hookless",
        history: [46, 49, 34, 61, 69, 55, 57, 39, 52, 80, 61, 43, 71, 67],
      },
      {
        ...primary,
        id: "fs-1484",
        tokenId: "1484",
        inRange: false,
        currentPrice: "3,742.80",
        endDate: "10 Sep 2026",
        endBlock: "11842020",
        startDate: "23 Aug 2026",
        startBlock: "11712020",
        phase: "matured",
        askMicros: "31000",
        availableClaims: "0",
        history: [72, 59, 50, 34, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    ],
  };
}
/** Isolated deterministic design/test state. It never signs, broadcasts, or invents a hash. */
export class FixtureAdapter implements FeeStripAdapter {
  private nextOffer = 1;
  readonly mode = "fixture" as const;
  private state: Snapshot = initialFixture();
  async load() {
    return structuredClone(this.state);
  }
  async connect(): Promise<WalletState> {
    if (this.state.scenario === "rejected-signature")
      throw new Error(
        "Wallet connection rejected. You can keep exploring markets and reconnect when ready.",
      );
    this.state.wallet.connected = true;
    this.state.wallet.address = "Fixture wallet";
    this.state.wallet.chainId =
      this.state.scenario === "wrong-network" ? 1 : this.state.chainId;
    return structuredClone(this.state.wallet);
  }
  async switchNetwork() {
    this.state.wallet.chainId = this.state.chainId;
    this.state.scenario = "normal";
  }
  setScenario(scenario: Scenario) {
    this.state.scenario = scenario;
    this.state.quote.available = scenario !== "no-quotes";
    this.state.quote.expiresAt =
      scenario === "stale-quote" ? "1789199999" : "1789200240";
    this.state.sourceBlock =
      scenario === "indexer-lag" ? "11840000" : "11842994";
    if (this.state.wallet.connected)
      this.state.wallet.chainId =
        scenario === "wrong-network" ? 1 : this.state.chainId;
    this.state.wallet.usdcBalanceMicros =
      scenario === "insufficient-funds" ? "10000" : "2500000000";
  }
  reset() {
    this.state = initialFixture();
    this.nextOffer = 1;
  }
  /** Explicit fixture controls exercise post-N state; there is no wall-clock authority. */
  advance(seriesId: string) {
    const market = this.state.markets.find((m) => m.id === seriesId);
    if (market && market.phase === "active") {
      this.state.blockNumber = (BigInt(market.endBlock) + 1n).toString();
      market.phase = "matured";
    }
  }
  async execute(action: Action): Promise<ActionResult> {
    const s = this.state;
    if (!s.wallet.connected)
      throw new Error("Connect a wallet before continuing.");
    if (s.wallet.chainId !== s.chainId)
      throw new Error("Wrong network. Switch to the selected network.");
    if (s.scenario === "rejected-signature")
      throw new Error(
        "Signature rejected. Nothing changed. Review the terms and try again.",
      );
    if (s.scenario === "transaction-failure")
      throw new Error(
        "Transaction reverted. No sale, transfer, or allocation was applied. Refresh state before retrying.",
      );
    const market =
      "seriesId" in action
        ? s.markets.find((m) => m.id === action.seriesId)
        : undefined;
    if (action.type === "buyClaims") {
      if (!market) throw new Error("Series unavailable.");
      if (!s.quote.available)
        throw new Error(
          "No executable quote. Maker liquidity is not guaranteed.",
        );
      if (BigInt(action.expiresAt) < BigInt(s.timestamp))
        throw new Error("Quote expired. Refresh the quote before signing.");
      const q = BigInt(action.quantity),
        cost = claimCost(q, market.askMicros);
      if (q <= 0n || q > BigInt(market.availableClaims))
        throw new Error("Quantity exceeds executable maker inventory.");
      if (cost > BigInt(action.maximumPaymentMicros))
        throw new Error("Price exceeds your maximum payment.");
      if (cost > BigInt(s.wallet.usdcBalanceMicros))
        throw new Error(
          "Insufficient USDC. Reduce the quantity or fund your wallet.",
        );
      s.wallet.usdcBalanceMicros = (
        BigInt(s.wallet.usdcBalanceMicros) - cost
      ).toString();
      s.wallet.claims[market.id] = (
        BigInt(s.wallet.claims[market.id] ?? "0") + q
      ).toString();
      market.availableClaims = (BigInt(market.availableClaims) - q).toString();
    } else if (action.type === "approvePosition") {
      const p = s.positions.find((p) => p.tokenId === action.tokenId);
      if (!p) throw new Error("Position unavailable.");
      p.approved = true;
    } else if (action.type === "acceptOffer") {
      const p = s.positions.find((p) => p.tokenId === action.tokenId);
      if (!p?.approved || !p.offer || p.offer.id !== action.offerId)
        throw new Error(
          "Approve the NFT and review the exact funded offer first.",
        );
      if (BigInt(p.offer.deadlineTimestamp) < 1789200000n)
        throw new Error("Offer expired. The NFT remains in your wallet.");
      if (BigInt(action.minimumProceedsMicros) > BigInt(p.offer.fundedMicros))
        throw new Error("Funded proceeds are below your minimum.");
      if (p.seriesId) throw new Error("Position already active.");
      p.seriesId = "fs-" + p.tokenId;
      s.markets.unshift({
        ...primary,
        id: p.seriesId,
        tokenId: p.tokenId,
        startBlock: s.blockNumber,
        endBlock: p.offer.endBlock,
      });
      s.wallet.usdcBalanceMicros = (
        BigInt(s.wallet.usdcBalanceMicros) + BigInt(p.offer.fundedMicros)
      ).toString();
      s.wallet.claims[p.seriesId] = (
        BigInt(p.offer.originalSupply) - BigInt(p.offer.claims)
      ).toString();
      s.fundedOffers = s.fundedOffers.filter((o) => o.id !== action.offerId);
    } else if (action.type === "cancelOffer") {
      const offer = s.fundedOffers.find((o) => o.id === action.offerId);
      if (!offer || offer.buyer !== s.wallet.address)
        throw new Error("Only your unaccepted funded offer can be cancelled.");
      s.wallet.usdcBalanceMicros = (
        BigInt(s.wallet.usdcBalanceMicros) + BigInt(offer.fundedMicros)
      ).toString();
      s.fundedOffers = s.fundedOffers.filter((o) => o.id !== action.offerId);
      const position = s.positions.find((p) => p.offer?.id === action.offerId);
      if (position) {
        const remaining = [...s.fundedOffers]
          .reverse()
          .find((o) => o.tokenId === position.tokenId);
        position.offer = remaining
          ? { ...remaining, maker: remaining.buyer }
          : undefined;
      }
    } else if (action.type === "fundOffer") {
      const p = s.positions.find((p) => p.tokenId === action.tokenId);
      const amount = BigInt(action.paymentMicros);
      if (!p || amount <= 0n || amount > BigInt(s.wallet.usdcBalanceMicros))
        throw new Error("Enter a funded amount within your USDC balance.");
      if (
        BigInt(action.endBlock) <= BigInt(s.blockNumber) ||
        BigInt(action.deadlineTimestamp) <= 1789200000n
      )
        throw new Error("Offer and earning endpoints must be future blocks.");
      s.wallet.usdcBalanceMicros = (
        BigInt(s.wallet.usdcBalanceMicros) - amount
      ).toString();
      p.offer = {
        id: "fixture-funded-" + p.tokenId + "-" + this.nextOffer++,
        fundedMicros: action.paymentMicros,
        claims: action.claims,
        originalSupply: "10000000000000000000000",
        endBlock: action.endBlock,
        deadlineTimestamp: action.deadlineTimestamp,
        maker: "Fixture wallet",
      };
      s.fundedOffers.push({
        ...p.offer,
        buyer: s.wallet.address!,
        seller: p.owner ?? "Fixture seller",
        tokenId: p.tokenId,
        expired: false,
      });
    } else if (market) {
      if (action.type === "capture") {
        if (
          market.phase !== "matured" ||
          BigInt(s.blockNumber) <= BigInt(market.endBlock)
        )
          throw new Error("Capture must be strictly after end-of-block N.");
        market.capturedMicros = "920000000";
        market.phase = "captured";
      }
      if (action.type === "withdrawNFT") {
        if (market.phase !== "captured" && market.phase !== "allocated")
          throw new Error(
            "Actual fees must be captured before the original NFT returns.",
          );
        if (!s.positions.some((p) => p.seriesId === market.id))
          throw new Error(
            "Only the residual beneficiary can recover this NFT.",
          );
        market.nftReturned = true;
      }
      if (action.type === "settle") {
        if (market.phase !== "captured")
          throw new Error("Capture the reserve before proof allocation.");
        market.allocatedMicros = "840000000";
        market.phase = "allocated";
      }
      if (action.type === "redeem") {
        if (market.phase !== "allocated")
          throw new Error(
            "Allocation is unresolved. Your claims remain valid.",
          );
        const held = BigInt(s.wallet.claims[market.id] ?? "0");
        if (held === 0n)
          throw new Error("No unredeemed claims in this wallet.");
        const payout =
          (held * BigInt(market.allocatedMicros)) /
          BigInt(market.originalSupply);
        s.wallet.usdcBalanceMicros = (
          BigInt(s.wallet.usdcBalanceMicros) + payout
        ).toString();
        s.wallet.claims[market.id] = "0";
        market.redeemedClaims = (
          BigInt(market.redeemedClaims) + held
        ).toString();
      }
      if (action.type === "closeEarly") {
        if (
          market.phase !== "active" ||
          BigInt(market.redeemedClaims) !== 0n ||
          s.wallet.claims[market.id] !== market.originalSupply ||
          !s.positions.some((p) => p.seriesId === market.id)
        )
          throw new Error(
            "Early closure requires the residual right and all original Q claims, before any redemption.",
          );
        s.wallet.claims[market.id] = "0";
        market.nftReturned = true;
        market.availableClaims = "0";
      }
    } else throw new Error("Series unavailable.");
    return {
      mode: "fixture",
      description: "Fixture state updated. No transaction was broadcast.",
    };
  }
}
