import { serializePublicTransaction, transactionIdentity } from "./transactionIdentity";
import { guardsSubmission, MAX_RECEIPT_GUARDS, readReceipts, saveReceipt } from "./receipts";
import { readOperations } from "./operations";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  erc20Abi,
  encodeAbiParameters,
  decodeAbiParameters,
  decodeEventLog,
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
  TransactionProgress,
  AnalysisResult,
  BuyerAnalysis,
  FeeStripAdapter,
  Market,
  Position,
  Quote,
  MakerStrategy,
  Snapshot,
  WalletState,
  RecoveryResult,
  RecoveryDownload,
  RecoveryObservation,
} from "./types";
import { CLAIM_UNIT } from "./amounts";
import { validateRecovery, verifyArtifactDigest } from "./recovery";
import { positionId, positionIneligibility, recentPositionIds, POSITION_LIMIT } from "./positionDiscovery";

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
/** Artifact metadata is a preflight hint; the contract authenticates the witness. */
export function assertWitnessScope(
  file: {
    chainId?: unknown;
    seriesId?: unknown;
    endBlock?: unknown;
    blockNumber?: unknown;
    manager?: unknown;
  },
  expected: {
    chainId: number;
    seriesId: bigint;
    endBlock: bigint;
    manager: Address;
  },
) {
  const matches = (value: unknown, target: bigint) => {
    if (value === undefined) return true; // Legacy artifacts have no metadata.
    if (typeof value === "number")
      return (
        Number.isSafeInteger(value) && value >= 0 && BigInt(value) === target
      );
    return (
      typeof value === "string" &&
      /^(0|[1-9][0-9]*)$/.test(value) &&
      BigInt(value) === target
    );
  };
  if (
    !matches(file.chainId, BigInt(expected.chainId)) ||
    !matches(file.seriesId, expected.seriesId) ||
    !matches(file.endBlock, expected.endBlock) ||
    !matches(file.blockNumber, expected.endBlock) ||
    (file.manager !== undefined &&
      (typeof file.manager !== "string" ||
        file.manager.toLowerCase() !== expected.manager.toLowerCase()))
  )
    throw new Error(
      "Witness metadata does not match this series endpoint and chain.",
    );
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
type Order = CanonicalOrder;
interface DiscoveredQuote {
  record: MakerStrategy;
  claimsIn: boolean;
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
import {
  ORDER_PARAMETERS,
  decodeFrozenOrder,
  restoreFrozenOrder,
  strategyCapacity,
  type CanonicalOrder,
} from "./quotes";
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
const positionCommitment = (key: PoolKey, packed: bigint, liquidity: bigint) => keccak256(encodeAbiParameters(
  parseAbiParameters("(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),int24,int24,uint128"),
  [key, tick24(packed >> 8n), tick24(packed >> 32n), liquidity],
));
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
  // Public UI errors must not echo transport URLs, including credential-bearing paths.
  // Viem's shortMessage omits request bodies/headers and nested transport diagnostics.
  const diagnostic =
    typeof e?.shortMessage === "string"
      ? e.shortMessage
      : typeof e?.message === "string"
        ? e.message
        : String(error);
  return diagnostic.replace(
    /(?:https?|wss?):\/\/[^\s"'<>]+/gi,
    "[provider URL redacted]",
  );
}
function isMissingCanonicalNFT(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  const reverted = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  );
  // The pinned canonical PosM inherits Solmate ERC721: ownerOf reverts with
  // Error("NOT_MINTED") for burned/never-minted IDs. Do not infer absence from
  // a transport message, empty revert, timeout, or another contract error.
  return (
    reverted instanceof ContractFunctionRevertedError &&
    reverted.data?.errorName === "Error" &&
    reverted.data.args?.[0] === "NOT_MINTED"
  );
}
function formatPrice(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 7,
  }).format(n);
}

