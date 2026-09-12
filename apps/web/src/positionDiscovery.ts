import { zeroAddress, type Address } from "viem";

export const POSITION_LOOKBACK = 50_000n;
export const POSITION_PAGE = 5_000n;
export const POSITION_LIMIT = 100;

/** Parse identifiers only. A pasted URL is never fetched or treated as a contract address. */
export function positionId(input: string): string {
  let value = input.trim();
  if (value.startsWith("https://")) {
    const url = new URL(value);
    const match = url.pathname.match(/^\/positions\/v4\/ethereum_sepolia\/([0-9]+)\/?$/);
    if (url.origin !== "https://app.uniswap.org" || url.username || url.password || !match)
      throw new Error("Use an Ethereum Sepolia v4 position link or its NFT ID.");
    value = match[1];
  }
  if (!/^[0-9]{1,78}$/.test(value) || BigInt(value) === 0n || BigInt(value) >= 1n << 256n)
    throw new Error("Enter a valid NFT ID or Ethereum Sepolia v4 position link.");
  return BigInt(value).toString();
}

export function positionIneligibility(
  key: { currency0: Address; currency1: Address; hooks: Address },
  info: bigint,
  liquidity: bigint,
  usdc: Address,
): string | undefined {
  if (key.hooks.toLowerCase() !== zeroAddress) return "Positions with hooks are not supported.";
  if (liquidity === 0n) return "This position has no liquidity.";
  if ((info & 255n) !== 0n) return "Remove the position's subscriber before using it here.";
  if (![key.currency0, key.currency1].some((token) => token.toLowerCase() === usdc.toLowerCase()))
    return "This position must contain the supported Sepolia USDC token.";
}

/** Bounded recent incoming-transfer search, newest first; ownerOf remains authoritative. */
export async function recentPositionIds(
  head: bigint,
  readPage: (from: bigint, to: bigint) => Promise<readonly bigint[]>,
): Promise<{ ids: string[]; incomplete: boolean }> {
  const floor = head >= POSITION_LOOKBACK ? head - POSITION_LOOKBACK + 1n : 0n;
  const ids = new Set<string>();
  let incomplete = false;
  for (let to = head; to >= floor;) {
    const from = to - floor + 1n > POSITION_PAGE ? to - POSITION_PAGE + 1n : floor;
    try {
      const page = await readPage(from, to);
      for (const id of [...page].reverse()) {
        if (ids.size === POSITION_LIMIT) { incomplete = true; break; }
        ids.add(positionId(id.toString()));
      }
    } catch {
      // Provider diagnostics may contain credentials. Return a fixed UI notice instead.
      incomplete = true;
      break;
    }
    if (ids.size === POSITION_LIMIT && from !== floor) incomplete = true;
    if (from === floor || ids.size === POSITION_LIMIT) break;
    to = from - 1n;
  }
  return { ids: [...ids], incomplete };
}
