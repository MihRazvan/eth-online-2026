# Persistent fee-claim entitlement receipt

Implemented by OpenAI Codex from base `743cc48`. The component lives in `apps/web/src/components/EntitlementReceipt.tsx`; full detail and compact holdings variants share the same rendering and purchase-review rights language. Existing adapters and interfaces are unchanged.

The receipt identifies the original NFT and series, owned claims q, immutable original supply Q, exact activation/end blocks, and the entire unpaid native-USDC period. It distinguishes the residual beneficiary’s NFT/out-of-period/other-currency rights from retained fee claims. Maturity ends earning without erasing unpaid claims. Capture, unresolved proof allocation, allocated redemption, and recombination have different language. Disconnected views do not present seeded fixture holdings as the user’s ownership.

Allocated-balance arithmetic imports the existing core `claimPayout` function and stays in `BigInt`; the six-decimal USDC display is the floor for redeeming the current full balance before transaction costs. The interface never substitutes current outstanding supply for original Q. A zero wallet balance says no unredeemed claims, without inferring whether they were sold or redeemed.

The optional download records chain ID, source block, original NFT, series, original Q, held quantity, exact block window, phase, and mode as an informational JSON snapshot. It explicitly does not prove ownership, authorize settlement, or establish witness availability. Quantities retain exact base-unit strings. The available interface does not include escrow/claim contract addresses; the export is therefore not a unique cross-deployment instrument identifier. Current contract state governs all rights.

## Design and rendered verification

Continued the existing light ledger direction using the previously inspected Impeccable source `cb56ed6c19a07329a9fa0cd4e657bee040156593`, applicable React guidance, and the pinned craft-floor reference. No skill installer, engine binary, or hooks were run. Receipt geometry reinforces the split between the holder’s fee fraction and the separate NFT right. No new assets or decorative motion were needed.

The first browser pass found global `header` rules adding excess height to the receipt. Replaced that nested header with a scoped receipt heading container. Also shortened the quantity label so its `q` does not dangle on narrow screens. Full detail is persistent; holdings expose a compact keyboard-operable disclosure with share and allocation status visible before expansion. Source metadata and download remain a secondary disclosure.

Captured the actual fixture app on dedicated port 4184; no shared chain or public wallet was touched:

- [Desktop detail](evidence/entitlement-detail-desktop.png): receipt sits beside the executable purchase; original quantity and original Q remain visually distinct.
- [Mobile active receipt](evidence/entitlement-active-mobile.png): exact block bounds, full-period rights and separate NFT rights fit at 390px.
- [Mobile holding disclosure](evidence/entitlement-holding-mobile.png): same content expands below the existing claim action.
- [Proof pending after NFT return](evidence/entitlement-proof-pending-mobile.png): unpaid claim remains valid and reserve stays separate.
- [Allocated receipt](evidence/entitlement-allocated-mobile.png): exact `$33.600000 USDC` for 400 of original 10,000 claims, before transaction costs.

The full-page desktop and cropped mobile captures are design evidence with deterministic fixtures. The cropped images omit the surrounding app’s fixture banner; they must not be presented as live chain evidence. At the checked mobile state, document scroll width and viewport were both 390px. Keyboard Enter opens the holdings and source disclosures. Independent lead critique is pending at this checkpoint.

## Verification

- TypeScript: `node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json` passed.
- Fixture production build: `node_modules/.bin/vite build apps/web` passed; initial JavaScript 86.06 kB gzip in this worktree.
- Browser: all 20 tests passed on isolated 4184 (16 existing, four new entitlement tests). A scratch Playwright config pointed to the existing tests directory with a separate ignored output directory. Normal repository Playwright discovery includes the new `apps/web/tests/entitlement.spec.ts` file automatically.
- New checks cover disconnected ownership, shared purchase language, maturity/capture/NFT-return/proof/redemption states, immutable Q, keyboard disclosures, exact downloaded metadata and large/base-unit integer preservation.

No public wallet signing, real-chain receipt read, or live historical witness availability is claimed by this frontend increment. The lead owns integrated real-chain verification and any later identity-field extension.