/** Direct public-RPC reads and wallet-signed transactions; no trusted amount service. */
export class ChainAdapter implements FeeStripAdapter {
  readonly mode: "local" | "testnet";
  readonly chain;
  readonly client;
  private wallet?: WalletClient;
  private provider?: EIP1193Provider;
  private account?: Address;
  private validated = false;
  private quotes = new Map<string, DiscoveredQuote>();
  private bids = new Map<string, DiscoveredQuote>();
  private strategies = new Map<string, DiscoveredQuote>();
  private knownSeries = new Map<string, Series>();
  private testActor?: "seller" | "buyer" | "holder";
  private discoveredPositions = new Map<string, { at: number; head: bigint; ids: string[]; incomplete: boolean }>();
  private importedPositions = new Set<string>();
  private progressListeners = new Set<(progress: TransactionProgress) => void>();
  private activeAction?: Action;
  subscribeProgress(listener: (progress: TransactionProgress) => void) {
    this.progressListeners.add(listener);
    return () => { this.progressListeners.delete(listener); };
  }
  subscribeWallet(listener: () => void) {
    const provider = this.provider as unknown as { on?: (event: string, fn: () => void) => void; removeListener?: (event: string, fn: () => void) => void };
    provider?.on?.("accountsChanged", listener); provider?.on?.("chainChanged", listener);
    return () => { provider?.removeListener?.("accountsChanged", listener); provider?.removeListener?.("chainChanged", listener); };
  }
  async readTransaction(hash: Hex): Promise<"pending" | "confirmed" | "failed"> {
    try { const receipt = await this.client.getTransactionReceipt({ hash }); return receipt.status === "success" ? "confirmed" : "failed"; }
    catch { return "pending"; }
  }
  async reconcileReplacement(original: TransactionProgress, replacementHash: string): Promise<TransactionProgress[]> {
    try { return await this.reconcileReplacementAction(original, replacementHash); }
    catch (error) { throw new Error(message(error)); }
  }
  private async reconcileReplacementAction(original: TransactionProgress, replacementHash: string): Promise<TransactionProgress[]> {
    const d = this.deployment;
    if (original.stage !== "pending" || original.chainId !== d.chainId || !same(original.feeStrip, d.feeStrip) || !original.hash || !/^0x[0-9a-fA-F]{64}$/.test(replacementHash) || same(original.hash, replacementHash)) throw new Error("Choose a different replacement transaction hash for this unresolved receipt.");
    await this.validate();
    await this.signer(original.account as Address);
    if (await this.client.getChainId() !== d.chainId) throw new Error("The receipt RPC is on a different chain.");
    let signed = original.signedTransaction;
    if (!signed) {
      try { signed = serializePublicTransaction(await this.client.getTransaction({ hash: original.hash })); }
      catch { throw new Error("The original signed transaction is unavailable. Its sender and nonce cannot be authenticated, so this receipt remains unresolved."); }
    }
    const identity = await transactionIdentity(signed, { hash: original.hash, account: original.account, chainId: d.chainId });
    const hash = replacementHash as Hex;
    const [replacement, receipt] = await Promise.all([this.client.getTransaction({ hash }), this.client.getTransactionReceipt({ hash })]);
    const replacementBytes = serializePublicTransaction(replacement);
    const next = await transactionIdentity(replacementBytes, { hash, account: original.account, chainId: d.chainId });
    if (next.nonce !== identity.nonce) throw new Error("This transaction uses a different nonce. It did not replace the original submission.");
    const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
    if (!same(receipt.transactionHash, hash) || !same(block.hash, receipt.blockHash)) throw new Error("The replacement receipt is not confirmed in the current canonical chain.");
    let replacementFinalizedBlockNumber: string | undefined, replacementFinalizedBlockHash: Hex | undefined;
    if (this.mode === "testnet") {
      const finalized = await this.client.getBlock({ blockTag: "finalized" });
      if (finalized.number === null || finalized.hash === null || finalized.number < receipt.blockNumber) throw new Error("The replacement is confirmed but not finalized. Wait for Ethereum finality, then check its receipt again. The original submission remains guarded against duplicate payment.");
      const stillCanonical = await this.client.getBlock({ blockNumber: receipt.blockNumber });
      if (!same(stillCanonical.hash, receipt.blockHash)) throw new Error("The replacement block changed while finality was checked. The original submission remains guarded.");
      replacementFinalizedBlockNumber = finalized.number.toString();
      replacementFinalizedBlockHash = finalized.hash!;
    }
    // EIP-7702 authorizations can change execution despite identical call fields.
    // Only ordinary EIP-1559 replacements can inherit the original action label.
    const sameAction = identity.type === "eip1559" && next.type === "eip1559" && identity.to === next.to && identity.value === next.value && identity.data === next.data;
    await this.signer(original.account as Address);
    return [
      { ...original, signedTransaction: signed, stage: "replaced", replacementHash: hash, replacementBlockNumber: receipt.blockNumber.toString(), replacementBlockHash: receipt.blockHash, replacementFinalizedBlockNumber, replacementFinalizedBlockHash },
      { chainId: d.chainId, feeStrip: d.feeStrip, account: original.account, hash, signedTransaction: replacementBytes, stage: receipt.status === "success" ? "confirmed" : "failed", receiptBlockNumber: receipt.blockNumber.toString(), receiptBlockHash: receipt.blockHash, label: sameAction ? original.label : "Replacement transaction (different action)", action: sameAction ? original.action : undefined },
    ];
  }
  private progress(progress: Omit<TransactionProgress, "chainId" | "feeStrip" | "action">) {
    for (const listener of this.progressListeners) listener({ ...progress, chainId: this.deployment.chainId, feeStrip: this.deployment.feeStrip, action: this.activeAction });
  }
  private recordReceipt(receipt: TransactionProgress) {
    saveReceipt(receipt);
    // Preserve the recorded action: activeAction is the NEW attempted submission.
    for (const listener of this.progressListeners) listener(receipt);
  }
  private async checkReceiptGuards(account: Address) {
    const d = this.deployment, saved = readReceipts();
    if (saved.filter(guardsSubmission).length >= MAX_RECEIPT_GUARDS) throw new Error("This browser has reached its receipt tracking limit. Resolve pending submissions before another wallet action; no unresolved receipt has been discarded.");
    const scoped = saved.filter((row) => (row.stage === "pending" || row.stage === "replaced") && row.chainId === d.chainId && same(row.feeStrip, d.feeStrip) && same(row.account, account));
    for (const row of scoped) {
      if (row.stage === "replaced") {
        try {
          if (!row.replacementHash) throw new Error("Replacement hash is unavailable.");
          // Reauthenticate current chain evidence on EVERY action, including after
          // reload. An old successful check cannot establish present canonicality.
          const verified = await this.reconcileReplacementAction({ ...row, stage: "pending" }, row.replacementHash);
          for (const next of verified) this.recordReceipt(next);
        } catch (error) {
          const replacement = saved.find((candidate) => candidate.hash === row.replacementHash && candidate.chainId === row.chainId);
          if (replacement) this.recordReceipt({ ...replacement, stage: "pending" });
          this.recordReceipt({ ...row, stage: "pending" });
          throw new Error("The saved replacement can no longer clear the original submission. No new transaction was requested. Check the replacement receipt again. " + message(error));
        }
      } else if (await this.readTransaction(row.hash!) === "pending") throw new Error("A broadcast transaction for this wallet is still unresolved. Check its saved receipt or cancel it in your wallet, then refresh. Do not repeat the payment.");
    }
  }

  async findPosition(input: string): Promise<string> {
    try {
      const id = positionId(input);
      await this.validate();
      const block = await this.client.getBlock();
      const d = this.deployment;
      let owner: Address;
      try {
        owner = await this.read<Address>(d.positionManager, NFT_ABI, "ownerOf", [BigInt(id)], block.number);
      } catch (error) {
        if (isMissingCanonicalNFT(error)) throw new Error("This NFT does not exist on the configured PositionManager.");
        throw error;
      }

      const [[key, info], liquidity] = await Promise.all([
        this.read<readonly [PoolKey, bigint]>(d.positionManager, positionManagerAbi, "getPoolAndPositionInfo", [BigInt(id)], block.number),
        this.read<bigint>(d.positionManager, positionManagerAbi, "getPositionLiquidity", [BigInt(id)], block.number),
      ]);
      const reason = positionIneligibility(key, info, liquidity, d.usdc);
      if (reason) throw new Error(reason);
      if (this.importedPositions.size >= POSITION_LIMIT && !this.importedPositions.has(id)) throw new Error("The session position limit is reached.");
      this.importedPositions.add(id);
      return id;
    } catch (error) { throw new Error(message(error)); }
  }

