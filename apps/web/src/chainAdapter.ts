import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  erc20Abi,
  encodeAbiParameters,
  decodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseAbiParameters,
  sliceHex,
  getAddress,
  isAddress,
  zeroAddress,
  toHex,
  type Address,
  type Hex,
  type Abi,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import {
  feeStripAbi,
  feeStripMarketAbi,
  feeStripRouterAbi,
  aquaAbi,
  positionManagerAbi,
} from "./generated/contracts";
import type {
  Action,
  ActionResult,
  AnalysisResult,
  BuyerAnalysis,
  FeeStripAdapter,
  Market,
  Position,
  Quote,
  Snapshot,
  WalletState,
} from "./types";
import { CLAIM_UNIT } from "./amounts";

export interface Deployment {
  mode: "local" | "testnet";
  chainId: number;
  rpcUrl: string;
  feeStrip: Address;
  usdc: Address;
  other: Address;
  positionManager: Address;
  poolManager: Address;
  verifier: Address;
  checkpoints: Address;
  market: Address;
  swapRouter: Address;
  aqua: Address;
  nftIds: string[];
  actors?: { seller: Address; buyer: Address; holder: Address };
  deploymentBlock?: string;
  blockTimeSeconds?: number;
}
// Independently verified public source pins, docs/evidence/sepolia-preflight.json.
// A proxy runtime hash is a deployment check, not a freeze on USDC upgrades.
const SEPOLIA = {
  poolManager: {
    address: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
    hash: "0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1",
  },
  positionManager: {
    address: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
    hash: "0xcffd746f78c2b50aafd19076bbe9c48f14446e5248fc5d76b9b4896610e51aab",
  },
  usdc: {
    address: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    hash: "0xcd3f29e2ea9c61dadd48bfeaf8b2884b6de9dfee7bf45329452c4c33d0868ceb",
  },
} as const;
export function assertChainScope(d: Deployment) {
  if (d.mode === "local") {
    if (
      d.chainId !== 31337 ||
      !["127.0.0.1", "localhost", "[::1]"].includes(new URL(d.rpcUrl).hostname)
    )
      throw new Error("Local mode is restricted to a loopback chain 31337.");
  } else {
    if (d.chainId !== 11155111)
      throw new Error(
        "Only verified Ethereum Sepolia deployments are enabled in public testnet mode.",
      );
    for (const key of ["poolManager", "positionManager", "usdc"] as const)
      if (d[key].toLowerCase() !== SEPOLIA[key].address.toLowerCase())
        throw new Error(
          `The ${key} address is not the pinned canonical Sepolia deployment.`,
        );
  }
}
export async function currencyMetadata(
  currency: Address,
  readToken: (token: Address) => Promise<readonly [number, string]>,
): Promise<readonly [number, string]> {
  return currency.toLowerCase() === zeroAddress
    ? [18, "ETH"]
    : readToken(currency);
}
interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}
interface Series {
  tokenId: bigint;
  claim: Address;
  residualOwner: Address;
  key: PoolKey;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  activationBlock: bigint;
  endBlock: bigint;
  baselineX128: bigint;
  quantity: bigint;
  capturedUSDC: bigint;
  otherReserve: bigint;
  soldUSDC: bigint;
  redeemedQuantity: bigint;
  paidClaims: bigint;
  residualUSDC: bigint;
  captured: boolean;
  allocated: boolean;
  nftReturned: boolean;
  closed: boolean;
}
interface Offer {
  id: bigint;
  buyer: Address;
  seller: Address;
  tokenId: bigint;
  quantity: bigint;
  buyerQuantity: bigint;
  proceeds: bigint;
  endBlock: bigint;
  deadline: bigint;
  positionCommitment: Hex;
  consumed: boolean;
}
interface Order {
  maker: Address;
  traits: bigint;
  data: Hex;
}
interface DiscoveredQuote {
  order: Order;
  strategyHash: Hex;
  seriesId: string;
  claimUnits: bigint;
  usdcUnits: bigint;
  deadline: bigint;
  available: bigint;
  cash: Address;
  claim: Address;
}
const ORDER_PARAMETERS = parseAbiParameters(
  "(address maker,uint256 traits,bytes data)",
);
const KEY_PARAMETERS = parseAbiParameters(
  "address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks",
);
const STORAGE_ABI = parseAbi([
  "function extsload(bytes32 slot) view returns (bytes32)",
]);
const NFT_ABI = parseAbi([
  "function ownerOf(uint256 id) view returns(address)",
  "function getApproved(uint256 id) view returns(address)",
  "function isApprovedForAll(address owner,address operator) view returns(bool)",
  "function approve(address to,uint256 tokenId)",
]);
const NO_QUOTE: Quote = {
  maker: "No executable maker quote",
  expiresAt: "0",
  available: false,
};
const lower = (v: string) => v.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);
const minimum = (...n: bigint[]) => n.reduce((a, b) => (a < b ? a : b));
const ceilRatio = (q: bigint, cash: bigint, claims: bigint) =>
  (q * cash + claims - 1n) / claims;
