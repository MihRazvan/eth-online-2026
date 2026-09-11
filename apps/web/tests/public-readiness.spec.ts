import { test, expect } from "@playwright/test";
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseAbi,
  zeroAddress,
} from "viem";
import { ChainAdapter, type Deployment } from "../src/chainAdapter";
const owner = "0x1111111111111111111111111111111111111111",
  claim = "0x2222222222222222222222222222222222222222";
const d = {
  mode: "testnet",
  chainId: 11155111,
  rpcUrl: "https://example.invalid/provider-path-sentinel?key=query-sentinel",
  feeStrip: owner,
  usdc: owner,
  other: zeroAddress,
  positionManager: owner,
  poolManager: owner,
  verifier: owner,
  checkpoints: owner,
  market: owner,
  swapRouter: owner,
  aqua: owner,
  nftIds: ["1", "2"],
} as Deployment;
const nftABI = parseAbi(["function ownerOf(uint256) view returns(address)"]);
function revert(reason: string) {
  return new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: nftABI,
      functionName: "ownerOf",
      data: encodeErrorResult({
        abi: parseAbi(["error Error(string)"]),
        errorName: "Error",
        args: [reason],
      }),
    }),
    {
      abi: nftABI,
      args: [1n],
      functionName: "ownerOf",
      contractAddress: d.positionManager,
    },
  );
}
function setup(error: unknown) {
  const adapter = new ChainAdapter(d) as any;
  // Inject read responses, retaining actual load/market enumeration/wallet/position logic.
  adapter.validate = async () => {};
  adapter.account = owner;
  adapter.wallet = {
    getAddresses: async () => [owner],
    getChainId: async () => 11155111,
  };
  adapter.client.getBlock = async () => ({
    number: 130n,
    timestamp: 1800000000n,
  });
  adapter.client.getLogs = async () => [];
  const key = {
    currency0: zeroAddress,
    currency1: owner,
    fee: 500,
    tickSpacing: 10,
    hooks: zeroAddress,
  };
  adapter.poolDisplay = async () => ({
    pair: "ETH / USDC",
    feeTier: "0.05%",
    poolId: "0x01",
    lowerPrice: "1",
    upperPrice: "2",
    currentPrice: "1.5",
    inRange: true,
  });
  const reads: string[] = [];
  adapter.read = async (
    address: string,
    _abi: unknown,
    fn: string,
    args: any[] = [],
  ) => {
    reads.push(`${fn}:${args[0] ?? ""}`);
    if (fn === "nextSeriesId") return 2n;
    if (fn === "nextOfferId") return 2n;
    if (fn === "offers")
      return [
        owner,
        claim,
        1n,
        10000n * 10n ** 18n,
        1000n * 10n ** 18n,
        10000000n,
        200n,
        1800000300n,
        "0x" + "00".repeat(32),
        false,
      ];
    if (fn === "series")
      return {
        tokenId: 1n,
        claim,
        residualOwner: owner,
        key,
        tickLower: -60,
        tickUpper: 60,
        liquidity: 100n,
        activationBlock: 10n,
        endBlock: 124n,
        baselineX128: 0n,
        quantity: 10000n * 10n ** 18n,
        capturedUSDC: 100000000n,
        otherReserve: 0n,
        soldUSDC: 100000000n,
        redeemedQuantity: 0n,
        paidClaims: 0n,
        residualUSDC: 0n,
        captured: true,
        allocated: true,
        nftReturned: true,
        closed: false,
      };
    if (fn === "balanceOf")
      return address === claim ? 5000n * 10n ** 18n : 100000000n;
    if (fn === "ownerOf") {
      if (args[0] === 1n) throw error;
      return owner;
    }
    if (fn === "getPoolAndPositionInfo")
      return [key, (BigInt.asUintN(24, -60n) << 8n) | (60n << 32n)];
    if (fn === "getPositionLiquidity") return 100n;
    if (fn === "getApproved") return zeroAddress;
    if (fn === "isApprovedForAll") return false;
    throw new Error(`Unexpected read ${fn}`);
  };
  return { adapter, reads };
}
test("public discovery keeps allocated claims and valid NFTs when the original canonical NFT was burned", async () => {
  const { adapter, reads } = setup(revert("NOT_MINTED"));
  const snapshot = await adapter.load();
  expect(snapshot.markets).toHaveLength(1);
  expect(snapshot.markets[0]).toMatchObject({
    id: "1",
    tokenId: "1",
    phase: "allocated",
    nftReturned: true,
    allocatedMicros: "100000000",
  });
  expect(snapshot.wallet.claims["1"]).toBe("5000000000000000000000");
  expect(snapshot.fundedOffers).toHaveLength(1);
  expect(snapshot.fundedOffers[0]).toMatchObject({
    tokenId: "1",
    fundedMicros: "10000000",
  });
  expect(snapshot.positions).toHaveLength(1);
  expect(snapshot.positions[0]).toMatchObject({
    tokenId: "2",
    owner,
    ownedByWallet: true,
    liquidity: "100",
  });
  expect(reads).not.toContain("getPoolAndPositionInfo:1");
  expect(reads).toContain("getPoolAndPositionInfo:2");
});
test("public discovery refuses RPC outages, generic reverts and transport text pretending an NFT is absent", async () => {
  for (const error of [
    new Error("RPC unavailable: " + d.rpcUrl),
    new Error("transport text NOT_MINTED " + d.rpcUrl),
    revert("UNAUTHORIZED"),
    new ContractFunctionRevertedError({
      abi: nftABI,
      functionName: "ownerOf",
      data: "0x",
    }),
  ]) {
    const { adapter } = setup(error);
    await expect(adapter.load()).rejects.toThrow();
  }
});
test("public adapter errors omit provider URLs and nested request diagnostics without hiding failure", async () => {
  const secretLikeURL =
    "https://user:password-sentinel@example.invalid/path-sentinel?key=query-sentinel";
  const transportError = new BaseError(
    "Provider temporarily unavailable at " + secretLikeURL,
    {
      metaMessages: [
        "Authorization: request-header-sentinel",
        "Request URL: " + secretLikeURL,
      ],
    },
  );
  const { adapter } = setup(transportError);
  for (const operation of [
    () => adapter.load(),
    () => {
      adapter.deployment = {
        ...d,
        mode: "local",
        chainId: 31337,
        rpcUrl: "http://127.0.0.1:8550",
      };
      adapter.validate = ChainAdapter.prototype.validate;
      adapter.client.getChainId = async () => {
        throw transportError;
      };
      return adapter.validate();
    },
  ]) {
    try {
      await operation();
      throw new Error("Expected failure");
    } catch (error) {
      const exposed = String(error);
      expect(exposed).toContain("Provider temporarily unavailable");
      expect(exposed).toContain("[provider URL redacted]");
      for (const sentinel of [
        "password-sentinel",
        "path-sentinel",
        "query-sentinel",
        "request-header-sentinel",
      ])
        expect(exposed).not.toContain(sentinel);
      expect((error as Error).cause).toBeUndefined();
    }
  }
});
