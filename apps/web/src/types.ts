export type DataMode = "fixture" | "local" | "testnet";
export type SeriesPhase =
  | "active"
  | "matured"
  | "captured"
  | "allocated"
  | "closed";
export type Scenario =
  | "normal"
  | "wrong-network"
  | "rejected-signature"
  | "insufficient-funds"
  | "no-quotes"
  | "stale-quote"
  | "transaction-failure"
  | "indexer-lag"
  | "no-positions";
export interface Quote {
  maker: string;
  expiresAt: string;
  available: boolean;
  ratioClaimUnits?: string;
  ratioUsdcUnits?: string;
  strategyHash?: string;
  advertisedClaims?: string;
  executableClaims?: string;
}
export type StrategyLimitation =
  | "cancelled"
  | "expired"
  | "series-state-changed"
  | "depleted"
  | "allowance-revoked"
  | "allowance-limited"
  | "wallet-balance-limited"
  | "partially-filled"
  | "unavailable";
export interface MakerStrategy {
  strategyHash: string;
  app: string;
  maker: string;
  seriesId: string;
  claimsIn: boolean;
  claimToken: string;
  cashToken: string;
  advertisedClaims: string;
  advertisedUSDC: string;
  executableClaims: string;
  virtualOutput: string;
  walletOutput: string;
  allowanceOutput: string;
  expiresAt: string;
  limitations: StrategyLimitation[];
  cancellable: boolean;
}
export interface Market {
  id: string;
  pair: string;
  tokenId: string;
  feeTier: string;
  poolId: string;
  lowerPrice: string;
  upperPrice: string;
  currentPrice: string;
  currentRangePercent?: number;
  priceIsIndicative?: boolean;
  quote?: Quote;
  bid?: Quote;
  baselineX128?: string;
  residualOwner?: string;
  residualUsdcMicros?: string;
  otherReserve?: string;
  nativePairLabel?: string;
  lowerTick: number;
  upperTick: number;
  liquidity: string;
  inRange: boolean;
  startBlock: string;
  endBlock: string;
  startDate: string;
  endDate: string;
  /** Claim quantities use 18-decimal base units; USDC values use 6. */
  originalSupply: string;
  askMicros: string;
  availableClaims: string;
  phase: SeriesPhase;
  capturedMicros: string;
  allocatedMicros: string;
  redeemedClaims: string;
  nftReturned: boolean;
  historicalUsdcMicros: string;
  history: number[];
  sourceFromBlock: string;
  sourceToBlock: string;
}
export interface Position {
  feeTier?: string;
  owner?: string;
  ownedByWallet?: boolean;
  tokenId: string;
  pair: string;
  lowerPrice: string;
  upperPrice: string;
  liquidity: string;
  approved: boolean;
  seriesId?: string;
  offer?: {
    id: string;
    fundedMicros: string;
    claims: string;
    originalSupply: string;
    endBlock: string;
    deadlineTimestamp: string;
    maker: string;
  };
}
export interface WalletState {
  connected: boolean;
  address?: string;
  chainId?: number;
  usdcBalanceMicros: string;
  claims: Record<string, string>;
}
export interface FundedOffer {
  id: string;
  tokenId: string;
  seller: string;
  buyer: string;
  fundedMicros: string;
  claims: string;
  originalSupply: string;
  endBlock: string;
  deadlineTimestamp: string;
  expired: boolean;
}
export interface Snapshot {
  positionDiscoveryNotice?: string;
  mode: DataMode;
  network: string;
  chainId: number;
  blockNumber: string;
  timestamp: string;
  sourceBlock: string;
  feeStrip?: string;
  markets: Market[];
  positions: Position[];
  fundedOffers: FundedOffer[];
  strategies: MakerStrategy[];
  wallet: WalletState;
  quote: Quote;
  scenario: Scenario;
}
export type Action = { reviewedAccount?: string } & (
  | {
      type: "dockQuote";
      strategyHash: string;
      app: string;
      claimToken: string;
      cashToken: string;
    }
  | {
      type: "sellClaims";
      seriesId: string;
      quantity: string;
      minimumUSDC: string;
      expiresAt: string;
      strategyHash: string;
    }
  | { type: "cancelOffer"; offerId: string }
  | {
      type: "fundOffer";
      tokenId: string;
      paymentMicros: string;
      claims: string;
      endBlock: string;
      deadlineTimestamp: string;
    }
  | { type: "approvePosition"; tokenId: string }
  | {
      type: "acceptOffer";
      tokenId: string;
      offerId: string;
      minimumProceedsMicros: string;
    }
  | {
      type: "buyClaims";
      seriesId: string;
      quantity: string;
      maximumPaymentMicros: string;
      expiresAt: string;
      strategyHash?: string;
    }
  | {
      type: "publishQuote";
      claimsIn?: boolean;
      seriesId: string;
      quantity: string;
      usdcMicros: string;
      expiresAt: string;
    }
  | {
      type:
        | "capture"
        | "withdrawNFT"
        | "settle"
        | "redeem"
        | "closeEarly"
        | "withdrawResidual";
      seriesId: string;
    }
);
export interface ActionResult {
  mode: DataMode;
  description: string;
  transactionHash?: `0x${string}`;
  transactionHashes?: `0x${string}`[];
}
export interface FeeStripAdapter {
  readonly mode: DataMode;
  load(): Promise<Snapshot>;
  connect(): Promise<WalletState>;
  findPosition?(input: string): Promise<string>;
  execute(action: Action): Promise<ActionResult>;
  switchNetwork?(): Promise<void>;
  readRecovery?(seriesId: string): Promise<RecoveryResult>;
  downloadRecoveryArtifact?(seriesId: string): Promise<RecoveryDownload>;
  readAnalysis?(
    seriesId: string,
    quantity: string,
    price: string,
    executionCost?: string,
  ): Promise<AnalysisResult>;
}

