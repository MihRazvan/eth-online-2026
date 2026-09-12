# First end-to-end user test

Use this plan to test whether an LP, a claim buyer and a maker can understand and complete usufruct's actual workflows. Start with the [teammate brief](TEAMMATE_BRIEF.md) and [exact frontend walkthrough](DEMO_TEST_RUNBOOK.md); this document adds the moderator's unaided comprehension questions. The economic reference is the [product contract](../feestrip-handoff/PRODUCT_CONTRACT.md); priorities come from the [product research](research/product-landscape.md). This is a test plan, not a claim that public deployment, wallet testing or live analytics already passed. Check [current status](STATUS.md) before recording a result.

## Preparation

The operator prepares the environment so participants spend their time using the product:

- A known application commit and URL, deployment addresses, chain ID, and a dedicated test chain/environment. Follow [development and reproduction instructions](development.md); do not reset a node another session is using.
- One eligible, nonempty, hookless canonical v4 NFT containing the chain's authentic USDC for public testing. The LP controls that NFT; relevant accounts hold enough test tokens and native gas currency for their assigned transactions. Local rehearsal uses the clearly labelled faucet assets instead.
- Three separate browser/wallet contexts for the LP, maker and secondary buyer. The initial funded-sale buyer can also supply maker inventory. In the local seed these map naturally to `seller`, `buyer` and `holder`; those are test account labels, not three mandatory product roles.
- A funded offer with recorded terms, a planned endpoint N, enough time to review the sale, and actual maker inventory for a small trade. Record any operator-prepared offer or inventory; it does not count as unaided participant task completion.
- Proof retention running before N, with configured proof access and the independent validator. The standalone retention worker is read-only; the separate [restricted keeper](../packages/keeper/README.md) signs the checkpoint. Follow the combined [operations runbook](deployment-operations.md), including remote backup and primary/fallback operator responsibility, before public activation.

The deployment signer, project RPC and replacement Sepolia deployment are available. NFT39216 was prepared, and participant NFTs39220–39222 were previously discovered; verify current ownership, eligibility and balances rather than using historical setup balances. The outstanding preparation is operated preservation, separate buyer/maker/holder wallet contexts with test assets, then a funded offer and an explicitly scheduled endpoint/checkpoint. Configuration paths or keystore aliases are sufficient handoff information. Private keys, recovery phrases and tokens stay out of session notes, recordings and chat.

Live Graph analysis additionally needs working Substreams access, a deployed Subgraph for this FeeStrip deployment, and the matching configured sink/API. Those are a separate gate; their absence must not be presented as a failed settlement or filled with fixture history.

## Session method

Start with one LP, one prospective buyer and one maker session of about 25–35 minutes each; these are exploratory observations, not statistical validation. Give participants the task objective and let them navigate. Ask them to think aloud. Before providing an explanation, record their interpretation and the screen they used. Mark every hint, operator intervention and prepared state. If a financial review is misunderstood, record the failure and explain it before proceeding; do not count the corrected answer as unaided comprehension.

The moderator retains the expected answers below. Participants should not see them before answering.

| Unaided prompt | What a correct explanation includes |
| --- | --- |
| “What exactly would you own after this purchase?” | A fraction of the specified period's unpaid native USDC fees; no NFT ownership, no other-currency conversion and no guaranteed income. |
| “Some fees accrued before you bought these claims. Who receives that income? What changes if you transfer the claims?” | Current claims carry their share of all unpaid income from the sold period, including before purchase. A transfer carries that entitlement with the claims; there is no separate former-holder dividend account. |
| “Another holder redeems first. What happens to your share?” | Original Q remains the denominator. Burning someone else's claims does not increase the user's fraction or prevent their independent redemption. Integer rounding can leave segregated dust. |
| “What can the LP change during the sale period?” | The NFT is escrowed; range/liquidity changes, collection and removal are unavailable during the term. Residual ownership does not confer unrestricted custody. |
| “What happens at the end block? When can each person receive their assets?” | Earning ends at the exact end-of-block N. Capture is at M>N. The original NFT can return after capture while proof/allocation remains pending. Maturity alone does not mean cash is redeemable. |
| “The historical proof is delayed. Where do the NFT and USDC go?” | Captured NFT return remains separate. Unresolved USDC stays reserved; neither seller nor operator can choose an allocation. Saved evidence and a saved canonical hash are separate facts. |
| “Can the seller end this early, or can you sell whenever you want?” | Early recombination requires the residual right and all original Q before N. A secondary exit requires an executable buyer quote; no bid means no guaranteed exit price. |

## Seller session: trade income for upfront cash

Give this task: “Review the funded proposal for your position. Decide whether its payment and restrictions are acceptable, then complete or decline the sale.”

Observe whether the LP locates the original NFT, frozen range, quantity Q, fraction sold, retained claims, minimum proceeds and N before signing. Have them explain the distinction between approval and sale acceptance. If they proceed, record the separate approval and acceptance results, actual cash received, NFT custody and issued claim balances. A declined wallet request must leave the app recoverable and the sale unactivated.

