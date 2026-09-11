# Design brief and review method

The objective is a recognizable financial product with clear ownership and settlement, useful before wallet connection. The user wants a serious onchain application with excellent craft. No brand palette, font family, framework or generic dashboard layout is predetermined.

## Design exploration

1. Inspect actual public interfaces, including [Uniswap positions](https://app.uniswap.org/positions), [Pendle markets](https://app.pendle.finance/trade/markets) and [Morpho vaults](https://app.morpho.org/vaults). Add a relevant non-crypto reference. These are candidate references, not interfaces already exhaustively inspected in this handoff. Capture the exact page/state and what it teaches about density, hierarchy or transaction clarity.
2. Use one core FeeStrip market or claim-detail screen, the same realistic data, and two or three genuinely different compositions. Render them. Changing only a theme is not exploration.
3. A separate critic compares the rendered concepts against product needs and selects specific improvements. Choose the direction autonomously. Preserve the stronger earlier version if a later iteration regresses.
4. Establish typography, spacing, color roles, borders, motion and financial-number conventions. Build representative market rows, a position/range view, an earning-window treatment and a transaction review before expanding pages.

Use a primary creative workflow, preferably current Impeccable when compatible; use standard accessible primitives and framework review guidance where useful. Skills do not supply originality automatically. Neither a universal ban on purple nor a mandatory editorial serif style is a design strategy.

## Product-specific interactions

The central explanation should be visible: one existing position produces two economic rights. Make the fixed band and earning window legible, then show ownership and state changes as actual transactions happen.

The buyer's main questions are: What income am I buying? What am I paying? What would I need to earn to break even? What happens if the position leaves its range? When and how can I redeem? Answer using a compact instrument view and meaningful history/scenarios. An elaborate chart must help a decision.

The LP's main questions are: What stays mine? What is temporarily restricted? Is the offer funded? When can I recover my NFT? Show exact terms before approval/signature. Approving NFT movement is not itself accepting arbitrary commercial terms.

## Truth and states

| Display | Required meaning |
| --- | --- |
| Historical activity | Identified pool, interval and source blocks; gaps or lag visible |
| Estimated income/scenarios | Labeled estimates with assumptions; never a guaranteed APR |
| Current accrued income | Distinguishable from finalized redeemable cash |
| Final allocation | Contract-authenticated amount for the exact sold window |
| Quote | Maker, price, executable size and expiry; no promise of resale liquidity |
| Principal/right | Same NFT return right; no dollar-value guarantee |
| Proof pending | Capture/NFT-return status separate from unresolved fee allocation |
| Live versus fixture | Explicitly labeled; no fabricated volume, hashes, revenue or API success |

Keep token math in integer base units; format deliberately. Never use floating-point arithmetic for transaction amounts. Long identifiers, precision, large values, empty history and negative scenarios must remain readable. Indexer lag cannot overwrite confirmed onchain truth in the interface.

Exercise no wallet, wrong network, no supported positions, rejected signature, insufficient balance, no quote, expired quote, pending/replaced/reverted transaction, out-of-range position, stale index, capture available, proof pending, NFT withdrawn, claim redeemable and already redeemed. Actions must match contract state, not only frontend timers.

## Review evidence

The critic opens the running app, uses real flows, captures desktop and narrow-width screenshots, and reports concrete findings with severity, reproduction and proposed correction. Judge:

- Product clarity within the first screen and roughly thirty seconds of interaction.
- Distinctive composition and interaction decisions tied to FeeStrip.
- Strong hierarchy, typography, spacing and purposeful density.
- Accurate financial language and coherent transaction review/status.
- Keyboard access, visible focus, readable contrast, reduced motion and usable charts.
- Real empty/error/pending states, responsive behavior and smooth transitions.

A numeric self-score is optional and not an acceptance oracle. Playwright snapshots detect regression, not taste; automated accessibility checks cover only part of accessibility. Include manual keyboard and content review. Test wallet adapters help deterministic browser tests; a separate real wallet test checks actual signing and chain-switch behavior.

## Demo story

Start with the live market and a specific position. Sell its fee period for USDC. Switch to the buyer's perspective: evaluate range risk and break-even, then trade the claim. Show capture after the endpoint, return the exact original NFT, and redeem independently. Explain any shortened forked period honestly; live Graph data must still be live for its selected track.

Build this as the ordinary product journey, not a separate scripted façade. Keep the submitted video within 2–4 minutes at 720p or higher with human narration, as required by the supplied rules.
