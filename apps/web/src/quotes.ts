import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
  sliceHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { MakerStrategy, StrategyLimitation } from "./types";
export const ORDER_PARAMETERS = parseAbiParameters(
  "(address maker,uint256 traits,bytes data)",
);
export interface CanonicalOrder {
  maker: Address;
  traits: bigint;
  data: Hex;
}
const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b));
/** Maximum exact-input size under the maker's output limit. Both legs remain integers. */
export function executableCapacity(
  claimsIn: boolean,
  claimUnits: bigint,
  usdcUnits: bigint,
  outputLimit: bigint,
): bigint {
  if (claimUnits <= 0n || usdcUnits <= 0n || outputLimit <= 0n) return 0n;
  const input = claimsIn ? claimUnits : usdcUnits,
    output = claimsIn ? usdcUnits : claimUnits;
  // Largest integer input whose floor(input * outputRatio / inputRatio) fits.
  const maxInput = min(
    input,
    ((min(outputLimit, output) + 1n) * input - 1n) / output,
  );
  const received = (maxInput * output) / input;
  return received === 0n ? 0n : claimsIn ? maxInput : received;
}
export function strategyCapacity(input: {
  claimsIn: boolean;
  claimUnits: bigint;
  usdcUnits: bigint;
  virtual: bigint;
  balance: bigint;
  allowance: bigint;
  cancelled: boolean;
  expired: boolean;
  stale: boolean;
  active: boolean;
}) {
  const x = input,
    advertised = x.claimsIn ? x.usdcUnits : x.claimUnits;
  const limitations: StrategyLimitation[] = [];
  if (x.cancelled) limitations.push("cancelled");
  if (x.expired) limitations.push("expired");
  if (x.stale) limitations.push("series-state-changed");
  if (!x.active && !x.cancelled) limitations.push("unavailable");
  if (!x.cancelled) {
    if (x.virtual === 0n || x.balance === 0n) limitations.push("depleted");
    if (x.allowance === 0n) limitations.push("allowance-revoked");
    else if (x.allowance < min(advertised, x.virtual, x.balance))
      limitations.push("allowance-limited");
    if (x.balance < min(advertised, x.virtual))
      limitations.push("wallet-balance-limited");
    if (x.virtual > 0n && x.virtual < advertised)
      limitations.push("partially-filled");
  }
  const available =
    x.cancelled || x.expired || x.stale || !x.active
      ? 0n
      : executableCapacity(
          x.claimsIn,
          x.claimUnits,
          x.usdcUnits,
          min(advertised, x.virtual, x.balance, x.allowance),
        );
  if (available === 0n && limitations.length === 0)
    limitations.push("depleted");
  return { available, limitations };
}
/** Only restore frozen fields in a fresh canonical builder result; compare every other byte. */
export function restoreFrozenOrder(
  rebuilt: CanonicalOrder,
  seriesId: bigint,
  expectedState: Hex,
  deadline: bigint,
): CanonicalOrder {
  const guard = encodeAbiParameters(parseAbiParameters("uint256,bytes32"), [
    seriesId,
    expectedState,
  ]);
  return {
    ...rebuilt,
    data: concatHex([
      sliceHex(rebuilt.data, 0, 60),
      guard,
      sliceHex(rebuilt.data, 124, 144),
      guard,
      sliceHex(rebuilt.data, 208, 228),
      guard,
      sliceHex(rebuilt.data, 292, 294),
      toHex(deadline, { size: 5 }),
      sliceHex(rebuilt.data, 299),
    ]),
  };
}
export function decodeFrozenOrder(
  order: CanonicalOrder,
  market: Address,
  cash: Address,
  claim: Address,
) {
  // Fixed layout: sorted token pair; three explicit 84-byte hooks; 110-byte program.
  const ends = [160n, 176n, 192n, 208n].map((shift) =>
    Number((order.traits >> shift) & 65535n),
  );
  if (ends.join(",") !== "124,208,208,292")
    throw new Error("Unsupported order layout");
  if (sliceHex(order.data, 40, 60).toLowerCase() !== market.toLowerCase())
    throw new Error("Wrong market hook");
  const [seriesId, expectedState] = decodeAbiParameters(
    parseAbiParameters("uint256,bytes32"),
    sliceHex(order.data, 60, 124),
  );
  const program = sliceHex(order.data, 292);
  if (
    (program.length - 2) / 2 !== 110 ||
    sliceHex(program, 0, 2) !== "0x2005" ||
    sliceHex(program, 7, 9) !== "0x9040" ||
    sliceHex(program, 73, 75) !== "0x5301" ||
    sliceHex(program, 76, 78) !== "0x0220"
  )
    throw new Error("Unsupported order program");
  const direction = BigInt(sliceHex(program, 75, 76));
  if (direction !== 0n && direction !== 128n)
    throw new Error("Invalid direction");
  const first = BigInt(sliceHex(program, 9, 41)),
    second = BigInt(sliceHex(program, 41, 73));
  const claimUnits = BigInt(claim) < BigInt(cash) ? first : second,
    usdcUnits = BigInt(claim) < BigInt(cash) ? second : first;
  if (claimUnits === 0n || usdcUnits === 0n) throw new Error("Invalid ratio");
  return {
    seriesId,
    expectedState,
    claimUnits,
    usdcUnits,
    claimsIn: (direction === 128n) === BigInt(claim) < BigInt(cash),
    deadline: BigInt(sliceHex(program, 2, 7)),
    salt: sliceHex(program, 78, 110),
  };
}
export const STRATEGY_LABELS: Record<StrategyLimitation, string> = {
  cancelled: "Cancelled",
  expired: "Expired",
  "series-state-changed": "Series state changed",
  depleted: "Depleted",
  "allowance-revoked": "Allowance revoked",
  "allowance-limited": "Allowance limited",
  "wallet-balance-limited": "Wallet balance limited",
  "partially-filled": "Partially filled",
  unavailable: "Unavailable",
};
export function strategyStatus(s: MakerStrategy) {
  return s.limitations.length
    ? s.limitations.map((x) => STRATEGY_LABELS[x]).join(" · ")
    : "Executable now";
}
