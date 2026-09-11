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

## Onchain browser integration checkpoint

Codex implemented `ChainAdapter`, onchain-mode bootstrapping and maker-quote UI. Reads bind one source block, canonical NFT metadata, fixed terms, original claim denominator and real balances. Quote discovery decodes public Aqua `Shipped` logs and reconstructs the full order through the deployed FeeStrip builder; only byte-identical current-state programs are accepted. Wallet balance, allowance and virtual allocation jointly cap displayed size. Purchase review carries an exact integer ratio, strategy hash, deadline, minimum claims and maximum USDC. No settlement amount comes from an API: `/witness-{id}.json` contains retained proof bytes submitted to the onchain verifier.

A serial dedicated-chain Playwright test reset/seeds its own local chain and performs browser-funded offer creation (101 USDC), owner approval, atomic acceptance (8,000/10,000 claims), Aqua publication (2,000 claims for 20 USDC), purchase (1,000 for 10 USDC), root-helper maturity and genuine endpoint witness retention, late capture, original NFT return while proof remains unresolved, contract settlement and independent redemption by all three holders. Capture invalidates the partially funded outstanding quote. Remaining USDC equals claim rounding dust plus the separately funded, unconsumed seed offer. No full public-chain FeeStrip deployment or production wallet signing UI is claimed.

Evidence: `FEESTRIP_REPO_ROOT=/Users/razvan/Repos/eth-rome-2026 node_modules/.bin/playwright test -c apps/web/playwright.chain.config.ts` — **1 passed in 36.4 seconds**, browser flow 33.6 seconds. Root `docs/evidence/browser-chain-lifecycle.json` records 12 genuine receipt hashes, 1,199,999,999 captured USDC base units, 799,999,999 allocated, 799,999,997 paid across claims, 2 reserved dust units and 100,000,000 units in the unconsumed original funded offer. Local helper token donations are actual transactions using faucet currencies, not organic public activity. Earlier manual browser captures in `evidence/local-*.png` are labeled local-chain evidence and belong to their specific earlier reset; current repeatable-suite receipt hashes live in the JSON and Playwright attachments.

Independent lead review found (1) native ETH metadata attempted ERC-20 calls at zero, and (2) internally consistent addresses alone did not establish canonical public deployments. Fixes use native ETH's 18 decimals/symbol directly and restrict public mode to Ethereum Sepolia with the independently recorded canonical PoolManager, PositionManager and USDC runtime hashes in `docs/evidence/sepolia-preflight.json`. The USDC proxy runtime pin does not freeze implementation upgrades. Additional validation binds verifier PoolManager/checkpoints and router Aqua. The current real local deployment passed these extra read checks. Two targeted non-network regressions cover native metadata and chain/address scope. **14 fixture/safety tests passed in 3.1 seconds**, TypeScript passed, local-mode production build passed (initial JS 84.30 kB gzip, lazy chain adapter 97.79 kB gzip).

The analysis panel calls the optional adapter `readAnalysis` boundary and shows verified source identity, common block/hash, coverage, occupancy, lag and gross/net break-even only when the service returns valid provenance. Missing services/sources remain unavailable. The lead owns the server and Vite proxy, and live Graph provider acceptance remains blocked until actual access is supplied. No synthetic bars are shown in onchain mode.

Final independent local render critique: “scenario panel shows 'After purchase, before gas $84' while quote cost is unavailable (implicitly subtracts 0) => hide/net display 'Unavailable' unless executable quote. Gross scenario payout can stay clearly hypothetical. Also raw fee-growth X128 baseline sits above activity heading as long technical number; move into existing Exact position & ownership terms disclosure, useful audit detail rather than main financial flow.” Both corrections applied; no-quote and expired-quote browser regressions assert unavailable net proceeds. Final TypeScript check and all 14 fixture/scope browser tests passed.
