import { encodeAbiParameters, isAddress, keccak256, parseAbi, parseAbiParameters, toHex, zeroAddress, type Address, type Hex, type PublicClient } from "viem";

export interface FeeEstimateDeployment { chainId: number; feeStrip: Address; positionManager: Address; poolManager: Address; usdc: Address }
export type PositionFeeEstimate = { status: "unavailable"; code: "TIMEOUT" | "SCOPE_MISMATCH" | "POSITION_CHANGED" | "HISTORY_UNAVAILABLE" } | {
  status: "available"; chainId: number; tokenId: bigint; poolId: Hex; positionCommitment: Hex;
  liquidity: bigint; tickLower: number; tickUpper: number; sampleUsdcMicros: bigint; durationSeconds: bigint;
  source: { fromBlock: bigint; fromHash: Hex; fromTimestamp: bigint; toBlock: bigint; toHash: Hex; toTimestamp: bigint; finalized: true };
  method: "constant-liquidity-range-fee-growth"; includesDonations: true; liquidityHistoryVerified: false; allocationAuthority: "contract-only";
};
type Reader = Pick<PublicClient, "getChainId" | "getBlock" | "readContract">;
const feeAbi = parseAbi(["function positionManager() view returns(address)", "function poolManager() view returns(address)", "function usdc() view returns(address)", "function positionCommitment(uint256) view returns(bytes32)"]);
const positionAbi = parseAbi(["function getPositionLiquidity(uint256) view returns(uint128)", "function getPoolAndPositionInfo(uint256) view returns((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),uint256)"]);
const managerAbi = parseAbi(["function extsload(bytes32) view returns(bytes32)"]);
const tokenAbi = parseAbi(["function decimals() view returns(uint8)"]);
const keyType = parseAbiParameters("(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)");
const wrap = (value: bigint) => BigInt.asUintN(256, value);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
type EstimateCode = "SCOPE_MISMATCH" | "POSITION_CHANGED" | "HISTORY_UNAVAILABLE" | "TIMEOUT";
class EstimateError extends Error { readonly code: EstimateCode; constructor(code: EstimateCode) { super(code); this.code = code; } }
function requireValue(value: unknown, code: EstimateError["code"] = "HISTORY_UNAVAILABLE"): asserts value { if (!value) throw new EstimateError(code); }

/** End-state inside growth, including both out-of-range cases and uint256 wrap. */
export function feeGrowthInside(tick: number, lower: number, upper: number, global: bigint, outsideLower: bigint, outsideUpper: bigint): bigint {
  requireValue([tick, lower, upper].every(n => Number.isInteger(n) && Math.abs(n) <= 887272) && lower < upper);
  requireValue([global, outsideLower, outsideUpper].every(n => n >= 0n && n === wrap(n)));
  const below = tick >= lower ? outsideLower : wrap(global - outsideLower);
  const above = tick < upper ? outsideUpper : wrap(global - outsideUpper);
  return wrap(global - below - above);
}
export function feeGrowthSample(liquidity: bigint, start: bigint, end: bigint): bigint {
  requireValue(liquidity > 0n && liquidity < 1n << 128n && [start, end].every(n => n >= 0n && n === wrap(n)));
  return liquidity * wrap(end - start) / (1n << 128n);
}

/** Read-only historical model. Endpoint equality does NOT establish liquidity continuity.
 * The total deadline also prevents late RPC responses from scheduling further reads.
 */