export interface BuyerAnalysis {
  seriesId: string;
  poolKey: string;
  sourceBlock: number;
  sourceHash: string;
  subgraphDeployment: string;
  substreamsPackage: string;
  substreamsCursor: string;
  lagBlocks: number;
  stale: boolean;
  grossBreakEvenUSDC: string;
  netBreakEvenUSDC: string;
  knownBlocks: number;
  inRangeBlocks: number;
  totalBlocks: number;
  occupancyBps: number | null;
  coverageBps: number;
  substreamsFinalBlock: number | null;
  sourceFinalized: boolean;
  allocationAuthority: "contract-only";
  caveats: string[];
}
export type AnalysisResult =
  | { status: "available"; analysis: BuyerAnalysis }
  | { status: "unavailable"; reason: string };

export interface RecoveryObservation {
  schemaVersion: 1;
  seriesId: string;
  chainId: number | string;
  feeStrip: string;
  verifier: string;
  manager: string;
  endBlock: string;
  state:
    | "scheduled"
    | "retained"
    | "unavailable"
    | "orphaned"
    | "cached-onchain"
    | "not-required";
  lifecycle: string;
  endpointHash: string | null;
  finalized: boolean;
  checkpointSaved: boolean;
  checkpointHash: string | null;
  growthCached: boolean;
  artifactDigest: string | null;
  copies: number;
  storageDescription: string;
  lastObservedBlock: string | null;
  lastObservedHash: string | null;
  lastObservedAt: number | null;
  finalityObserved: boolean;
  discoveryComplete: boolean;
  observationError: string | null;
  error: string | null;
  allocationAuthority: "contract-only";
  updatedAt: number;
}
export type RecoveryResult =
  | { status: "observed" | "stale"; observation: RecoveryObservation }
  | {
      status: "unavailable";
      reason: string;
      failure?: "service" | "scope";
      simulated?: boolean;
    };
export interface RecoveryDownload {
  json: string;
  filename: string;
}
