# Executable quotes and maker recovery

This increment keeps a wallet's recognized FeeStrip Aqua strategies visible after they stop executing, and lets their maker cancel a reviewed strategy. It also supports actual maker bids and selling claims into those bids. It extends the existing receipt and ledger treatment; there is no new dashboard or synthetic order-book depth.

## Rights and transaction behavior

A strategy row identifies its direction, series and abbreviated hash before disclosure. The exact app, full hash, cash and claim token addresses, expiry, virtual output inventory, maker balance and Aqua allowance remain inspectable. Advertised lot and currently executable claims are separate figures. Multiple strategies can draw from the same wallet or allowance: capacities are never added into a liquidity total.

Rows retain simultaneous limitations: expired, depleted, allowance revoked, allowance limited, wallet balance limited, partially filled, series state changed, cancelled or unavailable. A partial fill does not necessarily make a strategy unexecutable. A cancelled strategy remains in history. Cancelling requires the connected maker, exact reviewed app/hash/tokens and active two-token Aqua inventory; expired or stale series guards do not prevent maker recovery. The review explains that docking does not move wallet tokens, revoke an ERC20 allowance, or withdraw claim reserves. A racing fill can confirm first, so post-confirmation state is refreshed.

Maker publication supports either selling claims for USDC or buying claims with USDC. The actual output token is approved to Aqua and the actual two-token strategy is shipped. A holder can sell only into a discovered executable bid. The review binds claim input, minimum USDC output, maker, strategy hash and timestamp. Native-USDC unpaid whole-period claim rights travel with the sold tokens; NFT and residual rights remain separate. No bid produces an explicit unavailable sell action, not promised proceeds.

Each review captures its wallet account. The adapter carries that immutable signer through refresh, approval, simulation and submission, and rejects a changed selected account or network. It checks the first provider account, not merely whether the previous signer remains among exposed accounts. An approval already confirmed before an account switch remains explicitly reported; no subsequent swap is sent from the replacement account.

## Canonical discovery and exact arithmetic

Discovery reads Aqua `Shipped` events for the configured router and deployment range at the snapshot block, validates the payload hash and maker, and accepts only the known FeeStrip program layout for that series and token pair. It parses the original frozen guard and timestamp, calls the deployed market's canonical `buildOrder` with the original quantities/direction/salt and a valid fresh deadline, restores only the frozen state/deadline fields, and compares the complete ABI-encoded order. This preserves expired or state-invalidated strategies without accepting arbitrary alternative hooks, traits, programs or token substitutions. Unknown programs are omitted, not labelled as reviewed FeeStrip strategies.

The parser follows the repository's pinned SwapVM instruction encoding: a true direction is `0x80`, not `0x01`. This was caught by an actual bid publication and then fixed and covered by regression. Configured deployment trust is still required: canonical comparison uses the configured deployed builder; this increment does not claim an independent audit of arbitrary market/router bytecode. Existing public Sepolia manager and USDC runtime checks remain in place.

Raw Aqua token counts distinguish docked state (`255`) from active two-token strategies (`2`). Active records use `safeBalances`, actual output-token wallet balances and actual allowances. Capacity is capped by the advertised static lot, virtual output, wallet output and allowance, then calculated using the contract's integer exact-input rounding. Claims remain 18-decimal base-unit strings and USDC remains 6-decimal base-unit strings. A brute-force boundary test compares the capacity formula with every possible exact input across small claim/cash ratios and output limits. Separate best ask and best bid selection compares rational prices by integer cross multiplication; it never combines several makers' balances.

RPC or unsupported-program discovery failures are not converted into fake executable quotes. There is no claim of exhaustive support for every Aqua app or strategy. These controls are limited to recognized FeeStrip strategies on the configured deployment.

## Verification and visual evidence

- TypeScript passes and the production local-mode Vite build succeeds.
- All 26 tests pass: the 20 existing cases plus six new quote tests, including canonical program checks, integer rounding, distinct shared-inventory strategies and five injected-wallet switch stages.
- The saved `apps/web/tests/quotes-chain.mjs` harness uses actual browser transactions against a dedicated Anvil node at `127.0.0.1:8550`, with the local app at 4186. It rejects any other RPC host/port or chain ID. It does not reset another node.
- Actual transactions accept the funded sale, publish an ask, fill 1,000 of 2,000 claims, cancel the remainder, publish a 1,000-claim / 8-USDC bid, and sell 250 claims for exactly 2 USDC. It then retains the allowance-revoked and expired bid and cancels it; retains a depleted ask, captures actual fees after maturity, and cancels the resulting stale strategy.
- Docking makes actual `safeBalances` reject the docked strategy. Both token counts become `255`. Wallet token balances are unchanged by docking. After capture, both the reserved USDC and actual escrow USDC stay exactly `299999999` base units through cancellation.
- The JSON evidence records real transaction hashes, not fixture hashes. This is isolated local-chain acceptance, not a public-chain or live-liquidity claim.

Retained rendered evidence:

- [Desktop executable bid](evidence/quotes-real-bid-desktop.png): clear direction and per-strategy figures; shared-inventory caveat directly precedes the row.
- [Claim-sale review](evidence/quotes-real-sale-review.png): exact 250-claim input and 2.000000-USDC minimum, maker/hash/expiry and transferred rights before confirmation.
- [Mobile invalidated strategies](evidence/quotes-real-mobile.png): 390px layout retains abbreviated identifiers, separate advertised/current capacities and cancellation controls. Full hashes are behind the disclosure; page width does not exceed the viewport.
- [Actual transaction evidence](quotes-chain-evidence.json).

These are cropped component/dialog captures from the explicitly labelled local application. The full application's persistent local-mode banner is outside some crops. The design follows the existing inspected Impeccable/React source guidance documented in the entitlement receipt work. It uses no new imagery, motion or skill installation. Independent economic/source review identified the signer-switch issue described above; the implementation and regression address it before integration.

## Reproduce on an isolated node

From a checkout with dependencies installed, in separate terminals:

```sh
anvil --port 8550 --silent
LOCAL_RPC_URL=http://127.0.0.1:8550 node scripts/chain/reset-and-seed.mjs --reset
VITE_DATA_MODE=local VITE_ENABLE_TEST_WALLET=true node node_modules/vite/bin/vite.js apps/web --host 127.0.0.1 --port 4186
node apps/web/tests/quotes-chain.mjs
```

The reset command intentionally resets only the dedicated 8550 node and writes ignored deployment data to that checkout. The harness requires that fresh seed. It uses unlocked local accounts only behind the existing explicit test-wallet flag; it contains no private keys. Normal fixture Playwright discovery includes `tests/quotes.spec.ts`. During parallel development an ignored scratch config directed that suite to isolated fixture port 4185 and separate output storage; shared 8545/8546/4175 services were never mutated.

Fixture mode supports clearly labelled owned quote publication/cancellation to exercise the controls. It does not invent an external executable bid or pretend a fixture transaction is a chain receipt. Public wallet signing and real market access remain separate acceptance work.
