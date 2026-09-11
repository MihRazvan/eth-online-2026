# Frontend design evidence

AI-assisted implementation by Codex, 11 September 2026. Economic authority remains `feestrip-handoff/PRODUCT_CONTRACT.md`.

Primary workflow: Impeccable 4.1.0 source `cb56ed6c19a07329a9fa0cd4e657bee040156593`, Apache-2.0. Inspected manifest scripts and source skill plus new-work, craft-floor and operate references. CLI downloads a platform binary and installer can write hooks; not installed. Source guidance is used directly; context launcher unavailable. The user explicitly delegates routine direction selection, superseding the skill's user-choice ceremony. No Impeccable source is copied into this product. Secondary React guidance: Vercel `vercel-react-best-practices`, source `063bee94c3f4df8453406c830b0a7df0f2860278`, MIT; render derived state directly, fetch independent resources concurrently, avoid broad barrel imports. Browser: pinned @playwright/cli 0.1.19 (ephemeral execution) and repository @playwright/test 1.63.0.

Public references inspected in real browser:

- Uniswap positions, https://app.uniswap.org/positions: attempted actual positions page, but the rendered page remained blank with provider errors. No Uniswap visual conclusions or position data are claimed from this failed load.
- Pendle markets, https://app.pendle.finance/trade/markets: term/maturity central to instrument comparison, table density and consistent numerical columns. Captured state is retained; network access limits apply.
- Morpho vaults, https://app.morpho.org/vaults: source/state information beside market controls; quiet boundaries. Browser errors prevent treating visible values as reliable financial data.
- Wise currency converter, https://wise.com/gb/currency-converter/: explicit amounts, currency units and transaction direction. Fidelity reference attempted but HTTP/2 failed, so it is not claimed as studied.

Assets are not copied from references. Captures are research evidence only. Product logos are text and authored geometric mark; font source licensing will be retained with self-hosted assets.

Three same-data market directions: 1 light ledger (broad comparison table + split-rights instrument); 2 dark workspace (persistent explanatory rail + compact instruments); 3 exchange sheet (editorial heading + severe rules and paired rights). These are compositions, not theme switches. Browser captures are in `evidence/concept-*.png`. Independent critique and selection are pending.

## Independent concept critique and selected direction

The lead independently inspected the three rendered screenshots and returned this critique verbatim:

> Independent rendered critique: choose concept1 ledger for visible comparable endpoint/price rows and readable spacing. Concept2 drops earning-window data and card padding harms density (reject). Concept3 serif hierarchy is credible but repeats table, split-right distinction less visible; concept1 strongest. Fix: hero too tall market begins y~500—reduce ~80px; show total original claim supply or q/Q beside ask so price interpretable, exact block endpoint alongside estimated dates; top-right rights panel should become sharper split receipt visual with frozen range band. Require fixtures badge remain prominent; footer 'Built on' currently implies integrations complete—use accurate integration states and Powered by SwapVM attribution. Implement direction1; save critique verbatim in docs.

Selected the light ledger and implemented the requested split receipt, exact block endpoints, original Q and per-claim fraction, shorter introduction, explicit fixture provenance and qualified integration footer. The footer preserves ScopeLift predecessor attribution. DM Sans and Manrope are self-hosted under their included SIL Open Font License files; Google Fonts served the source assets, no runtime font network request remains.

Mode: Operate. Palette uses neutral warm paper, olive ink, muted green range bands and lime action surfaces. These distinguish the escrowed original position from the transferable fee strip without implying returns. Standard native dialog owns protected transaction review and keyboard focus. Static geometry communicates the price band; no decorative animation is used. Reduced-motion media query suppresses transitions. Inputs parse integer base units (USDC 6 decimals, claims 18); display formatting never authorizes an executable amount.

## Independent implementation review

The lead inspected the running detail view and captured desktop/detail/mobile evidence separately, returning:

> Independent running-app critique at4174 detail: H1 'WETH fees, paid in USDC.' is financially wrong (implies WETH conversion). Must say 'USDC fees.\nFrom this position.' or similar native-leg wording. Also 'Activation baseline Block…' is activation block not actual fee-growth baseline; label 'Activation block', detailed baselineX128 if available. Desktop market hierarchy good; mobile scrollWidth<=390 passes. Root captured screenshots .scratch/browser-review-{desktop,detail,mobile}. Finish precise labels + keyboard test and commit so I can wire chain.

Both labels were corrected. Local/testnet mode hides all fixture activity bars and explicitly reports the missing Graph provider. Keyboard regression initially found Tab leaving the native dialog focus cycle; an explicit first/last control loop and Escape focus restoration fixed the defect without relaxing the assertion.

## Verified frontend checkpoint

- `node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json` — passed.
- `node_modules/.bin/vite build apps/web` — passed, 31 modules, JS 264.07 kB / 81.47 kB gzip; no external runtime font request.
- `node_modules/.bin/playwright test -c apps/web/playwright.config.ts` — 12 passed in 2.7 seconds (Chromium, deterministic fixture adapter). Covers market search/filter and empty state; fractional purchase exact review; approval without activation; funded acceptance and retained claims; late capture, same NFT return before allocation, then independent redemption; rejected signature; reverted transaction; wrong network recovery; unavailable/expired quote; insufficient funds; stale indexer; empty supported positions; focus loop/Escape; 390px overflow.
- Final captures: `market-desktop.png`, `detail-desktop.png`, `positions-desktop.png`, `market-mobile.png`, `detail-mobile-viewport.png`. Concepts remain as immutable earlier exploration, and are not evidence of current application state.

Limits: default app remains deterministic fixture software. Real browser wallet, onchain transactions, historical witness validation, Aqua token movement and live Graph composition remain integration-owner acceptance gates. The interface exposes the adapter boundary; it does not certify those gates. No human review or production safety claim is made.