After activation, ask the LP to find what they still own and explain whether range adjustment or fee collection is possible. Later, after the operator advances the controlled scenario beyond N and fees are captured, ask: “Recover your original position while cash allocation is still pending.” Observe whether they can return the same NFT without confusing residual USDC with retained fee claims. The operator must deliberately keep allocation pending long enough to exercise this state.

Use a separate unaccepted offer to test the funding buyer's cancellation/refund recovery. An expired offer is not an automatic refund. Do not cancel an accepted sale as a substitute for this task.

## Buyer session: understand, purchase and redeem a claim

Give this task: “Choose a claim you can explain, buy a small amount within your budget, and find the record of what you now own.” Use a published maker ask with verifiable inventory. Ask the first three comprehension questions before purchase. Record quantity, original Q, price, minimum/maximum execution terms, approval spender and actual claim/USDC balance changes.

Include a purchase after controlled fees have already accrued in the sold period. Ask the buyer to find that whole-period entitlement in the receipt. Compare a small fractional claim quantity with a whole claim to catch unit confusion; displayed rounding must not silently change the submitted amount.

At maturity, ask the buyer to distinguish “earning finished,” “fees captured,” “NFT returned” and “cash redeemable.” Exercise a proof-delayed state and a stale/unavailable recovery service. Then make the valid retained witness available, complete permissionless allocation and ask the buyer to redeem without the seller's wallet or signature. Reload the app and verify the resulting balances and receipt. A second holder redeems separately, in a different order, to establish original-Q accounting beyond one successful payout.

## Maker session: offer executable liquidity and recover inventory

Give this task: “Use your available inventory to publish a small quote, verify what someone can actually trade, then cancel or replace it.” Test an ask backed by FeeClaim inventory and a bid backed by USDC. The trader in the other browser context should execute a small amount on each side so both quote directions produce real balance changes.

Observe whether the maker understands quantity, price, expiry, token approval, Aqua allocation and wallet inventory. Record advertised versus executable size. Create one controlled invalidity at a time: depleted inventory, revoked allowance, expired quote or cancellation. Ask the participant to identify the cause and recover; do not silently replace an unavailable quote with a last-traded price. Check that a cancelled quote is unusable, that replacement has the intended terms, and that overlapping allocations do not appear to create additional capital.

During one transaction review, switch the active wallet account or chain before submission. The action must require a refreshed review or fail safely; it must not execute from a different account than the one reviewed. Local unlocked contexts do not establish this injected-wallet behavior.

## Evidence and acceptance

Keep the three environment gates separate:

| Gate | Required evidence | What it does not establish |
| --- | --- | --- |
| Local unlocked rehearsal | Named commit/config; actual local receipts and balance deltas; native N collection comparison; late capture, NFT return before allocation, multi-holder redemption, quote recovery, reload and refusal/error observations. Use `pnpm test:chain` and `pnpm test:browser:chain` as regressions alongside human observation. | Public deployment, production wallet prompts, organic fee demand or public provider reliability. |
| Public injected-wallet lifecycle | Verified chain/deployment and authentic assets; actual wallet approvals/signatures; public receipt block numbers/hashes and explorers; controlled baseline, N witness, M>N capture, same-NFT return, allocation and independent payouts. Preserve proof bytes/digest and checkpoint evidence. Compare a native collection oracle at the same public N using the documented fork method, labelled as a fork oracle. | A fork result alone is not a public transaction; testnet use is not commercial demand or a security audit. |
| Live Graph analysis | Actual Substreams cursor/package identity and deployed Subgraph identity, joined at a common block/hash for the same chain/manager/pool/series; coverage/freshness visible in the buyer flow; explicit behavior during source outage or reorg. Follow [analysis setup](development.md#live-analysis-configuration). | Graph values never authenticate payouts. A built WASM/Subgraph or fixture chart is not live integration. |

For every financially relevant action, preserve transaction status, chain, block/hash, actor role, quantities in base units and human display units, and before/after balances or ownership. Record gas separately from token consideration. Link screenshots to the task and receipt; a success toast is not transfer evidence. Proof evidence must bind N, header hash, manager/code pin and exact slots; actual settlement remains the contract's decision. Reuse the [lifecycle evidence format](evidence/local-lifecycle.json) and [proof evidence limits](evidence/proof.md).

Treat these as blocking product findings: an incorrect explanation of purchased rights that the review screen fails to resolve; wrong-account submission; misleading redeemability or quote availability; unexplained loss/lock of funds; mismatched financial receipt; or a required task that cannot recover after rejection/reload. Record slow or confusing paths separately rather than hiding them inside a binary “passed.” Retest changed flows with fresh participants where possible.

Copy this observation row for each task:

| Session / role | Environment / commit | Task and prepared state | Expected financial outcome | Unaided actions and exact interpretation | Hints / errors / elapsed time | Receipt, balance and screenshot links | Outcome / severity / follow-up owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

Finish each session with three open questions: “What surprised you?”, “What would stop you using this with your own position or money?”, and “What information was missing when you made the decision?” The resulting evidence should decide the next product changes, not merely confirm that the demo can be completed.