const tick24 = (n: bigint) => Number(BigInt.asIntN(24, n));
const pairId = (key: PoolKey) =>
  keccak256(
    encodeAbiParameters(KEY_PARAMETERS, [
      key.currency0,
      key.currency1,
      key.fee,
      key.tickSpacing,
      key.hooks,
    ]),
  );
function message(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string };
  return e.shortMessage ?? e.message ?? String(error);
}
function formatPrice(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 7 }).format(
    n,
  );
}

/** Direct public-RPC reads and wallet-signed transactions; no trusted amount service. */
export class ChainAdapter implements FeeStripAdapter {
  readonly mode: "local" | "testnet";
  readonly chain;
  readonly client;
  private wallet?: WalletClient;
  private account?: Address;
  private validated = false;
  private quotes = new Map<string, DiscoveredQuote>();
  private knownSeries = new Map<string, Series>();
  private testActor?: "seller" | "buyer" | "holder";
  constructor(
    readonly deployment: Deployment,
    options: {
      provider?: EIP1193Provider;
      enableTestWallet?: boolean;
      testActor?: string;
    } = {},
  ) {
    this.mode = deployment.mode;
    this.chain = defineChain({
      id: deployment.chainId,
      name:
        deployment.mode === "local"
          ? "Local FeeStrip chain"
          : "FeeStrip testnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [deployment.rpcUrl] } },
    });
    this.client = createPublicClient({
      chain: this.chain,
      transport: http(deployment.rpcUrl),
      pollingInterval: 200,
    });
    if (options.testActor) {
      if (
        !options.enableTestWallet ||
        deployment.mode !== "local" ||
        deployment.chainId !== 31337 ||
        !["seller", "buyer", "holder"].includes(options.testActor)
      )
        throw new Error(
          "Unlocked test wallets require the explicit test flag and local chain 31337.",
        );
      const endpoint = new URL(deployment.rpcUrl);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))
        throw new Error("Unlocked test wallets only use a loopback RPC.");
      this.testActor = options.testActor as "seller" | "buyer" | "holder";
    } else if (options.provider)
      this.wallet = createWalletClient({
        chain: this.chain,
        transport: custom(options.provider),
      });
  }
  static async fromDeployment(
    url = "/deployment.json",
    options: {
      provider?: EIP1193Provider;
      enableTestWallet?: boolean;
      testActor?: string;
    } = {},
  ) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        "Deployment configuration unavailable. Local/testnet mode cannot fall back to fixtures.",
      );
    const config = (await response.json()) as Deployment;
    if (
      !["local", "testnet"].includes(config.mode) ||
      !Number.isSafeInteger(config.chainId) ||
      typeof config.rpcUrl !== "string" ||
      !Array.isArray(config.nftIds)
    )
      throw new Error("Invalid deployment configuration.");
    for (const key of [
      "feeStrip",
      "usdc",
      "other",
      "positionManager",
      "poolManager",
      "verifier",
      "checkpoints",
      "market",
      "swapRouter",
      "aqua",
    ] as const)
      if (
        !isAddress(config[key]) ||
        (key !== "other" && same(config[key], zeroAddress))
      )
        throw new Error(`Invalid deployment address: ${key}.`);
    const adapter = new ChainAdapter(config, options);
    await adapter.validate();
    return adapter;
  }
  private read<T>(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
    blockNumber?: bigint,
  ): Promise<T> {
    return this.client.readContract({
      address,
      abi,
      functionName,
      args,
      blockNumber,
    }) as Promise<T>;
  }
  async validate() {
    if (this.validated) return;
    const d = this.deployment;
    assertChainScope(d);
    if ((await this.client.getChainId()) !== d.chainId)
      throw new Error("RPC chain ID does not match deployment configuration.");
    const addresses = [
      d.feeStrip,
      d.usdc,
      d.other,
      d.positionManager,
      d.poolManager,
      d.verifier,
      d.checkpoints,
      d.market,
      d.swapRouter,
      d.aqua,
    ].filter((address) => !same(address, zeroAddress));
    const codes = await Promise.all(
      addresses.map((address) => this.client.getCode({ address })),
    );
    if (codes.some((code) => !code || code === "0x"))
      throw new Error("A configured deployment has no contract code.");
    if (d.mode === "testnet")
      for (const key of ["poolManager", "positionManager", "usdc"] as const) {
        const code =
          codes[addresses.findIndex((address) => same(address, d[key]))];
        if (!code || keccak256(code) !== SEPOLIA[key].hash)
          throw new Error(
            `The ${key} runtime differs from the reviewed canonical Sepolia code hash.`,
          );
      }
    const [
      posm,
      pool,
      cash,
      verifier,
      marketStrip,
      router,
      decimals,
      verifierPool,
      verifierCheckpoints,
      routerAqua,
    ] = await Promise.all([
      this.read<Address>(d.feeStrip, feeStripAbi, "positionManager"),
      this.read<Address>(d.feeStrip, feeStripAbi, "poolManager"),
      this.read<Address>(d.feeStrip, feeStripAbi, "usdc"),
      this.read<Address>(d.feeStrip, feeStripAbi, "verifier"),
      this.read<Address>(d.market, feeStripMarketAbi, "feeStrip"),
      this.read<Address>(d.market, feeStripMarketAbi, "router"),
      this.read<number>(d.usdc, erc20Abi, "decimals"),
      this.read<Address>(
        d.verifier,
        parseAbi(["function poolManager() view returns(address)"]),
        "poolManager",
      ),
      this.read<Address>(
        d.verifier,
        parseAbi(["function checkpoints() view returns(address)"]),
        "checkpoints",
      ),
      this.read<Address>(d.swapRouter, feeStripRouterAbi, "AQUA"),
    ]);
    if (
      !same(posm, d.positionManager) ||
      !same(pool, d.poolManager) ||
      !same(cash, d.usdc) ||
      !same(verifier, d.verifier) ||
      !same(marketStrip, d.feeStrip) ||
      !same(router, d.swapRouter) ||
      !same(verifierPool, d.poolManager) ||
      !same(verifierCheckpoints, d.checkpoints) ||
      !same(routerAqua, d.aqua) ||
      decimals !== 6
    )
      throw new Error(
        "Contract bindings or USDC decimals do not match the deployment.",
      );
    this.validated = true;
  }
  async connect(): Promise<WalletState> {
    await this.validate();
    if (this.testActor) {
      const account = this.deployment.actors?.[this.testActor];
      if (!account || !isAddress(account))
        throw new Error("Test actor is missing from the local deployment.");
      const testClient = createWalletClient({
        chain: this.chain,
        transport: http(this.deployment.rpcUrl),
      });
      const accounts = await testClient.getAddresses();
      if (!accounts.some((a) => same(a, account)))
        throw new Error(
          "Requested local test account is not unlocked on Anvil.",
        );
      this.account = getAddress(account);
      this.wallet = createWalletClient({
        account: this.account,
        chain: this.chain,
        transport: http(this.deployment.rpcUrl),
      });
    } else {
      if (!this.wallet)
        throw new Error(
          "No injected wallet found. Install or open an EIP-1193 wallet to connect.",
        );
      const [address] = await this.wallet.requestAddresses();
      if (!address) throw new Error("Wallet returned no account.");
      this.account = address;
    }
    return (await this.load()).wallet;
  }
  async switchNetwork() {
    if (!this.wallet) throw new Error("Connect a wallet first.");
    await this.wallet.switchChain({ id: this.deployment.chainId });
  }
  private async walletState(blockNumber: bigint): Promise<WalletState> {
    if (!this.account)
      return { connected: false, usdcBalanceMicros: "0", claims: {} };
    if (!this.testActor) {
      const accounts = await this.wallet!.getAddresses();
      if (!accounts.length) {
        this.account = undefined;
        return { connected: false, usdcBalanceMicros: "0", claims: {} };
      }
      this.account = accounts[0];
    }
    const [chainId, cash, balances] = await Promise.all([
      this.wallet!.getChainId(),
      this.read<bigint>(
        this.deployment.usdc,
        erc20Abi,
        "balanceOf",
        [this.account],
        blockNumber,
      ),
      Promise.all(
        [...this.knownSeries].map(
          async ([id, s]) =>
            [
              id,
              (
                await this.read<bigint>(
                  s.claim,
                  erc20Abi,
                  "balanceOf",
                  [this.account!],
                  blockNumber,
                )
              ).toString(),
            ] as const,
        ),
      ),
    ]);
    return {
      connected: true,
      address: this.account,
      chainId,
      usdcBalanceMicros: cash.toString(),
      claims: Object.fromEntries(balances),
    };
  }
  private async poolDisplay(
    key: PoolKey,
    lowerTick: number,
    upperTick: number,
    blockNumber: bigint,
  ) {
    const d = this.deployment,
      id = pairId(key),
      slot = keccak256(
        encodeAbiParameters(parseAbiParameters("bytes32,uint256"), [id, 6n]),
      );
    const metadata = (currency: Address) =>
      currencyMetadata(currency, async (token) =>
        Promise.all([
          this.read<number>(token, erc20Abi, "decimals", [], blockNumber),
          this.read<string>(token, erc20Abi, "symbol", [], blockNumber),
        ]),
      );
    const [packed, [dec0, symbol0], [dec1, symbol1]] = await Promise.all([
      this.read<Hex>(
        d.poolManager,
        STORAGE_ABI,
        "extsload",
        [slot],
        blockNumber,
      ),
      metadata(key.currency0),
      metadata(key.currency1),
    ]);
    const data = BigInt(packed),
      tick = tick24(data >> 160n),
      sqrt = data & ((1n << 160n) - 1n),
      cash0 = same(key.currency0, d.usdc),
      ratio = (Number(sqrt) / 2 ** 96) ** 2 * 10 ** (dec0 - dec1);
    // Approximate display only. Stored tick is the authority for boundary/range state.
    const price = (t: number) => {
      const ratioAtTick = 1.0001 ** t * 10 ** (dec0 - dec1);
      return cash0 ? 1 / ratioAtTick : ratioAtTick;
    };
    const prices = [price(lowerTick), price(upperTick)];
    const relative = (100 * (tick - lowerTick)) / (upperTick - lowerTick);
    return {
      poolId: id,
      pair: `${cash0 ? symbol1 : symbol0} / ${cash0 ? symbol0 : symbol1}`,
      lowerPrice: formatPrice(Math.min(...prices)),
      upperPrice: formatPrice(Math.max(...prices)),
      currentPrice: formatPrice(cash0 ? 1 / ratio : ratio),
      priceIsIndicative: true,
      inRange: tick >= lowerTick && tick < upperTick,
      currentRangePercent: Math.max(
        2,
        Math.min(98, cash0 ? 100 - relative : relative),
      ),
      feeTier: `${key.fee / 10000}%`,
    };
  }
  async load(): Promise<Snapshot> {
    await this.validate();
    const d = this.deployment,
      block = await this.client.getBlock();
    const bn = block.number;
    const [nextSeries, nextOffer] = await Promise.all([
      this.read<bigint>(d.feeStrip, feeStripAbi, "nextSeriesId", [], bn),
      this.read<bigint>(d.feeStrip, feeStripAbi, "nextOfferId", [], bn),
    ]);
    if (nextSeries > 1001n || nextOffer > 5001n)
      throw new Error(
        "Deployment exceeds the browser enumeration limit; a paginated indexer is required.",
      );
    const [series, offers] = await Promise.all([
      Promise.all(
        Array.from(
          { length: Number(nextSeries - 1n) },
          async (_, i) =>
            [
              String(i + 1),
              await this.read<Series>(
                d.feeStrip,
                feeStripAbi,
                "series",
                [BigInt(i + 1)],
                bn,
              ),
            ] as const,
        ),
      ),
      Promise.all(
        Array.from({ length: Number(nextOffer - 1n) }, async (_, i) => {
          const o = await this.read<
            readonly [
              Address,
              Address,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              Hex,
              boolean,
            ]
          >(d.feeStrip, feeStripAbi, "offers", [BigInt(i + 1)], bn);
          return {
            id: BigInt(i + 1),
            buyer: o[0],
            seller: o[1],
            tokenId: o[2],
            quantity: o[3],
            buyerQuantity: o[4],
            proceeds: o[5],
            endBlock: o[6],
            deadline: o[7],
            positionCommitment: o[8],
            consumed: o[9],
          } satisfies Offer;
        }),
      ),
    ]);
    this.knownSeries = new Map(series);
    this.quotes = await this.discoverQuotes(block.timestamp, bn);
    const markets = await Promise.all(
      series.map(async ([id, s]): Promise<Market> => {
        const [display, activation] = await Promise.all([
          this.poolDisplay(s.key, s.tickLower, s.tickUpper, bn),
          this.client.getBlock({ blockNumber: s.activationBlock }),
        ]);
        const q = this.quotes.get(id),
          quote: Quote = q
            ? {
                maker: q.order.maker,
                expiresAt: q.deadline.toString(),
                available: q.available > 0n,
                ratioClaimUnits: q.claimUnits.toString(),
                ratioUsdcUnits: q.usdcUnits.toString(),
                strategyHash: q.strategyHash,
              }
            : { ...NO_QUOTE };
        const estimated =
          block.timestamp +
          (s.endBlock - bn) *
            BigInt(d.blockTimeSeconds ?? (d.mode === "local" ? 1 : 12));
        const date = (timestamp: bigint) =>
          new Date(Number(timestamp) * 1000).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          });
        return {
          ...display,
          id,
          tokenId: s.tokenId.toString(),
          lowerTick: s.tickLower,
          upperTick: s.tickUpper,
          liquidity: s.liquidity.toString(),
          startBlock: s.activationBlock.toString(),
          endBlock: s.endBlock.toString(),
          startDate: date(activation.timestamp),
          endDate: date(estimated),
          originalSupply: s.quantity.toString(),
          askMicros: q
            ? ceilRatio(CLAIM_UNIT, q.usdcUnits, q.claimUnits).toString()
            : "0",
          availableClaims: q?.available.toString() ?? "0",
          phase: s.closed
            ? "closed"
            : s.allocated
              ? "allocated"
              : s.captured
                ? "captured"
                : bn > s.endBlock
                  ? "matured"
                  : "active",
          capturedMicros: s.capturedUSDC.toString(),
          allocatedMicros: s.soldUSDC.toString(),
          redeemedClaims: s.redeemedQuantity.toString(),
          nftReturned: s.nftReturned,
          historicalUsdcMicros: "0",
          history: [],
          sourceFromBlock: "0",
          sourceToBlock: "0",
          quote,
          baselineX128: s.baselineX128.toString(),
          residualOwner: s.residualOwner,
          residualUsdcMicros: s.residualUSDC.toString(),
          otherReserve: s.otherReserve.toString(),
        };
      }),
    );
    const wallet = await this.walletState(bn);
    const nftIds = [
      ...new Set([
        ...d.nftIds,
        ...offers.map((o) => o.tokenId.toString()),
        ...series.map(([, s]) => s.tokenId.toString()),
      ]),
    ];
    const positions = await Promise.all(
      nftIds.map(async (tokenId): Promise<Position | undefined> => {
        const [owner, info, liquidity] = await Promise.all([
          this.read<Address>(
            d.positionManager,
            NFT_ABI,
            "ownerOf",
            [BigInt(tokenId)],
            bn,
          ),
          this.read<readonly [PoolKey, bigint]>(
            d.positionManager,
            positionManagerAbi,
            "getPoolAndPositionInfo",
            [BigInt(tokenId)],
            bn,
          ),
          this.read<bigint>(
            d.positionManager,
            positionManagerAbi,
            "getPositionLiquidity",
            [BigInt(tokenId)],
            bn,
          ),
        ]);
        const key = info[0],
          packed = info[1],
          lowerTick = tick24(packed >> 8n),
          upperTick = tick24(packed >> 32n);
        if (
          !same(key.hooks, zeroAddress) ||
          liquidity === 0n ||
          (packed & 255n) !== 0n ||
          (!same(key.currency0, d.usdc) && !same(key.currency1, d.usdc))
        )
          return undefined;
        const market = markets.find((m) => m.tokenId === tokenId),
          s = market && this.knownSeries.get(market.id);
        // Show known unsold NFTs as offer targets; custody actions still require the actual owner.
        const own = wallet.connected && same(owner, wallet.address!);
        const residual =
          wallet.connected && s && same(s.residualOwner, wallet.address!);
        if (market && !own && !residual) return undefined;
        const [approved, approvedAll, display] = await Promise.all([
          this.read<Address>(
            d.positionManager,
            NFT_ABI,
            "getApproved",
            [BigInt(tokenId)],
            bn,
          ),
          this.read<boolean>(
            d.positionManager,
            NFT_ABI,
            "isApprovedForAll",
            [owner, d.feeStrip],
            bn,
          ),
          this.poolDisplay(key, lowerTick, upperTick, bn),
        ]);
        const funded = offers
          .filter(
            (o) =>
              o.tokenId === BigInt(tokenId) &&
              !o.consumed &&
              o.deadline >= block.timestamp &&
              o.endBlock > bn,
          )
          .sort((a, b) => (a.proceeds > b.proceeds ? -1 : 1))[0];
        return {
          tokenId,
          pair: display.pair,
          feeTier: display.feeTier,
          lowerPrice: display.lowerPrice,
          upperPrice: display.upperPrice,
          liquidity: liquidity.toString(),
          approved: same(approved, d.feeStrip) || approvedAll,
          seriesId: market?.id,
          owner,
          ownedByWallet: own,
          offer: funded
            ? {
                id: funded.id.toString(),
                fundedMicros: funded.proceeds.toString(),
                claims: funded.buyerQuantity.toString(),
                originalSupply: funded.quantity.toString(),
                endBlock: funded.endBlock.toString(),
                deadlineTimestamp: funded.deadline.toString(),
                maker: funded.buyer,
              }
            : undefined,
        };
      }),
    );
    return {
      mode: d.mode,
      network:
        d.mode === "local" ? "Local chain · test tokens" : this.chain.name,
      chainId: d.chainId,
      blockNumber: bn.toString(),
      timestamp: block.timestamp.toString(),
      sourceBlock: bn.toString(),
      markets,
      positions: positions.filter((p): p is Position => !!p),
      wallet,
      quote: markets[0]?.quote ?? { ...NO_QUOTE },
      scenario: "normal",
    };
  }
  private async discoverQuotes(
    timestamp: bigint,
    blockNumber: bigint,
  ): Promise<Map<string, DiscoveredQuote>> {
    const d = this.deployment,
      found = new Map<string, DiscoveredQuote>();
    const event = parseAbi([
      "event Shipped(address maker,address app,bytes32 strategyHash,bytes strategy)",
    ])[0];
    const logs = await this.client.getLogs({
      address: d.aqua,
      event,
      fromBlock: BigInt(d.deploymentBlock ?? "0"),
      toBlock: blockNumber,
      strict: true,
    });
    for (const log of logs) {
      if (!same(log.args.app, d.swapRouter)) continue;
      // Public log data is untrusted. Only byte-identical outputs of the pinned onchain
      // builder qualify; hooks, token pair, state commitment and complete program bind.
      try {
        const [order] = decodeAbiParameters(
          ORDER_PARAMETERS,
          log.args.strategy,
        ) as readonly [Order];
        if (
          !same(order.maker, log.args.maker) ||
          keccak256(log.args.strategy) !== log.args.strategyHash
        )
          continue;
        const preEnd = Number((order.traits >> 160n) & 65535n),
          programStart = Number((order.traits >> 208n) & 65535n);
        if (preEnd !== 124 || programStart < preEnd) continue;
        if (!same(sliceHex(order.data, 40, 60), d.market)) continue;
        const [id] = decodeAbiParameters(
          parseAbiParameters("uint256,bytes32"),
          sliceHex(order.data, 60, 124),
        );
        const s = this.knownSeries.get(id.toString());
        if (!s || s.closed) continue;
        const program = sliceHex(order.data, programStart),
          bytes = (program.length - 2) / 2;
        if (
          bytes !== 110 ||
          sliceHex(program, 0, 2) !== "0x2005" ||
          sliceHex(program, 7, 9) !== "0x9040" ||
          sliceHex(program, 73, 75) !== "0x5301" ||
          sliceHex(program, 76, 78) !== "0x0220"
        )
          continue;
        const deadline = BigInt(sliceHex(program, 2, 7));
        if (deadline <= timestamp) continue;
        const first = BigInt(sliceHex(program, 9, 41)),
          second = BigInt(sliceHex(program, 41, 73));
        const claimUnits = BigInt(s.claim) < BigInt(d.usdc) ? first : second,
          usdcUnits = BigInt(s.claim) < BigInt(d.usdc) ? second : first;
        if (claimUnits === 0n || usdcUnits === 0n) continue;
        const salt = sliceHex(program, 78, 110);
        const rebuilt = await this.read<Order>(
          d.market,
          feeStripMarketAbi,
          "buildOrder",
          [id, order.maker, false, claimUnits, usdcUnits, deadline, salt],
          blockNumber,
        );
        if (
          encodeAbiParameters(ORDER_PARAMETERS, [rebuilt]) !== log.args.strategy
        )
          continue;
        const [virtual, balance, allowance] = await Promise.all([
          this.read<readonly [bigint, bigint]>(
            d.aqua,
            aquaAbi,
            "safeBalances",
            [order.maker, d.swapRouter, log.args.strategyHash, d.usdc, s.claim],
            blockNumber,
          ),
          this.read<bigint>(
            s.claim,
            erc20Abi,
            "balanceOf",
            [order.maker],
            blockNumber,
          ),
          this.read<bigint>(
            s.claim,
            erc20Abi,
            "allowance",
            [order.maker, d.aqua],
            blockNumber,
          ),
        ]);
        const available = minimum(claimUnits, virtual[1], balance, allowance);
        if (available === 0n) continue;
        const candidate = {
          order,
          strategyHash: log.args.strategyHash,
          seriesId: id.toString(),
          claimUnits,
          usdcUnits,
          deadline,
          available,
          cash: d.usdc,
          claim: s.claim,
        };
        const previous = found.get(id.toString());
        if (
          !previous ||
          usdcUnits * previous.claimUnits < previous.usdcUnits * claimUnits
        )
          found.set(id.toString(), candidate);
      } catch {
        // Malformed, obsolete or revoked external strategies are not executable quotes.
        continue;
      }
    }
    return found;
  }
  private async signer() {
    if (!this.wallet || !this.account)
      throw new Error("Connect a wallet before continuing.");
    if ((await this.wallet.getChainId()) !== this.deployment.chainId)
      throw new Error(
        "Wrong wallet network. Switch to the configured FeeStrip chain.",
      );
    if (!this.testActor) {
      const accounts = await this.wallet.getAddresses();
      if (!accounts.some((a) => same(a, this.account!)))
        throw new Error(
          "Wallet account changed. Reconnect and review the transaction again.",
        );
    }
    return { wallet: this.wallet, account: this.account };
  }
  private async write(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Hex> {
    const { wallet, account } = await this.signer();
    const data = encodeFunctionData({ abi, functionName, args });
    await this.client.call({ account, to: address, data });
    const hash = await wallet.sendTransaction({
      account,
      chain: this.chain,
      to: address,
      data,
    });
    let replacementReason: string | undefined;
    const receipt = await this.client.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      onReplaced: ({ reason }) => {
        replacementReason = reason;
      },
    });
    if (replacementReason === "cancelled" || replacementReason === "replaced")
      throw new Error(
        "Wallet transaction was cancelled or replaced by a different action. Refresh the confirmed chain state before trying again.",
      );
    if (receipt.status !== "success")
      throw new Error(
        `Transaction reverted: ${hash}. Confirmed earlier approvals, if any, remain in place.`,
      );
    return receipt.transactionHash;
  }
  private async approve(
    token: Address,
    spender: Address,
    amount: bigint,
    hashes: Hex[],
  ) {
    const { account } = await this.signer();
    const allowance = await this.read<bigint>(token, erc20Abi, "allowance", [
      account,
      spender,
    ]);
    if (allowance < amount)
      hashes.push(
        await this.write(token, erc20Abi, "approve", [spender, amount]),
      );
  }
  async readAnalysis(
    seriesId: string,
    quantity: string,
    price: string,
    executionCost = "0",
  ): Promise<AnalysisResult> {
    if (
      !/^\d+$/.test(seriesId) ||
      !/^\d+$/.test(quantity) ||
      BigInt(quantity) <= 0n ||
      !/^\d+$/.test(price) ||
      !/^\d+$/.test(executionCost)
    )
      return {
        status: "unavailable",
        reason:
          "Choose a positive claim quantity and a valid USDC purchase cost.",
      };
    try {
      const params = new URLSearchParams({
        seriesId,
        quantity,
        price,
        executionCost,
      });
      const response = await fetch("/api/analysis?" + params.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        let reason =
          "Verified common-block analysis unavailable. Connect the Substreams sink and FeeStrip Subgraph provider.";
        try {
          const body = await response.json();
          if (typeof body.error === "string") reason = body.error;
        } catch {}
        return { status: "unavailable", reason };
      }
      const analysis = (await response.json()) as BuyerAnalysis;
      if (
        analysis.seriesId !== seriesId ||
        analysis.allocationAuthority !== "contract-only" ||
        !/^0x[a-fA-F0-9]{64}$/.test(analysis.sourceHash) ||
        !Number.isSafeInteger(analysis.sourceBlock) ||
        !Number.isSafeInteger(analysis.lagBlocks) ||
        !Number.isInteger(analysis.coverageBps) ||
        analysis.coverageBps < 0 ||
        analysis.coverageBps > 10000 ||
        (analysis.occupancyBps !== null &&
          (!Number.isInteger(analysis.occupancyBps) ||
            analysis.occupancyBps < 0 ||
            analysis.occupancyBps > 10000)) ||
        !/^\d+$/.test(analysis.grossBreakEvenUSDC) ||
        !/^\d+$/.test(analysis.netBreakEvenUSDC) ||
        !Array.isArray(analysis.caveats)
      )
        return {
          status: "unavailable",
          reason:
            "Analysis response did not include valid series, source and coverage evidence.",
        };
      return { status: "available", analysis };
    } catch {
      return {
        status: "unavailable",
        reason:
          "Historical activity unavailable. The analysis service or its verified Graph sources could not be reached.",
      };
    }
  }
  async execute(action: Action): Promise<ActionResult> {
    await this.validate();
    const { account } = await this.signer(),
      d = this.deployment,
      hashes: Hex[] = [];
    try {
      if (action.type === "approvePosition") {
        if (
          !same(
            await this.read<Address>(d.positionManager, NFT_ABI, "ownerOf", [
              BigInt(action.tokenId),
            ]),
            account,
          )
        )
          throw new Error(
            "Only the current NFT owner can approve its transfer.",
          );
        hashes.push(
          await this.write(d.positionManager, NFT_ABI, "approve", [
            d.feeStrip,
            BigInt(action.tokenId),
          ]),
        );
      } else if (action.type === "fundOffer") {
        const seller = await this.read<Address>(
            d.positionManager,
            NFT_ABI,
            "ownerOf",
            [BigInt(action.tokenId)],
          ),
          proceeds = BigInt(action.paymentMicros),
          buyerQuantity = BigInt(action.claims);
        if (
          proceeds <= 0n ||
          buyerQuantity <= 0n ||
          buyerQuantity > 10000n * CLAIM_UNIT
        )
          throw new Error(
            "Funded terms require positive payment and claims within original Q.",
          );
        await this.approve(d.usdc, d.feeStrip, proceeds, hashes);
        hashes.push(
          await this.write(d.feeStrip, feeStripAbi, "fundOffer", [
            seller,
            BigInt(action.tokenId),
            10000n * CLAIM_UNIT,
            buyerQuantity,
            proceeds,
            BigInt(action.endBlock),
            BigInt(action.deadlineTimestamp),
          ]),
        );
      } else if (action.type === "acceptOffer") {
        hashes.push(
          await this.write(d.feeStrip, feeStripAbi, "acceptOffer", [
            BigInt(action.offerId),
            BigInt(action.minimumProceedsMicros),
          ]),
        );
      } else if (action.type === "publishQuote") {
        const id = BigInt(action.seriesId),
          quantity = BigInt(action.quantity),
          cash = BigInt(action.usdcMicros),
          deadline = BigInt(action.expiresAt),
          s = await this.read<Series>(d.feeStrip, feeStripAbi, "series", [id]);
        if (s.closed || quantity <= 0n || cash <= 0n)
          throw new Error("Choose positive quote amounts for an open series.");
        if (
          (await this.read<bigint>(s.claim, erc20Abi, "balanceOf", [account])) <
          quantity
        )
          throw new Error("The quote exceeds your actual claim balance.");
        const entropy = new Uint8Array(32);
        globalThis.crypto.getRandomValues(entropy);
        const salt = toHex(entropy);
        const order = await this.read<Order>(
          d.market,
          feeStripMarketAbi,
          "buildOrder",
          [id, account, false, quantity, cash, deadline, salt],
        );
        await this.approve(s.claim, d.aqua, quantity, hashes);
        hashes.push(
          await this.write(d.aqua, aquaAbi, "ship", [
            d.swapRouter,
            encodeAbiParameters(ORDER_PARAMETERS, [order]),
            [d.usdc, s.claim],
            [0n, quantity],
          ]),
        );
      } else if (action.type === "buyClaims") {
        const latest = await this.load(),
          q = this.quotes.get(action.seriesId);
        if (!q)
          throw new Error(
            "No executable quote remains. Maker balances, allowance, or series state changed.",
          );
        if (action.strategyHash && action.strategyHash !== q.strategyHash)
          throw new Error(
            "The displayed quote changed. Refresh and review its exact terms.",
          );
        const quantity = BigInt(action.quantity),
          cost = ceilRatio(quantity, q.usdcUnits, q.claimUnits),
          deadline = minimum(q.deadline, BigInt(action.expiresAt));
        if (
          quantity <= 0n ||
          quantity > q.available ||
          cost > BigInt(action.maximumPaymentMicros) ||
          deadline <= BigInt(latest.timestamp)
        )
          throw new Error(
            "Quote size, price limit or deadline is no longer valid. Refresh the quote.",
          );
        const taker = await this.read<Hex>(
          d.market,
          feeStripMarketAbi,
          "takerData",
          [account, d.usdc, q.claim, quantity, deadline],
        );
        const preview = await this.read<readonly [bigint, bigint, Hex]>(
          d.swapRouter,
          feeStripRouterAbi,
          "quote",
          [q.order, cost, taker],
        );
        if (
          preview[0] > BigInt(action.maximumPaymentMicros) ||
          preview[1] < quantity ||
          preview[2] !== q.strategyHash
        )
          throw new Error(
            "Swap preview no longer meets the reviewed minimum claims and maximum USDC.",
          );
        await this.approve(d.usdc, d.swapRouter, cost, hashes);
        hashes.push(
          await this.write(d.swapRouter, feeStripRouterAbi, "swap", [
            q.order,
            cost,
            taker,
          ]),
        );
      } else {
        const id = BigInt(action.seriesId);
        if (action.type === "capture")
          hashes.push(
            await this.write(d.feeStrip, feeStripAbi, "capture", [id]),
          );
        else if (action.type === "withdrawNFT")
          hashes.push(
            await this.write(d.feeStrip, feeStripAbi, "withdrawNFT", [
              id,
              account,
            ]),
          );
        else if (action.type === "withdrawResidual")
          hashes.push(
            await this.write(d.feeStrip, feeStripAbi, "withdrawResidual", [
              id,
              account,
            ]),
          );
        else if (action.type === "closeEarly")
          hashes.push(
            await this.write(d.feeStrip, feeStripAbi, "recombine", [
              id,
              account,
            ]),
          );
        else if (action.type === "redeem") {
          const claim = await this.read<Address>(
            d.feeStrip,
            feeStripAbi,
            "claimToken",
            [id],
          );
          const amount = await this.read<bigint>(claim, erc20Abi, "balanceOf", [
            account,
          ]);
          if (amount === 0n)
            throw new Error("No unredeemed claims remain in this wallet.");
          hashes.push(
            await this.write(d.feeStrip, feeStripAbi, "redeem", [
              id,
              amount,
              account,
            ]),
          );
        } else if (action.type === "settle") {
          const response = await fetch(`/witness-${id}.json`, {
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(
              "Historical witness unavailable. The captured NFT can return while allocation remains pending; the USDC reserve stays preserved.",
            );
          const file = (await response.json()) as {
            witness?: Hex;
            seriesId?: string;
            endBlock?: string;
            chainId?: number;
          };
          if (!file.witness || !/^0x(?:[0-9a-fA-F]{2})+$/.test(file.witness))
            throw new Error(
              "Retained witness file is invalid. No allocation was submitted.",
            );
          const s = await this.read<Series>(d.feeStrip, feeStripAbi, "series", [
            id,
          ]);
          if (
            (file.seriesId !== undefined && BigInt(file.seriesId) !== id) ||
            (file.endBlock !== undefined &&
              BigInt(file.endBlock) !== s.endBlock) ||
            (file.chainId !== undefined && file.chainId !== d.chainId)
          )
            throw new Error(
              "Witness metadata does not match this series endpoint and chain.",
            );
          hashes.push(
            await this.write(d.feeStrip, feeStripAbi, "settle", [
              id,
              file.witness,
            ]),
          );
        } else throw new Error("Unsupported onchain action.");
      }
      return {
        mode: this.mode,
        description: `Confirmed on ${this.mode === "local" ? "local chain" : "testnet"}.${hashes.length > 1 ? " Required token approval also confirmed." : ""}`,
        transactionHash: hashes[hashes.length - 1],
        transactionHashes: hashes,
      };
    } catch (error) {
      throw new Error(
        `${message(error)}${hashes.length ? ` Earlier confirmed approval: ${hashes.join(", ")}.` : ""}`,
      );
    }
  }
}
