import { listingId } from "../../../../packages/listings/src/shared.mjs";
import { clearPendingListing } from "../listingJournal";
import { useState } from "react";
import type { ReactNode } from "react";
import type { Action, Position, Snapshot } from "../types";
import type { SellerListing, SellerListingTerms } from "../listingTypes";
import { money, sharePercent, deadlineDate, integer } from "../amounts";
import { offerTerms, ORIGINAL_Q, positionRoute } from "../offerTerms";

type Review = { title: string; action: Action; lines: [string, string][]; warning: string; button: string };
type ReviewProps = { onReview: (review: Review) => void; onError: (message: string) => void };
export const listingRoute = (id: string) => `#listing/${id}`;
const short = (value: string) => value.slice(0, 6) + "…" + value.slice(-4);

export function ListingForm({ position, snapshot, disabled = false, onReview, onError }: ReviewProps & { position: Position; snapshot: Snapshot; disabled?: boolean }) {
  const [payment, setPayment] = useState("1"), [percentage, setPercentage] = useState("100");
  const [endBlock, setEndBlock] = useState((BigInt(snapshot.blockNumber) + 600n).toString());
  const [deadline, setDeadline] = useState(new Date((Number(snapshot.timestamp) + 3600) * 1000).toISOString().slice(0, 16));
  const available = snapshot.listingDirectory?.status === "available";
  const owner = position.ownedByWallet !== false && snapshot.wallet.address?.toLowerCase() === position.owner?.toLowerCase();
  return <form className="listing-form" aria-label="Publish seller listing" onSubmit={(event) => {
    event.preventDefault();
    try {
      if (!snapshot.feeStrip || !snapshot.positionManager || !snapshot.usdc || !position.commitment || !position.owner) throw new Error("Verified deployment and position details are required before listing.");
      if (!owner) throw new Error("Connect the NFT owner's wallet to publish its terms.");
      const parsed = offerTerms({ payment, percentage, endBlock, deadline: deadline + "Z" }, snapshot.blockNumber, snapshot.timestamp);
      const random = crypto.getRandomValues(new Uint8Array(32));
      const nonce = ("0x" + Array.from(random, byte => byte.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
      const terms: SellerListingTerms = { schemaVersion: 1, chainId: snapshot.chainId, feeStrip: snapshot.feeStrip as `0x${string}`, positionManager: snapshot.positionManager, usdc: snapshot.usdc, seller: position.owner as `0x${string}`, tokenId: position.tokenId, positionCommitment: position.commitment as `0x${string}`, originalSupply: ORIGINAL_Q.toString(), buyerQuantity: parsed.claims, proceedsMicros: parsed.paymentMicros, endBlock: parsed.endBlock, deadlineTimestamp: parsed.deadlineTimestamp, nonce };
      onReview({ title: "Publish signed listing", action: { type: "publishListing", terms }, lines: [["Position", "NFT " + position.tokenId], ["Share offered", sharePercent(terms.buyerQuantity, terms.originalSupply) + "%"], ["Upfront payment for this share", money(terms.proceedsMicros, 6) + " USDC"], ["Exact earning endpoint", "End of block " + integer(terms.endBlock)], ["Acceptance deadline", deadlineDate(terms.deadlineTimestamp)], ["Custody", "NFT stays in your wallet until you accept a funded offer"]], warning: "This signature publishes an advertisement, not a sale or NFT approval. A buyer can fund these terms; you must then approve and accept their offer. No claims are issued and no USDC is paid to you before acceptance.", button: "Sign and publish listing" });
    } catch (error) { onError((error as Error).message); }
  }}>
    <h3>Set your listing</h3>
    <p className="fine">Publish exact terms for a buyer to fund. Your NFT stays in your wallet until you accept their funded offer.</p>
    <div className="field"><label htmlFor={`listing-share-${position.tokenId}`}>Share of the window to sell (%)</label><input id={`listing-share-${position.tokenId}`} inputMode="decimal" value={percentage} onChange={e => setPercentage(e.target.value)} required /></div>
    <div className="field"><label htmlFor={`listing-ask-${position.tokenId}`}>Asking USDC for this share</label><input id={`listing-ask-${position.tokenId}`} inputMode="decimal" value={payment} onChange={e => setPayment(e.target.value)} required /></div>
    <div className="est"><span className="tele">Fee estimate</span><p className="estnote">A verified fee forecast is not available for this position. Set your own asking price; income can be zero.</p></div>
    <div className="field"><label htmlFor={`listing-end-${position.tokenId}`}>Exact earning end block</label><input id={`listing-end-${position.tokenId}`} inputMode="numeric" value={endBlock} onChange={e => setEndBlock(e.target.value)} required /></div>
    <div className="field"><label htmlFor={`listing-deadline-${position.tokenId}`}>Seller must accept before (UTC)</label><input id={`listing-deadline-${position.tokenId}`} type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} required /></div>
    <p className="fine">Current block {integer(snapshot.blockNumber)}. The default 600-block window is about two hours on Sepolia; block time varies. The window starts only when you accept. Terms remain fixed while you edit.</p>
    {!available && <p className="inline-warning">The listing service is unavailable. You can prepare terms, but they will not be published until the project service is online.</p>}
    <div className="actions"><button className="btn primary" type="submit" disabled={disabled || !owner || !snapshot.wallet.connected || snapshot.wallet.chainId !== snapshot.chainId || !available}>Review listing</button></div>
    <p className="tele">Wallet signature · no gas · no NFT transfer · standard EOA wallets</p>
  </form>;
}

export function ListingRows({ listings, art }: { listings: SellerListing[]; art?: (tokenId: string) => ReactNode }) {
  return <div className="listing-rows rows">{listings.map(listing => <a className="row listing-row" key={listing.listingId} href={listingRoute(listing.listingId)}>
    <span className="art">{art?.(listing.terms.tokenId)}</span><span><span className="rowid display">NFT {listing.terms.tokenId}</span><span className="rowsub tele" style={{ display: "block" }}>Seller listing · {listing.status} · {sharePercent(listing.terms.buyerQuantity, listing.terms.originalSupply)}% share</span><span className="fine">Listing alone does not escrow the NFT</span></span><span className="rowright"><span className="price">{money(listing.terms.proceedsMicros, 6)} USDC</span><span className="tele" style={{ display: "block" }}>for this exact share</span></span>
  </a>)}</div>;
}

export function ListingDetail({ listing, snapshot, disabled = false, onReview, onError }: ReviewProps & { listing: SellerListing; snapshot: Snapshot; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const t = listing.terms, owner = snapshot.wallet.address?.toLowerCase() === t.seller.toLowerCase();
  const expired = BigInt(t.endBlock) <= BigInt(snapshot.blockNumber) + 32n || BigInt(t.deadlineTimestamp) <= BigInt(snapshot.timestamp) + 60n;
  const paused = snapshot.mode === "testnet" && !snapshot.saleReadiness?.ready;
  const share = sharePercent(t.buyerQuantity, t.originalSupply);
  const fund = () => {
    if (BigInt(snapshot.wallet.usdcBalanceMicros) < BigInt(t.proceedsMicros)) return onError("Insufficient USDC to fund this exact listing.");
    onReview({ title: "Fund this seller listing", action: { type: "fundOffer", listingId: listing.listingId, tokenId: t.tokenId, seller: t.seller, positionCommitment: t.positionCommitment, paymentMicros: t.proceedsMicros, claims: t.buyerQuantity, endBlock: t.endBlock, deadlineTimestamp: t.deadlineTimestamp }, lines: [["Listing", listing.listingId], ["Position", "NFT " + t.tokenId], ["Seller", t.seller], ["USDC held in the offer", money(t.proceedsMicros, 6) + " USDC"], ["Share after acceptance", share + "% of original Q"], ["Exact earning endpoint", "End of block " + integer(t.endBlock)], ["Acceptance deadline", deadlineDate(t.deadlineTimestamp)]], warning: "Funding creates a refundable offer. It does not buy claims or pay the seller until they approve and accept. Other buyers may fund competing offers. You can cancel an unaccepted offer to recover USDC; expiry does not refund automatically. A USDC approval may be needed first.", button: "Fund offer" });
  };
  return <section aria-label="Seller listing details" className="listing-detail">
    <span className="tele tele-sel">Seller listing · {expired && listing.status === "available" ? "not enough time remains" : listing.status}</span>
    <h1 className="display">NFT {t.tokenId}</h1>
    <div className="readout"><div><span className="tele">Exact share offered</span><div className="big">{share}%</div></div><div><span className="tele">You fund</span><div className="big">{money(t.proceedsMicros, 6)} USDC</div></div></div>
    <ul className="terms"><li><span>Seller</span><span title={t.seller}>{short(t.seller)}</span></li><li><span>Custody now</span><span>{listing.status === "available" ? "NFT remains with seller" : "Inspect current NFT owner"}</span></li><li><span>Window starts</span><span>When seller accepts a funded offer</span></li><li><span>Exact endpoint</span><span>End of block {integer(t.endBlock)}</span></li><li><span>Accept before</span><span>{deadlineDate(t.deadlineTimestamp)}</span></li><li><span>Original quantity</span><span>10,000 claims · minted once at activation</span></li></ul>
    <p className="fine">This is a signed advertisement. No claims have been issued by publishing it. The current owner and exact position are rechecked before funding.</p>
    {listing.reason && <p className="fine">{listing.reason}</p>}
    {paused && <p className="inline-warning">New funding is paused until settlement protection passes its service checks. Publishing or withdrawing a listing does not move funds.</p>}
    <div className="actions">
      {!owner && <button className="btn primary" onClick={fund} disabled={disabled || !snapshot.wallet.connected || snapshot.wallet.chainId !== snapshot.chainId || paused || expired || listing.status !== "available"}>Review exact funding</button>}
      {owner && listing.status !== "cancelled" && <button className="btn" disabled={disabled || snapshot.wallet.chainId !== snapshot.chainId} onClick={() => onReview({ title: "Withdraw seller listing", action: { type: "cancelListing", listingId: listing.listingId }, lines: [["Listing", listing.listingId], ["Position", "NFT " + t.tokenId]], warning: "This withdraws the advertisement only. Existing funded offers remain onchain; their buyers can cancel them to recover USDC. This does not move or recover an NFT.", button: "Sign listing withdrawal" })}>Withdraw listing</button>}
      <a className="btn ghost" href={positionRoute(t.tokenId)}>{owner ? "Review buyer offers" : "Inspect position"}</a>
      <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname + listingRoute(listing.listingId)); setCopied(true); } catch { onError("Copy the listing URL from your address bar."); } }}>{copied ? "Link copied" : "Copy listing link"}</button>
    </div>
    <p className="fine">Withdrawing a listing does not cancel any already funded offer or revoke an NFT approval.</p>
  </section>;
}

