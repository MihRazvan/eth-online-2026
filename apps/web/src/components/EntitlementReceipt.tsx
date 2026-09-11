import { useId } from "react";
import { claimPayout } from "../../../../packages/core/src/economics.mjs";
import { formatClaims, integer, money, sharePercent } from "../amounts";
import type { DataMode, Market } from "../types";

export const FEE_CLAIM_RIGHTS =
  "Fee claims carry their share of all unpaid native-USDC income for the whole sold period, including income earned before this purchase. They do not include the NFT return right or other-currency fees.";

interface Props {
  market: Market;
  quantity: string | null;
  chainId: number;
  sourceBlock: string;
  feeStrip?: string;
  mode: DataMode;
  compact?: boolean;
}

export function receiptSnapshot({
  market,
  quantity,
  chainId,
  sourceBlock,
  feeStrip,
  mode,
}: Props) {
  return {
    schema: "feestrip-entitlement-receipt-v1",
    authority: "informational-only",
    mode,
    chainId,
    feeStrip:
      mode === "fixture" ? "fixture:no-deployed-contract" : (feeStrip ?? null),
    sourceBlock,
    seriesId: market.id,
    originalNFT: market.tokenId,
    originalSupplyBase18: market.originalSupply,
    heldQuantityBase18: quantity,
    earningStartBlock: market.startBlock,
    earningEndBlock: market.endBlock,
    allocationPhase: market.phase,
    allocatedUSDCBase6:
      market.phase === "allocated" ? market.allocatedMicros : null,
    nftReturned: market.nftReturned,
    rights: FEE_CLAIM_RIGHTS,
    notice:
      "A point-in-time record, not proof of ownership, settlement authority, or evidence that a historical witness is available. Current contract state governs rights and payout.",
  };
}

export function EntitlementReceipt(props: Props) {
  const { market: m, quantity, sourceBlock, mode, compact = false } = props;
  const headingId = useId();
  const held = quantity === null ? null : BigInt(quantity);
  const status =
    m.phase === "closed"
      ? "Closed by recombination"
      : m.phase === "allocated"
        ? held !== null && held > 0n
          ? "Ready to redeem"
          : "Allocation complete"
        : m.phase === "captured"
          ? "Proof allocation pending"
          : m.phase === "matured"
            ? "Period ended · capture pending"
            : "Earning period open";
  const payout =
    m.phase === "allocated" && held !== null
      ? claimPayout({
          allocation: BigInt(m.allocatedMicros),
          quantity: held,
          originalSupply: BigInt(m.originalSupply),
        })
      : null;
  const share =
    held === null ? null : sharePercent(held.toString(), m.originalSupply);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(receiptSnapshot(props), null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `feestrip-receipt-${m.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const contents = (
    <>
      <div className="receipt-identity">
        Series {m.id} <span>Original NFT #{m.tokenId}</span>
      </div>
      <div className="receipt-share">
        <div>
          <span>{held === null ? "Wallet quantity" : "Your claims · q"}</span>
          <strong>
            {held === null ? "Connect to view" : formatClaims(held)}
          </strong>
        </div>
        <div>
          <span>Original supply Q</span>
          <strong>{formatClaims(m.originalSupply)}</strong>
        </div>
      </div>
      <p className="receipt-share-note">
        {share === null ? (
          "Each claim represents 1 / Q of the period’s USDC allocation."
        ) : (
          <>
            <b>{share}%</b> of the original supply · your fraction is q / Q.
          </>
        )}{" "}
        Original Q stays fixed as claims are redeemed.
      </p>
      <div className="receipt-window">
        <span>
          After activation in block <b>{integer(m.startBlock)}</b>
        </span>
        <svg viewBox="0 0 28 12" aria-hidden="true">
          <path d="M1 6h25m-5-5 5 5-5 5" />
        </svg>
        <span>
          Through end of block <b>{integer(m.endBlock)}</b>
        </span>
      </div>
      <p className="receipt-period">
        Income accrued before you buy travels with the claims. The cutoff ends
        earning; it does not erase an unpaid claim.
      </p>
      <div className="receipt-rights">
        <div>
          <h3>With your fee claims</h3>
          <p>
            Your share of unpaid <b>native USDC</b> for this entire period.
            Redeem independently once allocation is complete.
          </p>
        </div>
        <div>
          <h3>A separate NFT right</h3>
          <p>
            The residual beneficiary recovers the original NFT after capture and
            keeps other-currency fees and out-of-period USDC. Retained fee
            claims own their in-period share separately.
          </p>
        </div>
      </div>
      <div className="receipt-settlement">
        <b>{status}</b>
        <p>
          {m.phase === "closed" ? (
            "All original claims and the residual right were consumed together. This closed series has no remaining fee claims."
          ) : m.phase === "allocated" ? (
            held === null ? (
              "Connect your wallet to see the amount for its current claim balance."
            ) : held === 0n ? (
              "This wallet has no unredeemed claims in this series."
            ) : (
              <>
                <strong>{money(payout!, 6)} USDC</strong> for redeeming your
                current balance, before transaction costs. Each redemption
                rounds down to the nearest USDC base unit.
              </>
            )
          ) : m.phase === "captured" ? (
            "Actual fees are captured. Your claim remains valid while historical proof allocation is unresolved; NFT return does not release the fee reserve."
          ) : m.phase === "matured" ? (
            "The earning window is complete. Capture and historical proof allocation are still needed before redemption; your unpaid claim remains valid."
          ) : (
            "The final USDC allocation is not known yet. Fees may be zero; neither income nor resale liquidity is guaranteed."
          )}
        </p>
      </div>
      <details className="receipt-record">
        <summary>Receipt source &amp; download</summary>
        <p>
          {mode === "fixture"
            ? "Deterministic fixture"
            : mode === "local"
              ? "Local chain · test tokens"
              : "Testnet"}{" "}
          · chain {props.chainId} · source block {integer(sourceBlock)}. Current
          contract state governs ownership and payout. This receipt does not
          establish historical witness availability.
        </p>
        <p className="receipt-contract">
          FeeStrip contract:{" "}
          {mode === "fixture"
            ? "Simulated fixture · no deployed contract"
            : (props.feeStrip ?? "Deployment identity unavailable")}
        </p>
        <button onClick={download}>Download receipt JSON</button>
        <small>Informational snapshot only. Not a settlement proof.</small>
      </details>
    </>
  );
  return compact ? (
    <details className="entitlement-receipt compact-receipt">
      <summary>
        <span>
          Fee-claim receipt{" "}
          <small>
            {share === null ? "q / Q" : `${share}% of original Q`} · {status}
          </small>
        </span>
        <span className="receipt-disclosure" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="receipt-body">{contents}</div>
    </details>
  ) : (
    <section className="entitlement-receipt" aria-labelledby={headingId}>
      <div className="receipt-header">
        <h2 id={headingId}>
          {held === null ? "Fee-claim rights" : "Your fee-claim receipt"}
        </h2>
        <span>USDC only</span>
      </div>
      <div className="receipt-body">{contents}</div>
    </section>
  );
}
