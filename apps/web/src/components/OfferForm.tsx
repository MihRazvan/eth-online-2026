import { useState } from "react";
import type { Action, Position, Snapshot } from "../types";
import { deadlineDate, formatClaims, money, sharePercent } from "../amounts";
import { offerTerms, ORIGINAL_Q } from "../offerTerms";

export function OfferForm({ position, snapshot, disabled, onReview, onError }: {
  position: Position; snapshot: Snapshot; disabled: boolean;
  onReview: (review: { title: string; action: Action; lines: [string, string][]; warning: string; button: string }) => void;
  onError: (message: string) => void;
}) {
  const [payment, setPayment] = useState("1"), [percentage, setPercentage] = useState("80"),
    [endBlock, setEndBlock] = useState((BigInt(snapshot.blockNumber) + 600n).toString()),
    [deadline, setDeadline] = useState(new Date((Number(snapshot.timestamp) + 3600) * 1000).toISOString().slice(0, 16));
  return <form className="fund-form" onSubmit={(event) => {
    event.preventDefault();
    try {
      const terms = offerTerms({ payment, percentage, endBlock, deadline: deadline + "Z" }, snapshot.blockNumber, snapshot.timestamp);
      if (BigInt(terms.paymentMicros) > BigInt(snapshot.wallet.usdcBalanceMicros)) throw new Error("Insufficient USDC for this offer. Reduce the payment or add Sepolia test USDC.");
      onReview({ title: "Fund an exact offer", action: { type: "fundOffer", tokenId: position.tokenId, seller: position.owner, positionCommitment: position.commitment, ...terms },
        lines: [["Escrow USDC", money(terms.paymentMicros, 6) + " USDC"], ["Claims to buy", `${formatClaims(terms.claims)} of 10,000 (${sharePercent(terms.claims, ORIGINAL_Q.toString())}%)`], ["Original NFT", "#" + position.tokenId], ["Seller", position.owner ?? "Fixture seller"], ["Position range", "$" + position.lowerPrice + " — $" + position.upperPrice], ["Liquidity units", position.liquidity], ["Earning endpoint", "End of block " + BigInt(terms.endBlock).toLocaleString("en-US")], ["Offer deadline", deadlineDate(terms.deadlineTimestamp)]],
        warning: "Funding escrows your payment; no claims are issued until the NFT owner accepts these exact terms. Income can be zero. Expiry does not refund automatically: cancel the unaccepted offer to recover USDC. A USDC approval may be requested before funding.", button: "Fund offer" });
    } catch (error) { onError((error as Error).message); }
  }}>
    <label htmlFor="fund-amount">Upfront USDC<input id="fund-amount" inputMode="decimal" value={payment} onChange={(event) => setPayment(event.target.value)} required /></label>
    <label htmlFor="fund-share">Sold share (%)<input id="fund-share" inputMode="decimal" value={percentage} onChange={(event) => setPercentage(event.target.value)} required /></label>
    <label htmlFor="fund-end">Exact end block<input id="fund-end" inputMode="numeric" value={endBlock} onChange={(event) => setEndBlock(event.target.value)} required /></label>
    <label htmlFor="fund-deadline">Accept before (UTC)<input id="fund-deadline" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} required /></label>
    <p className="fine">Original Q stays 10,000 claims. Unsold claims remain with the seller. Current block {BigInt(snapshot.blockNumber).toLocaleString("en-US")}. The default window is 600 blocks (about two hours on Sepolia); block time varies. The exact block controls the endpoint. Values stay fixed while you edit.</p>
    <p className="fine">A positive share does not guarantee a payout. Redemption rounds down to whole USDC micro-units; tiny entitlements can round to zero.</p>
    <button type="submit" disabled={disabled}>Review funding</button>
  </form>;
}
