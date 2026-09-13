# Production layout verification

Observed 2026-09-13T14:43:57.281Z at [usufruct](https://usufruct-mu.vercel.app), following deployment `5c46819`. This is a read-only production browser check, not a transaction acceptance test.

## Scope and isolation

A fresh headless Chromium context injected the teammate's public address through an EIP-1193 provider that implements only account and chain identification. Every signing or mutation method is rejected. No private keys, deployment credentials, shared CDP session, data interception, or fixture adapter was used. An independent anonymous context checked the intro and light theme. No listing or transaction review was submitted, and no estimate was applied.

## Actual observations

Full Uniswap URLs of the form `https://app.uniswap.org/positions/v4/ethereum_sepolia/<id>` were pasted into Pin's lookup form. All three resolved to the correct application route:

| NFT / resolved route | Lookup to navigation | Observed estimated ask | Existing asking input |
| --- | --- | --- | --- |
| [39220](https://usufruct-mu.vercel.app/#pin/39220) | 1.992s | 0.000080 USDC | Unchanged: 1 USDC |
| [39221](https://usufruct-mu.vercel.app/#pin/39221) | 2.022s | 0.816023 USDC | Unchanged: 1 USDC |
| [39222](https://usufruct-mu.vercel.app/#pin/39222) | 2.365s | 0.696010 USDC | Unchanged: 1 USDC |

The actual recent-fee model was available for all three NFTs in this sample. Each panel disclosed that it projects the recent rate, includes donations, and that future fees can be zero. The asking input remained unchanged, and applying the estimate was a separate enabled action. These numbers are timestamped observations of a model, not forecasts, quotes, or guaranteed proceeds. The unavailable-history fallback was not encountered in this production sample; it has separate browser regression coverage.

The actual [series 1 claim page](https://usufruct-mu.vercel.app/#market/1) rendered its large artwork, block clock, selection/pay values, six terms and purchase action. All five supporting disclosures were initially closed. The receipt disclosure opened with the keyboard in an anonymous context. Allocation was verified at the observed read; inventory was changing during a separately controlled live session and must not be treated as fixed evidence here.

Desktop viewport: 1440×1000. Mobile viewport: 390×844. Pin, claim detail in dark and light themes, and the intro all had document scroll width of 390px. Screenshots were visually inspected; no horizontal overflow or clipping blocker was found. The first-visit intro appeared and its Skip action reached the landing page. No JavaScript page exceptions or signing-method requests were observed.

## Finding and bounded follow-up

At the observed claim snapshot, the untouched default selected 1,000 claims while the executable quote offered 990. This correctly disabled purchase and showed the inventory warning, but it made a valid quote appear unavailable until the visitor edited the amount or selected all executable claims. A separate bounded follow-up caps only the pristine default to exact executable capacity, keeps explicit user input through quote changes, and resets it on claim-route changes. Regression coverage includes a one-base-unit claim fraction. The screenshots below intentionally retain the actual pre-fix observation; they do not claim that this follow-up was already deployed.

## Public screenshots

- Pin: [desktop](evidence/2026-09-13-production-pin-desktop.png), [mobile](evidence/2026-09-13-production-pin-mobile.png).
- Claim, dark: [desktop](evidence/2026-09-13-production-claim-desktop.png), [mobile](evidence/2026-09-13-production-claim-mobile.png).
- Claim, light: [desktop](evidence/2026-09-13-production-claim-light-desktop.png), [mobile](evidence/2026-09-13-production-claim-light-mobile.png).
- [First-visit mobile intro](evidence/2026-09-13-production-intro-mobile.png).

Public addresses, balances, block numbers and token IDs are visible because they were rendered by the deployed application from actual chain reads. No browser storage, credentials, signatures, private journals or secret RPC URLs are included. The lead's separate live lifecycle evidence remains the authority for transaction outcomes.