export function PendingListingDrafts({ snapshot, onReview }: { snapshot: Snapshot; onReview: (review: Review) => void }) {
  const [forgotten, setForgotten] = useState<string[]>([]);
  const drafts = snapshot.pendingListingDrafts?.filter(terms => !forgotten.includes(terms.nonce));
  if (!drafts?.length) return null;
  return <section className="note" aria-label="Unfinished listing publications"><h3>Unfinished listing publications</h3><p>These exact terms were saved in this browser. Resume the same listing instead of creating another one. A saved draft is not proof of publication or sale. Forgetting a browser draft does not withdraw a published listing.</p>{drafts.map(terms => <div className="actions" key={terms.nonce}><button className="btn" onClick={() => onReview({ title: "Resume listing publication", action: { type: "publishListing", terms }, lines: [["Position", "NFT " + terms.tokenId], ["Asking payment", money(terms.proceedsMicros, 6) + " USDC"], ["Share", sharePercent(terms.buyerQuantity, terms.originalSupply) + "%"], ["Endpoint", "End of block " + integer(terms.endBlock)], ["Acceptance deadline", deadlineDate(terms.deadlineTimestamp)]], warning: "Reuses the exact saved listing identity. An existing signature is reused; otherwise your wallet will be asked to sign. Publication does not transfer your NFT or start a sale.", button: "Resume exact listing" })}>Resume NFT {terms.tokenId} listing</button><button className="btn ghost" onClick={() => { clearPendingListing(listingId(terms)); setForgotten([...forgotten, terms.nonce]); }}>Forget browser draft</button></div>)}</section>;
}
