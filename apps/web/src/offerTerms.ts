import { CLAIM_UNIT, parseClaims, parseUsdc } from "./amounts";

export const ORIGINAL_Q = 10000n * CLAIM_UNIT;
/** UI bounds for a deliberate, small test offer. The exact integers are reviewed. */
export function offerTerms(input: { payment: string; percentage: string; endBlock: string; deadline: string }, head: string, timestamp: string) {
  const payment = parseUsdc(input.payment);
  const percentage = parseClaims(input.percentage);
  if (payment <= 0n || payment > 1000n * 1000000n) throw new Error("Choose an upfront payment above zero and at most 1,000 test USDC.");
  if (percentage <= 0n || percentage > 100n * CLAIM_UNIT) throw new Error("Choose a sold share above 0% and at most 100%.");
  const claims = ORIGINAL_Q * percentage / (100n * CLAIM_UNIT);
  if (claims === 0n) throw new Error("The sold share rounds to zero claim units.");
  if (!/^\d{1,20}$/.test(input.endBlock)) throw new Error("Enter the exact positive end block as an integer.");
  const endBlock = BigInt(input.endBlock);
  if (endBlock <= BigInt(head) + 32n || endBlock > BigInt(head) + 216000n) throw new Error("Choose an end block more than 32 and at most 216,000 blocks ahead. Allow enough time for both wallets.");
  const milliseconds = Date.parse(input.deadline);
  if (!Number.isFinite(milliseconds)) throw new Error("Choose an acceptance deadline.");
  const deadline = BigInt(Math.floor(milliseconds / 1000));
  if (deadline <= BigInt(timestamp) + 60n || deadline > BigInt(timestamp) + 86400n) throw new Error("Choose an acceptance deadline more than one minute and at most 24 hours ahead.");
  return { paymentMicros: payment.toString(), claims: claims.toString(), endBlock: endBlock.toString(), deadlineTimestamp: deadline.toString() };
}
export function positionRoute(tokenId: string, offerId?: string) {
  return `#pin/${encodeURIComponent(tokenId)}${offerId ? `?offer=${encodeURIComponent(offerId)}` : ""}`;
}
export function parsePositionRoute(route: string) {
  const match = /^pin\/([1-9][0-9]{0,77})(?:\?offer=([1-9][0-9]{0,77}))?$/.exec(route);
  return match ? { tokenId: match[1], offerId: match[2] } : null;
}
