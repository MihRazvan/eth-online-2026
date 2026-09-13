# Claim purchase layout — 13 September 2026

The claim page now follows the supplied `usufruct-ui.html` detail structure: large seeded artwork on the left; block progress, a keyboard-operable NFT selection surface, selection/pay readout, exact claim input, six terms and the purchase action on the right. Mobile stacks the artwork before the purchase controls. The extra exact amount input preserves 18-decimal purchases unavailable through a percentage slider.

Receipt, ownership/range details, fee history/scenarios, recovery evidence and maker execution metadata remain available in five native disclosures below the primary action. Capture, allocation and redemption controls remain immediately accessible when their actual state permits them. A stale or absent quote cannot show executable availability. Original Q, base-unit calculations, transaction review and signer checks remain unchanged.

The seller estimate callback is connected to the lead's bounded historical model, with the supplied reference's compact estimate-card styling. The three bars are explicitly illustrative assumptions, not observed quantiles. Applying an estimate remains an explicit action.

Manual position lookup pauses background refresh and bounds lookup plus snapshot loading to 20 seconds. A late result cannot change the route or replace the snapshot after timeout. Both delayed lookup and delayed snapshot regression cases pass.

## Validation

- TypeScript and the production build pass.
- All 99 hermetic browser/component regressions pass, including exact fractional purchases, original-Q receipts, separate NFT return/allocation, quote and wallet guards, neutral real-network scenarios, proof scope checks, app-update recovery, and the new layout/lookup cases.
- Desktop 1440×1000 and mobile 390×844 were rendered and inspected in light and dark modes; mobile scroll width remains 390px. The screenshots show explicitly labeled deterministic fixtures, not public acceptance.
- Independent lead critique of the rendered desktop: “Hierarchy much closer, approve direction.”

[Dark desktop](evidence/2026-09-13-claim-primary-dark-desktop.png) · [Dark mobile](evidence/2026-09-13-claim-primary-dark-mobile.png) · [Light desktop](evidence/2026-09-13-claim-primary-light-desktop.png) · [Light mobile](evidence/2026-09-13-claim-primary-light-mobile.png)

The lead owns integration, actual-chain browser reruns, public lifecycle evidence and deployment. This increment did not submit public transactions or deploy an application version. Actual-chain tests must open “Settlement & proof recovery” before downloading a witness, or “Claim rights & your receipt” before inspecting the receipt.