  private async walletPositionIds(wallet: WalletState, head: bigint) {
    if (!wallet.connected || !wallet.address || wallet.chainId !== this.deployment.chainId)
      return { ids: [] as string[], incomplete: false };
    const accountKey = wallet.address.toLowerCase();
    const ownerAddress = getAddress(wallet.address);
    let result = this.discoveredPositions.get(accountKey);
    if (!result || Date.now() - result.at > 30_000 || head < result.head) {
      const found = await recentPositionIds(head, async (fromBlock, toBlock) => {
        const logs = await this.client.getLogs({
          address: this.deployment.positionManager,
          event: parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"])[0],
          args: { to: ownerAddress }, fromBlock, toBlock, strict: true,
        });
        return logs.map((log) => log.args.tokenId);
      });
      result = { ...found, at: Date.now(), head };
      this.discoveredPositions.set(accountKey, result);
      // Bound cached account metadata across repeated wallet switching.
      if (this.discoveredPositions.size > 10) this.discoveredPositions.delete(this.discoveredPositions.keys().next().value!);
    }
    return { ids: [...new Set([...result.ids, ...this.importedPositions])], incomplete: result.incomplete };
  }
  constructor(
    readonly deployment: Deployment,
    options: {
      provider?: EIP1193Provider;
      enableTestWallet?: boolean;
      testActor?: string;
    } = {},
  ) {
    this.mode = deployment.mode;
    this.provider = options.provider;
    this.chain = defineChain({
      id: deployment.chainId,
      name:
        deployment.mode === "local"
          ? "Local development chain"
          : "Ethereum Sepolia",
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
    try {
      await this.validateDeployment();
    } catch (error) {
      throw new Error(message(error));
    }
  }
  private async validateDeployment() {
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
    try {
      return await this.connectWallet();
    } catch (error) {
      throw new Error(message(error));
    }
  }
  private async connectWallet(): Promise<WalletState> {
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
    try {
      await this.wallet.switchChain({ id: this.deployment.chainId });
    } catch (error) {
      throw new Error(message(error));
    }
  }
  private async walletState(blockNumber: bigint): Promise<WalletState> {
    if (!this.account && this.wallet && !this.testActor) this.account = (await this.wallet.getAddresses())[0];
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
    const currentAccount = this.account;
    const [chainId, cash, balances, ethBalance] = await Promise.all([
      this.wallet!.getChainId(),
      this.read<bigint>(
        this.deployment.usdc,
        erc20Abi,
        "balanceOf",
        [currentAccount],
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
                  [currentAccount],
                  blockNumber,
                )
              ).toString(),
            ] as const,
        ),
      ),
      this.client.getBalance({ address: currentAccount, blockNumber }),
    ]);
    if (this.account !== currentAccount) throw new Error("Wallet changed while loading. Refresh the current account.");
    return {
      connected: true,
      address: currentAccount,
      chainId,
      usdcBalanceMicros: cash.toString(),
      ethBalanceWei: ethBalance.toString(),
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
    try {
      return await this.loadSnapshot();
    } catch (error) {
      throw new Error(message(error));
    }
  }
  private async loadSnapshot(): Promise<Snapshot> {
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
                advertisedClaims: q.claimUnits.toString(),
                executableClaims: q.available.toString(),
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
          bid: this.bids.has(id) ? this.asQuote(this.bids.get(id)!) : undefined,
          baselineX128: s.baselineX128.toString(),
          residualOwner: s.residualOwner,
          residualUsdcMicros: s.residualUSDC.toString(),
          otherReserve: s.otherReserve.toString(),
        };
      }),
    );
    const wallet = await this.walletState(bn);
    const discovered = await this.walletPositionIds(wallet, bn);
    const knownNftIds = new Set([
      ...d.nftIds,
      ...offers.map((o) => o.tokenId.toString()),
      ...series.map(([, s]) => s.tokenId.toString()),
    ]);
    let discoveryDetailsFailed = false;
    const nftIds = [
      ...new Set([
        ...d.nftIds,
        ...discovered.ids,
        ...this.importedPositions,
        ...offers.map((o) => o.tokenId.toString()),
        ...series.map(([, s]) => s.tokenId.toString()),
      ]),
    ];
    const positions = await Promise.all(
      nftIds.map(async (tokenId): Promise<Position | undefined> => {
        try {
        let owner: Address;
        try {
          owner = await this.read<Address>(
            d.positionManager,
            NFT_ABI,
            "ownerOf",
            [BigInt(tokenId)],
            bn,
          );
        } catch (error) {
          if (isMissingCanonicalNFT(error)) return undefined;
          throw error;
        }
        const [info, liquidity] = await Promise.all([
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
        if (positionIneligibility(key, packed, liquidity, d.usdc))
          return undefined;
        const market = markets.find((m) => m.tokenId === tokenId),
          s = market && this.knownSeries.get(market.id);
        // Show known unsold NFTs as offer targets; custody actions still require the actual owner.
        const own = wallet.connected && same(owner, wallet.address!);
        const residual =
          wallet.connected && s && same(s.residualOwner, wallet.address!);
        if (market && !own && !residual) return undefined;
        if (!market && !own && !this.importedPositions.has(tokenId) && !d.nftIds.includes(tokenId) && !offers.some((o) => o.tokenId === BigInt(tokenId)))
          return undefined;
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
        const availableOffers = offers
          .filter(
            (o) =>
              o.tokenId === BigInt(tokenId) &&
              same(o.seller, owner) &&
              o.positionCommitment === positionCommitment(key, packed, liquidity) &&
              !o.consumed &&
              o.deadline >= block.timestamp &&
              o.endBlock > bn,
          )
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        const funded = availableOffers[0];
        return {
          tokenId,
          commitment: positionCommitment(key, packed, liquidity),
          unavailableOffersCount: offers.filter((o) => o.tokenId === BigInt(tokenId) && !o.consumed).length - availableOffers.length,
          pair: display.pair,
          feeTier: display.feeTier,
          lowerPrice: display.lowerPrice,
          upperPrice: display.upperPrice,
          liquidity: liquidity.toString(),
          approved: same(approved, d.feeStrip) || approvedAll,
          seriesId: market?.id,
          owner,
          ownedByWallet: own,
          offers: availableOffers.map((o) => ({ id: o.id.toString(), fundedMicros: o.proceeds.toString(), claims: o.buyerQuantity.toString(), originalSupply: o.quantity.toString(), endBlock: o.endBlock.toString(), deadlineTimestamp: o.deadline.toString(), maker: o.buyer })),
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
        } catch (error) {
          // Unsolicited NFTs may contain broken token metadata. They must not
          // hide known financial positions, claims or recovery controls.
          if (knownNftIds.has(tokenId)) throw error;
          discoveryDetailsFailed = true;
          return undefined;
        }
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
      feeStrip: d.feeStrip,
      markets,
      positions: positions.filter((p): p is Position => !!p),
      saleReadiness: this.mode === "testnet" ? await readOperations(d) : undefined,
      positionDiscoveryNotice: discovered.incomplete || discoveryDetailsFailed
        ? "The recent-position search could not finish. Find a missing position by its NFT ID or Uniswap link."
        : "Recent wallet transfers are searched automatically (last 50,000 blocks). For older positions, use the NFT ID or Uniswap link.",
      fundedOffers: offers
        .filter(
          (o) => !o.consumed && wallet.address && same(o.buyer, wallet.address),
        )
        .map((o) => ({
          id: o.id.toString(),
          tokenId: o.tokenId.toString(),
          seller: o.seller,
          buyer: o.buyer,
          fundedMicros: o.proceeds.toString(),
          claims: o.buyerQuantity.toString(),
          originalSupply: o.quantity.toString(),
          endBlock: o.endBlock.toString(),
          deadlineTimestamp: o.deadline.toString(),
          expired: o.endBlock <= bn || o.deadline < block.timestamp,
        })),
      strategies: Array.from(this.strategies.values(), (x) => x.record),
      wallet,
      quote: markets[0]?.quote ?? { ...NO_QUOTE },
      scenario: "normal",
    };
  }
  private asQuote(q: DiscoveredQuote): Quote {
    return {
      maker: q.order.maker,
      expiresAt: q.deadline.toString(),
      available: q.available > 0n,
      ratioClaimUnits: q.claimUnits.toString(),
      ratioUsdcUnits: q.usdcUnits.toString(),
      strategyHash: q.strategyHash,
      advertisedClaims: q.claimUnits.toString(),
      executableClaims: q.available.toString(),
    };
  }
  private async discoverQuotes(
    timestamp: bigint,
    blockNumber: bigint,
  ): Promise<Map<string, DiscoveredQuote>> {
    const d = this.deployment,
      asks = new Map<string, DiscoveredQuote>();
    this.bids = new Map();
    this.strategies = new Map();
    const logs = await this.client.getLogs({
      address: d.aqua,
      event: parseAbi([
        "event Shipped(address maker,address app,bytes32 strategyHash,bytes strategy)",
      ])[0],
      fromBlock: BigInt(d.deploymentBlock ?? "0"),
      toBlock: blockNumber,
      strict: true,
    });
    for (const log of logs) {
      if (!same(log.args.app, d.swapRouter)) continue;
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
        const [id] = decodeAbiParameters(
          parseAbiParameters("uint256"),
          sliceHex(order.data, 60, 92),
        );
        const s = this.knownSeries.get(id.toString());
        if (!s) continue;
        const decoded = decodeFrozenOrder(order, d.market, d.usdc, s.claim);
        const {
          claimUnits,
          usdcUnits,
          deadline,
          salt,
          claimsIn,
          expectedState,
        } = decoded;
        const rebuilt = await this.read<Order>(
          d.market,
          feeStripMarketAbi,
          "buildOrder",
          [
            id,
            order.maker,
            claimsIn,
            claimUnits,
            usdcUnits,
            timestamp + 1n,
            salt,
          ],
          blockNumber,
        );
        if (
          encodeAbiParameters(ORDER_PARAMETERS, [
            restoreFrozenOrder(rebuilt, id, expectedState, deadline),
          ]) !== log.args.strategy
        )
          continue;
        const output = claimsIn ? d.usdc : s.claim;
        const [cashRaw, claimRaw, balance, allowance, currentState] =
          await Promise.all([
            this.read<readonly [bigint, number]>(
              d.aqua,
              aquaAbi,
              "rawBalances",
              [order.maker, d.swapRouter, log.args.strategyHash, d.usdc],
              blockNumber,
            ),
            this.read<readonly [bigint, number]>(
              d.aqua,
              aquaAbi,
              "rawBalances",
              [order.maker, d.swapRouter, log.args.strategyHash, s.claim],
              blockNumber,
            ),
            this.read<bigint>(
              output,
              erc20Abi,
              "balanceOf",
              [order.maker],
              blockNumber,
            ),
            this.read<bigint>(
              output,
              erc20Abi,
              "allowance",
              [order.maker, d.aqua],
              blockNumber,
            ),
            this.read<Hex>(
              d.feeStrip,
              feeStripAbi,
              "marketState",
              [id],
              blockNumber,
            ),
          ]);
        const cancelled = cashRaw[1] === 255 && claimRaw[1] === 255;
        const active = cashRaw[1] === 2 && claimRaw[1] === 2;
        let virtual = claimsIn ? cashRaw[0] : claimRaw[0];
        if (active) {
          const safe = await this.read<readonly [bigint, bigint]>(
            d.aqua,
            aquaAbi,
            "safeBalances",
            [order.maker, d.swapRouter, log.args.strategyHash, d.usdc, s.claim],
            blockNumber,
          );
          virtual = claimsIn ? safe[0] : safe[1];
        }
        const { available, limitations } = strategyCapacity({
          claimsIn,
          claimUnits,
          usdcUnits,
          virtual,
          balance,
          allowance,
          cancelled,
          active,
          expired: deadline <= timestamp,
          stale: currentState !== expectedState || s.closed,
        });
        const record: MakerStrategy = {
          strategyHash: log.args.strategyHash,
          app: d.swapRouter,
          maker: order.maker,
          seriesId: id.toString(),
          claimsIn,
          claimToken: s.claim,
          cashToken: d.usdc,
          advertisedClaims: claimUnits.toString(),
          advertisedUSDC: usdcUnits.toString(),
          executableClaims: available.toString(),
          virtualOutput: virtual.toString(),
          walletOutput: balance.toString(),
          allowanceOutput: allowance.toString(),
          expiresAt: deadline.toString(),
          limitations,
          cancellable: active,
        };
        const candidate: DiscoveredQuote = {
          order,
          strategyHash: log.args.strategyHash,
          seriesId: id.toString(),
          claimUnits,
          usdcUnits,
          deadline,
          available,
          cash: d.usdc,
          claim: s.claim,
          claimsIn,
          record,
        };
        this.strategies.set(log.args.strategyHash, candidate);
        if (available === 0n) continue;
        const found = claimsIn ? this.bids : asks,
          previous = found.get(id.toString());
        if (
          !previous ||
          (claimsIn
            ? usdcUnits * previous.claimUnits > previous.usdcUnits * claimUnits
            : usdcUnits * previous.claimUnits < previous.usdcUnits * claimUnits)
        )
          found.set(id.toString(), candidate);
      } catch {
        // Unknown/malformed strategies are never promoted to trusted executable orders.
        // Known canonical states above remain visible even after expiry, docking or revocation.
        continue;
      }
    }
    return asks;
  }
  private async signer(expectedAccount?: Address) {
    if (!this.wallet || !this.account)
      throw new Error("Connect a wallet before continuing.");
    if ((await this.wallet.getChainId()) !== this.deployment.chainId)
      throw new Error(
        "Wrong wallet network. Switch to the configured application chain.",
      );
    const account = expectedAccount ?? this.account;
    if (!same(this.account, account))
      throw new Error(
        "Wallet account changed. Reconnect and review the transaction again.",
      );
    if (!this.testActor) {
      const accounts = await this.wallet.getAddresses();
      if (!accounts[0] || !same(accounts[0], account))
        throw new Error(
          "Wallet account changed. Reconnect and review the transaction again.",
        );
    }
    return { wallet: this.wallet, account };
  }
  private async write(
    expectedAccount: Address,
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ): Promise<Hex> {
    const { wallet, account } = await this.signer(expectedAccount);
    const data = encodeFunctionData({ abi, functionName, args });
    const label = functionName === "approve" ? (same(address, this.deployment.positionManager) ? "NFT transfer approval" : "Token allowance") : functionName === "fundOffer" ? "Fund offer" : functionName === "acceptOffer" ? "Accept funded sale" : functionName.replace(/[A-Z]/g, (letter) => " " + letter.toLowerCase()).replace(/^./, (letter) => letter.toUpperCase());
    this.progress({ stage: "estimating", label, account });
    await this.client.call({ account, to: address, data });
    const [gas, fees, balance] = await Promise.all([
      this.client.estimateGas({ account, to: address, data }),
      this.client.estimateFeesPerGas(), this.client.getBalance({ address: account }),
    ]);
    const gasLimit = gas * 120n / 100n;
    const maximumFeeWei = gasLimit * (fees.maxFeePerGas ?? 0n);
    if (balance < maximumFeeWei) throw new Error("Insufficient ETH for the estimated gas limit. Add Sepolia ETH and review again; any earlier token allowance remains in place.");
    await this.signer(expectedAccount);
    await this.checkReceiptGuards(account);
    await this.signer(account);
    this.progress({ stage: "signature", label, account, gasEstimate: gasLimit.toString(), maximumFeeWei: maximumFeeWei.toString() });
    const hash = await wallet.sendTransaction({ account, chain: this.chain, to: address, data, gas: gasLimit, ...fees });
    this.progress({ stage: "pending", label, account, hash, gasEstimate: gasLimit.toString(), maximumFeeWei: maximumFeeWei.toString() });
    // This public signature binds the saved nonce even if the original later disappears from the mempool.
    try {
      const signedTransaction = serializePublicTransaction(await this.client.getTransaction({ hash }));
      const identity = await transactionIdentity(signedTransaction, { hash, account, chainId: this.deployment.chainId });
      if (identity.to !== address.toLowerCase() || identity.data !== data.toLowerCase() || identity.value !== 0n) throw new Error("Unexpected signed transaction payload");
      this.progress({ stage: "pending", label, account, hash, signedTransaction });
    } catch { /* Receipt waiting still proceeds; missing signed bytes are disclosed if manual reconciliation is needed. */ }
    let replacementReason: string | undefined;
    const receipt = await this.client.waitForTransactionReceipt({
      hash, confirmations: 1,
      onReplaced: ({ reason, replacedTransaction, transactionReceipt }) => {
        replacementReason = reason;
        this.progress({ stage: "replaced", label, account, hash: replacedTransaction.hash, replacementHash: transactionReceipt.transactionHash, replacementBlockNumber: transactionReceipt.blockNumber.toString(), replacementBlockHash: transactionReceipt.blockHash });
      },
    });
    if (replacementReason === "cancelled" || replacementReason === "replaced") {
      throw new Error("Wallet transaction was cancelled or replaced by a different action. Refresh the confirmed chain state before trying again.");
    }
    let offerId: string | undefined;
    if (functionName === "fundOffer" && receipt.status === "success") for (const log of receipt.logs) {
      if (!same(log.address, this.deployment.feeStrip)) continue;
      try { const event = decodeEventLog({ abi: feeStripAbi, data: log.data, topics: log.topics }); if (event.eventName === "OfferFunded") offerId = String((event.args as { offerId?: bigint; id?: bigint }).offerId ?? (event.args as { id?: bigint }).id); } catch {}
    }
    this.progress({ stage: receipt.status === "success" ? "confirmed" : "failed", label, account, hash: receipt.transactionHash, offerId, receiptBlockNumber: receipt.blockNumber.toString(), receiptBlockHash: receipt.blockHash });
    if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}. Confirmed earlier approvals, if any, remain in place.`);
    return receipt.transactionHash;
  }
  private async approve(
    account: Address,
    token: Address,
    spender: Address,
    amount: bigint,
    hashes: Hex[],
  ) {
    await this.signer(account);
    const allowance = await this.read<bigint>(token, erc20Abi, "allowance", [
      account,
      spender,
    ]);
    if (allowance < amount)
      hashes.push(
        await this.write(account, token, erc20Abi, "approve", [
          spender,
          amount,
        ]),
      );
  }
  private async recoveryScope(seriesId: string) {
    if (!/^[1-9][0-9]*$/.test(seriesId))
      throw new Error("Invalid recovery series.");
    await this.validate();
    const s = await this.read<Series>(
      this.deployment.feeStrip,
      feeStripAbi,
      "series",
      [BigInt(seriesId)],
    );
    if (s.endBlock === 0n)
      throw new Error("Series is unavailable on this deployment.");
    return {
      chainId: this.deployment.chainId,
      feeStrip: this.deployment.feeStrip,
      verifier: this.deployment.verifier,
      manager: this.deployment.poolManager,
      seriesId,
      endBlock: s.endBlock.toString(),
    };
  }
  async readRecovery(seriesId: string): Promise<RecoveryResult> {
    let scope, response;
    try {
      scope = await this.recoveryScope(seriesId);
      response = await fetch(
        "/api/recovery?" + new URLSearchParams({ seriesId }),
        { cache: "no-store", signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok)
        return {
          status: "unavailable",
          failure: [404, 500, 502, 503, 504].includes(response.status)
            ? "service"
            : "scope",
          reason:
            response.status === 404
              ? "This series is not registered with the recovery service."
              : "The recovery service could not provide an observation.",
        };
    } catch {
      return {
        status: "unavailable",
        failure: "service",
        reason:
          "Recovery observation unavailable. The service or chain could not be reached.",
      };
    }
    try {
      return validateRecovery(await response.json(), scope);
    } catch (error) {
      return {
        status: "unavailable",
        failure: "scope",
        reason: (error as Error).message,
      };
    }
  }
  private async retainedArtifact(
    seriesId: string,
    observation: RecoveryObservation,
  ): Promise<RecoveryDownload> {
    if (
      !observation.artifactDigest ||
      !["retained", "unavailable"].includes(observation.state)
    )
      throw new Error(
        "No current retained artifact is available for this series.",
      );
    const response = await fetch(
      "/api/recovery/artifact?" +
        new URLSearchParams({ seriesId, digest: observation.artifactDigest }),
      { cache: "no-store", signal: AbortSignal.timeout(35000) },
    );
    if (!response.ok)
      throw new Error(
        "The retained artifact is unavailable or changed. Refresh recovery status before trying again.",
      );
    const json = await response.text();
    await verifyArtifactDigest(json, observation.artifactDigest);
    const file = JSON.parse(json);
    const scope = await this.recoveryScope(seriesId);
    // API artifacts must identify the original chain, manager and endpoint;
    // the compatibility allowance for metadata-free static files is not used here.
    if (
      !file ||
      file.chainId === undefined ||
      file.manager === undefined ||
      file.blockNumber === undefined ||
      !/^0x[0-9a-fA-F]{64}$/.test(file.blockHash ?? "") ||
      !file.witness ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(file.witness) ||
      (observation.endpointHash &&
        file.blockHash?.toLowerCase() !==
          observation.endpointHash.toLowerCase())
    )
      throw new Error(
        "Recovery artifact metadata is missing or does not match its observed endpoint.",
      );
    validateRecovery(observation, scope);
    assertWitnessScope(file, {
      chainId: scope.chainId,
      seriesId: BigInt(seriesId),
      endBlock: BigInt(scope.endBlock),
      manager: this.deployment.poolManager,
    });
    return {
      json,
      filename: `feestrip-witness-${scope.chainId}-${seriesId}-${observation.artifactDigest}.json`,
    };
  }
  async downloadRecoveryArtifact(seriesId: string): Promise<RecoveryDownload> {
    try {
      return await this.downloadRetainedArtifact(seriesId);
    } catch (error) {
      throw new Error(message(error));
    }
  }
  private async downloadRetainedArtifact(
    seriesId: string,
  ): Promise<RecoveryDownload> {
    const status = await this.readRecovery(seriesId);
    if (status.status === "unavailable") throw new Error(status.reason);
    return this.retainedArtifact(seriesId, status.observation);
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
    if (this.activeAction) throw new Error("Another wallet action is still pending.");
    this.activeAction = action;
    try {
      return await this.executeAction(action);
    } catch (error) {
      throw new Error(message(error));
    } finally { this.activeAction = undefined; }
  }
  private async executeAction(action: Action): Promise<ActionResult> {
    await this.validate();
    const { account } = await this.signer(
        action.reviewedAccount as Address | undefined,
      ),
      d = this.deployment,
      hashes: Hex[] = [];
    try {
      await this.checkReceiptGuards(account);
      if (this.mode === "testnet" && (action.type === "fundOffer" || action.type === "acceptOffer")) { const readiness = await readOperations(d); if (!readiness.ready) throw new Error(readiness.reason); }
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
          await this.write(account, d.positionManager, NFT_ABI, "approve", [
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
        if (same(seller, account)) throw new Error("This wallet owns the NFT. Share its position link with a separate buyer; funding your own position does not create external proceeds.");
        if (!action.positionCommitment || !/^0x[0-9a-fA-F]{64}$/.test(action.positionCommitment)) throw new Error("Review the canonical position details before funding; its exact commitment is required.");
        if (action.seller && !same(seller, action.seller)) throw new Error("NFT ownership changed since review. Review its current seller before funding.");
        const checkReviewedPosition = async () => {
          if (!action.positionCommitment) return;
          const [[key, packed], liquidity] = await Promise.all([
            this.read<readonly [PoolKey, bigint]>(d.positionManager, positionManagerAbi, "getPoolAndPositionInfo", [BigInt(action.tokenId)]),
            this.read<bigint>(d.positionManager, positionManagerAbi, "getPositionLiquidity", [BigInt(action.tokenId)]),
          ]);
          if (positionCommitment(key, packed, liquidity) !== action.positionCommitment) throw new Error("The position range, pool or liquidity changed since review. Review its current details before funding.");
        };
        await checkReviewedPosition();
        const block = await this.client.getBlock();
        const checkRemainingTime = (head: bigint, time: bigint) => {
          if (BigInt(action.endBlock) <= head + 32n || BigInt(action.deadlineTimestamp) <= time + 60n) throw new Error("Not enough time remains for this offer: allow more than 32 blocks and one minute before acceptance expires. Review fresh terms; any confirmed allowance remains.");
        };
        checkRemainingTime(block.number, block.timestamp);
        const cash = await this.read<bigint>(d.usdc, erc20Abi, "balanceOf", [account]);
        if (cash < proceeds) throw new Error("Insufficient USDC for this funded offer.");
        await this.approve(account, d.usdc, d.feeStrip, proceeds, hashes);
        await checkReviewedPosition();
        const afterApproval = await this.client.getBlock();
        checkRemainingTime(afterApproval.number, afterApproval.timestamp);
        if (this.mode === "testnet") { const readiness = await readOperations(d); if (!readiness.ready) throw new Error(readiness.reason + " Any confirmed USDC allowance remains in place."); }
        if (!same(seller, await this.read<Address>(d.positionManager, NFT_ABI, "ownerOf", [BigInt(action.tokenId)]))) throw new Error("NFT ownership changed after approval. Review the current seller; the USDC allowance remains in place.");
        hashes.push(
          await this.write(account, d.feeStrip, feeStripAbi, "fundOffer", [
            seller,
            BigInt(action.tokenId),
            10000n * CLAIM_UNIT,
            buyerQuantity,
            proceeds,
            BigInt(action.endBlock),
            BigInt(action.deadlineTimestamp),
            action.positionCommitment,
          ]),
        );
      } else if (action.type === "cancelOffer") {
        const offer = await this.read<
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
        >(d.feeStrip, feeStripAbi, "offers", [BigInt(action.offerId)]);
        if (!same(offer[0], account))
          throw new Error(
            "Only the buyer who funded this offer can cancel it.",
          );
        if (offer[9])
          throw new Error(
            "This offer was already accepted or cancelled. Refresh its state.",
          );
        hashes.push(
          await this.write(account, d.feeStrip, feeStripAbi, "cancelOffer", [
            BigInt(action.offerId),
          ]),
        );
      } else if (action.type === "acceptOffer") {
        const offer = await this.read<readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, Hex, boolean]>(d.feeStrip, feeStripAbi, "offers", [BigInt(action.offerId)]);
        if (!same(offer[1], account) || offer[2] !== BigInt(action.tokenId) || offer[5] !== BigInt(action.minimumProceedsMicros) || offer[9]) throw new Error("The funded offer is unavailable or differs from the reviewed seller, NFT or payment.");
        const terms = action.expectedTerms;
        if (terms && (!same(offer[0], terms.buyer) || offer[3] !== BigInt(terms.originalSupply) || offer[4] !== BigInt(terms.claims) || offer[6] !== BigInt(terms.endBlock) || offer[7] !== BigInt(terms.deadlineTimestamp))) throw new Error("Funded terms differ from the exact offer you reviewed.");
        hashes.push(
          await this.write(account, d.feeStrip, feeStripAbi, "acceptOffer", [
            BigInt(action.offerId),
            BigInt(action.minimumProceedsMicros),
          ]),
        );
      } else if (action.type === "dockQuote") {
        await this.load();
        await this.signer(account);
        const q = this.strategies.get(action.strategyHash);
        if (!q || !same(q.order.maker, account))
          throw new Error(
            "Only the maker can cancel this identified strategy.",
          );
        if (
          !same(action.app, d.swapRouter) ||
          !same(action.claimToken, q.claim) ||
          !same(action.cashToken, q.cash)
        )
          throw new Error("The reviewed strategy app or token pair changed.");
        if (!q.record.cancellable)
          throw new Error(
            "This strategy is already cancelled or its token inventory is unsupported. Refresh its state.",
          );
        hashes.push(
          await this.write(account, d.aqua, aquaAbi, "dock", [
            d.swapRouter,
            q.strategyHash,
            [q.cash, q.claim],
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
        const claimsIn = !!action.claimsIn,
          outputToken = claimsIn ? d.usdc : s.claim,
          inventory = claimsIn ? cash : quantity;
        if (
          (await this.read<bigint>(outputToken, erc20Abi, "balanceOf", [
            account,
          ])) < inventory
        )
          throw new Error(
            "The quote exceeds your actual maker inventory balance.",
          );
        const entropy = new Uint8Array(32);
        globalThis.crypto.getRandomValues(entropy);
        const salt = toHex(entropy);
        const order = await this.read<Order>(
          d.market,
          feeStripMarketAbi,
          "buildOrder",
          [id, account, claimsIn, quantity, cash, deadline, salt],
        );
        await this.approve(account, outputToken, d.aqua, inventory, hashes);
        hashes.push(
          await this.write(account, d.aqua, aquaAbi, "ship", [
            d.swapRouter,
            encodeAbiParameters(ORDER_PARAMETERS, [order]),
            [d.usdc, s.claim],
            claimsIn ? [cash, 0n] : [0n, quantity],
          ]),
        );
      } else if (action.type === "sellClaims") {
        const latest = await this.load(),
          q = this.bids.get(action.seriesId);
        await this.signer(account);
        if (!q || q.strategyHash !== action.strategyHash)
          throw new Error(
            "The displayed bid changed or is no longer executable. Refresh and review.",
          );
        const quantity = BigInt(action.quantity),
          proceeds = (quantity * q.usdcUnits) / q.claimUnits,
          deadline = minimum(q.deadline, BigInt(action.expiresAt));
        if (
          quantity <= 0n ||
          quantity > q.available ||
          proceeds <= 0n ||
          proceeds < BigInt(action.minimumUSDC) ||
          deadline <= BigInt(latest.timestamp)
        )
          throw new Error(
            "Bid size, minimum USDC or deadline is no longer valid.",
          );
        if (quantity > BigInt(latest.wallet.claims[action.seriesId] ?? "0"))
          throw new Error("Insufficient claims in this wallet.");
        const taker = await this.read<Hex>(
          d.market,
          feeStripMarketAbi,
          "takerData",
          [account, q.claim, d.usdc, BigInt(action.minimumUSDC), deadline],
        );
        const preview = await this.read<readonly [bigint, bigint, Hex]>(
          d.swapRouter,
          feeStripRouterAbi,
          "quote",
          [q.order, quantity, taker],
        );
        if (
          preview[0] !== quantity ||
          preview[1] < BigInt(action.minimumUSDC) ||
          preview[2] !== q.strategyHash
        )
          throw new Error(
            "Swap preview no longer meets the reviewed claim input and minimum USDC.",
          );
        await this.approve(account, q.claim, d.swapRouter, quantity, hashes);
        hashes.push(
          await this.write(account, d.swapRouter, feeStripRouterAbi, "swap", [
            q.order,
            quantity,
            taker,
          ]),
        );
      } else if (action.type === "buyClaims") {
        const latest = await this.load(),
          q = this.quotes.get(action.seriesId);
        await this.signer(account);
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
        await this.approve(account, d.usdc, d.swapRouter, cost, hashes);
        hashes.push(
          await this.write(account, d.swapRouter, feeStripRouterAbi, "swap", [
            q.order,
            cost,
            taker,
          ]),
        );
      } else {
        const id = BigInt(action.seriesId);
        if (action.type === "capture")
          hashes.push(
            await this.write(account, d.feeStrip, feeStripAbi, "capture", [id]),
          );
        else if (action.type === "withdrawNFT")
          hashes.push(
            await this.write(account, d.feeStrip, feeStripAbi, "withdrawNFT", [
              id,
              account,
            ]),
          );
        else if (action.type === "withdrawResidual")
          hashes.push(
            await this.write(
              account,
              d.feeStrip,
              feeStripAbi,
              "withdrawResidual",
              [id, account],
            ),
          );
        else if (action.type === "closeEarly")
          hashes.push(
            await this.write(account, d.feeStrip, feeStripAbi, "recombine", [
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
            await this.write(account, d.feeStrip, feeStripAbi, "redeem", [
              id,
              amount,
              account,
            ]),
          );
        } else if (action.type === "settle") {
          const s = await this.read<Series>(d.feeStrip, feeStripAbi, "series", [
            id,
          ]);
          if (!same(s.key.currency0, d.usdc) && !same(s.key.currency1, d.usdc))
            throw new Error(
              "Series does not use the configured native USDC leg.",
            );
          const cacheKey = keccak256(
            encodeAbiParameters(
              parseAbiParameters("uint256,bytes32,int24,int24,bool"),
              [
                s.endBlock,
                pairId(s.key),
                s.tickLower,
                s.tickUpper,
                same(s.key.currency0, d.usdc),
              ],
            ),
          );
          const cached = await this.read<readonly [boolean, bigint]>(
            d.verifier,
            parseAbi([
              "function endpointGrowth(bytes32) view returns (bool verified,uint256 value)",
            ]),
            "endpointGrowth",
            [cacheKey],
          );
          let witness: Hex;
          if (cached[0] === true) witness = "0x";
          else {
            const recovery = await this.readRecovery(id.toString());
            let file: {
              witness?: Hex;
              seriesId?: string;
              endBlock?: string;
              chainId?: number | string;
              blockNumber?: string;
              manager?: Address;
            };
            if (
              recovery.status !== "unavailable" &&
              recovery.observation.state === "orphaned"
            )
              throw new Error(
                "Recovery service reports an orphaned endpoint. No static fallback or allocation was submitted.",
              );
            if (
              recovery.status === "unavailable" &&
              recovery.failure === "scope"
            )
              throw new Error(recovery.reason);
            if (
              recovery.status !== "unavailable" &&
              recovery.observation.artifactDigest &&
              ["retained", "unavailable"].includes(recovery.observation.state)
            ) {
              file = JSON.parse(
                (
                  await this.retainedArtifact(
                    id.toString(),
                    recovery.observation,
                  )
                ).json,
              );
            } else {
              const response = await fetch(`/witness-${id}.json`, {
                cache: "no-store",
                signal: AbortSignal.timeout(10000),
              });
              if (!response.ok)
                throw new Error(
                  "Historical witness unavailable. The captured NFT can return while allocation remains pending; the USDC reserve stays preserved.",
                );
              file = await response.json();
            }
            if (!file.witness || !/^0x(?:[0-9a-fA-F]{2})+$/.test(file.witness))
              throw new Error(
                "Retained witness file is invalid. No allocation was submitted.",
              );
            assertWitnessScope(file, {
              chainId: d.chainId,
              seriesId: id,
              endBlock: s.endBlock,
              manager: d.poolManager,
            });
            witness = file.witness;
          }
          hashes.push(
            await this.write(account, d.feeStrip, feeStripAbi, "settle", [
              id,
              witness,
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