export async function estimatePositionFees(client: Reader, deployment: FeeEstimateDeployment, tokenId: bigint): Promise<PositionFeeEstimate> {
  let active = true;
  const deadline = Date.now() + 10_000;
  const checkTime = () => requireValue(active && Date.now() < deadline, "TIMEOUT");
  const read = async <T>(call: () => Promise<T>): Promise<T> => { checkTime(); const value = await call(); checkTime(); return value; };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new EstimateError("TIMEOUT")); }, 10_000); });
  const work = async (): Promise<PositionFeeEstimate> => {
    requireValue(Number.isSafeInteger(deployment.chainId) && deployment.chainId > 0 && tokenId > 0n && tokenId < 1n << 256n, "SCOPE_MISMATCH");
    requireValue([deployment.feeStrip, deployment.positionManager, deployment.poolManager, deployment.usdc].every(a => isAddress(a) && !same(a, zeroAddress)), "SCOPE_MISMATCH");
    const [chain, head] = await Promise.all([read(() => client.getChainId()), read(() => client.getBlock({ blockTag: "finalized" }))]);
    requireValue(chain === deployment.chainId, "SCOPE_MISMATCH");
    requireValue(head.hash && head.number >= 7200n && head.timestamp <= BigInt(Math.floor(Date.now() / 1000) + 15));
    // Finality may lag the latest chain, but a day-old observation is not a usable sample.
    requireValue(head.timestamp >= BigInt(Math.floor(Date.now() / 1000) - 3600));
    const start = await read(() => client.getBlock({ blockNumber: head.number - 7200n }));
    requireValue(start.hash && start.timestamp < head.timestamp);
    const at = <T>(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[], blockNumber: bigint) => read(() => client.readContract({ address, abi, functionName, args, blockNumber } as Parameters<Reader["readContract"]>[0])) as Promise<T>;
    const [bindings, decimals, current, previous, liquidity, previousLiquidity, commitment] = await Promise.all([
      Promise.all(["positionManager", "poolManager", "usdc"].map(name => at<Address>(deployment.feeStrip, feeAbi, name, [], head.number))),
      at<number>(deployment.usdc, tokenAbi, "decimals", [], head.number),
      at<readonly [{ currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }, bigint]>(deployment.positionManager, positionAbi, "getPoolAndPositionInfo", [tokenId], head.number),
      at<readonly [{ currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }, bigint]>(deployment.positionManager, positionAbi, "getPoolAndPositionInfo", [tokenId], start.number),
      at<bigint>(deployment.positionManager, positionAbi, "getPositionLiquidity", [tokenId], head.number),
      at<bigint>(deployment.positionManager, positionAbi, "getPositionLiquidity", [tokenId], start.number),
      at<Hex>(deployment.feeStrip, feeAbi, "positionCommitment", [tokenId], head.number),
    ]);
    requireValue(bindings.every((a, i) => same(a, [deployment.positionManager, deployment.poolManager, deployment.usdc][i])) && decimals === 6, "SCOPE_MISMATCH");
    const [key, info] = current, tickLower = Number(BigInt.asIntN(24, info >> 8n)), tickUpper = Number(BigInt.asIntN(24, info >> 32n));
    requireValue(same(key.hooks, zeroAddress) && [key.currency0, key.currency1].some(a => same(a, deployment.usdc)), "SCOPE_MISMATCH");
    requireValue(liquidity > 0n && liquidity === previousLiquidity && encodeAbiParameters(keyType, [key]) === encodeAbiParameters(keyType, [previous[0]]) && info === previous[1], "POSITION_CHANGED");
    const poolId = keccak256(encodeAbiParameters(keyType, [key]));
    const base = BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32,uint256"), [poolId, 6n])));
    const lowerSlot = BigInt(keccak256(encodeAbiParameters(parseAbiParameters("int24,uint256"), [tickLower, wrap(base + 4n)])));
    const upperSlot = BigInt(keccak256(encodeAbiParameters(parseAbiParameters("int24,uint256"), [tickUpper, wrap(base + 4n)])));
    const currencyOffset = same(key.currency0, deployment.usdc) ? 1n : 2n;
    const slots = [base, wrap(base + currencyOffset), wrap(lowerSlot + currencyOffset), wrap(upperSlot + currencyOffset), lowerSlot, upperSlot];
    const growth = async (blockNumber: bigint) => {
      const words = await Promise.all(slots.map(slot => at<Hex>(deployment.poolManager, managerAbi, "extsload", [toHex(slot, { size: 32 })], blockNumber).then(BigInt)));
      requireValue(BigInt.asUintN(128, words[4]) > 0n && BigInt.asUintN(128, words[5]) > 0n);
      return feeGrowthInside(Number(BigInt.asIntN(24, words[0] >> 160n)), tickLower, tickUpper, words[1], words[2], words[3]);
    };
    const [fromGrowth, toGrowth] = await Promise.all([growth(start.number), growth(head.number)]);
    const [againStart, againHead, againChain, latestCommitment] = await Promise.all([
      read(() => client.getBlock({ blockNumber: start.number })), read(() => client.getBlock({ blockNumber: head.number })), read(() => client.getChainId()),
      read(() => client.readContract({ address: deployment.feeStrip, abi: feeAbi, functionName: "positionCommitment", args: [tokenId], blockTag: "latest" })),
    ]);
    requireValue(againChain === chain, "SCOPE_MISMATCH");
    requireValue(againStart.hash === start.hash && againHead.hash === head.hash);
    requireValue(same(commitment, latestCommitment), "POSITION_CHANGED");
    checkTime();
    return { status: "available", chainId: chain, tokenId, poolId, positionCommitment: commitment, liquidity, tickLower, tickUpper,
      sampleUsdcMicros: feeGrowthSample(liquidity, fromGrowth, toGrowth), durationSeconds: head.timestamp - start.timestamp,
      source: { fromBlock: start.number, fromHash: start.hash, fromTimestamp: start.timestamp, toBlock: head.number, toHash: head.hash, toTimestamp: head.timestamp, finalized: true },
      method: "constant-liquidity-range-fee-growth", includesDonations: true, liquidityHistoryVerified: false, allocationAuthority: "contract-only" };
  };
  try { return await Promise.race([work(), timeout]); }
  catch (error) { return { status: "unavailable", code: error instanceof EstimateError ? error.code : "HISTORY_UNAVAILABLE" }; }
  finally { active = false; clearTimeout(timer); }
}
