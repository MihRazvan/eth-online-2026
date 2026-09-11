export const CLAIM_UNIT = 10n ** 18n;
/** Executable values always remain integers: USDC 6 decimals, claims 18 decimals. */
function parseDecimal(value: string, decimals: number): bigint {
  if (!new RegExp("^\\d+(\\.\\d{0," + decimals + "})?$").test(value))
    throw new Error(
      `Enter a positive amount with at most ${decimals} decimals.`,
    );
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"))
  );
}
export function parseUsdc(value: string): bigint {
  return parseDecimal(value, 6);
}
export function parseClaims(value: string): bigint {
  return parseDecimal(value, 18);
}
export function formatClaims(value: string | bigint): string {
  const n = BigInt(value),
    whole = n / CLAIM_UNIT,
    fraction = (n % CLAIM_UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return whole.toLocaleString("en-US") + (fraction ? "." + fraction : "");
}
export function claimCost(
  quantity: string | bigint,
  askMicros: string | bigint,
): bigint {
  return (BigInt(quantity) * BigInt(askMicros) + CLAIM_UNIT - 1n) / CLAIM_UNIT;
}
export function money(value: string | bigint, places = 2): string {
  const n = BigInt(value),
    negative = n < 0n,
    absolute = negative ? -n : n;
  const whole = (absolute / 1_000_000n).toLocaleString("en-US");
  const decimals = (absolute % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .slice(0, places);
  return `${negative ? "−" : ""}$${whole}${places ? "." + decimals : ""}`;
}
export function integer(value: string): string {
  return BigInt(value).toLocaleString("en-US");
}
export function validQuantity(value: string): boolean {
  try {
    return parseClaims(value) > 0n;
  } catch {
    return false;
  }
}
export function sharePercent(quantity: string, supply: string): string {
  const scaled = (BigInt(quantity) * 100_000_000n) / BigInt(supply);
  if (scaled === 0n && BigInt(quantity) > 0n) return "<0.000001";
  const fraction = (scaled % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return (scaled / 1_000_000n).toString() + "." + fraction;
}
export function deadlineDate(seconds: string): string {
  return new Date(Number(seconds) * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC");
}
