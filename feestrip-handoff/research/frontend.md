# FeeStrip frontend agent workflow

Research cutoff: 11 September 2026. This memo specifies a workflow for the IDE implementation agent. No packages were installed and no changes were made to the user's GitHub repository. Package versions below are read from pinned source manifests; the implementation agent must verify registry availability and integrity before installation.

## Decision

Use one primary design workflow, one browser executor, and a small set of relevant review skills. The best default is **Impeccable for product-aware design, the existing browser tool if adequate, and Playwright for repeatable integration and visual checks**. Add Vercel's React and web-interface review skills. Use Anthropic's frontend-design as a simpler fallback or a selectively read design reference; do not load two competing creative directors for every edit. Figma is optional when there is an actual collaborative design file or an available design workflow, not a prerequisite for making the app beautiful.

The quality improvement comes from constraints, evidence and critique: inspect real reference products, design FeeStrip's actual financial interactions, render alternatives, commit one coherent design system, exercise the full product, and review screenshots. Installing many skills does not establish quality.

## Verified tools and important corrections

| Tool | Precise finding | Use in this project |
|---|---|---|
| Impeccable | Repository `pbakaus/impeccable`, commit `cb56ed6c19a07329a9fa0cd4e657bee040156593`, dated September 10. Source npm manifest is `impeccable` 4.1.0 and requires Node >=22.18.0. | Primary design workflow. Read current installed skill and applicable references. |
| Anthropic frontend-design | `anthropics/skills`, commit `34040c9c568585f6929bedeaad110ad08f079624`, dated September 10; file `skills/frontend-design/SKILL.md`. | Lightweight alternative when Impeccable is unavailable or conflicts with incumbent tooling. |
| Vercel React practices | `vercel-labs/agent-skills`, commit `063bee94c3f4df8453406c830b0a7df0f2860278`, dated August 28. Directory is `skills/react-best-practices`; **frontmatter name is `vercel-react-best-practices`**. | React implementation and performance review; apply relevant rules to the chosen framework, not every Next-specific instruction to a Vite app. |
| Vercel web review | Same pinned repository; skill name `web-design-guidelines`. It fetches `vercel-labs/web-interface-guidelines/main/command.md` when reviewing. | Accessibility, forms, navigation and interaction review. Record the actual fetched guideline revision; pinning the wrapper alone does not freeze its rules. |
| agent-browser | `vercel-labs/agent-browser`, commit `8c15ff9f71ae60c7e99e66afe1e2d4b9bf414fe2`, dated September 10; source manifest 0.37.1 requires Node >=24. | Strong alternative browser executor if not already equipped; project-local dependency, separate sessions per worker. |
| Playwright CLI | Microsoft `playwright-cli`, npm package **`@playwright/cli`**, binary `playwright-cli`. | Prefer when a Playwright workflow already exists. CLI + skill can avoid loading another large MCP schema. |
| Playwright Test | Official screenshot assertions, traces and `@axe-core/playwright` integration. | Durable tests with controlled fixtures, reviewed visual baselines, and actual financial lifecycle assertions. |

Sources: [Impeccable manifest](https://github.com/pbakaus/impeccable/blob/cb56ed6c19a07329a9fa0cd4e657bee040156593/package.json), [Anthropic skill](https://github.com/anthropics/skills/blob/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design/SKILL.md), [Vercel React skill](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices/SKILL.md), [Vercel web skill](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines/SKILL.md), [agent-browser manifest](https://github.com/vercel-labs/agent-browser/blob/8c15ff9f71ae60c7e99e66afe1e2d4b9bf414fe2/package.json), [Playwright CLI](https://github.com/microsoft/playwright-cli).

Impeccable currently exposes **one `impeccable` skill with subcommands**. The useful sequence is `init`, `shape` or ordinary new-work, then targeted `critique`, `audit`, `harden` and `polish`. Its README still advertises `craft`, but the actual skill calls that a deprecated alias. The skill separates product truth in `PRODUCT.md` from visual decisions in `DESIGN.md`; FeeStrip's operating screens should use its **Operate** mode. Its CLI installer can add provider-native edit hooks and may require a harness reload or trust approval. Review those additions; never bypass trust or replace existing settings wholesale. [Pinned Impeccable source](https://github.com/pbakaus/impeccable/blob/cb56ed6c19a07329a9fa0cd4e657bee040156593/skill/SKILL.src.md), [installation](https://github.com/pbakaus/impeccable/blob/cb56ed6c19a07329a9fa0cd4e657bee040156593/README.md)

The current agent-browser skill file is a **discovery stub**, not its full manual. The installed executable serves compatible instructions with `agent-browser skills get core`; use `skills get dogfood` for exploratory QA when needed. Its current implementation uses Chrome/CDP rather than depending on Playwright. Browser tooling is development infrastructure, not an application dependency. [Pinned browser skill](https://github.com/vercel-labs/agent-browser/blob/8c15ff9f71ae60c7e99e66afe1e2d4b9bf414fe2/skills/agent-browser/SKILL.md)

## Installation guidance for the handoff

The lead agent should inspect the actual IDE, installed skills, Node and package manager before choosing syntax. Preserve existing configuration. Use the repo's package manager and pin tool versions; do not copy `@latest` from documentation into committed automation.

Documented Impeccable installer form is `npx impeccable install --providers=claude --scope=project` for Claude Code, with provider `codex` or `cursor` for those harnesses. Resolve and pin the package version before executing. The optional Claude marketplace route is `/plugin marketplace add pbakaus/impeccable`, followed by installing the plugin from the marketplace UI. Use one route, not both. [Installation source](https://github.com/pbakaus/impeccable/blob/cb56ed6c19a07329a9fa0cd4e657bee040156593/README.md)

Vercel's skills CLI supports a direct GitHub tree URL, selected skill names and an explicit agent target; project scope is default. The inspected CLI commit is `80feb48868972d518436f26711509bc78595b5cb`, dated September 8. A suitable pattern, after resolving the CLI version, is:

```sh
npx skills@<resolved-version> add https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices --skill vercel-react-best-practices -a claude-code -y
```

Use the same form for `skills/web-design-guidelines` / `web-design-guidelines`. If the selected installer does not resolve a commit tree URL correctly, fetch the verified commit into a temporary directory and install from its local path. Do not silently fall back to mutable main. Record source URL, commit, installer version, chosen skill and local destination in a small tool manifest. [Skills CLI source](https://github.com/vercel-labs/skills/blob/80feb48868972d518436f26711509bc78595b5cb/README.md)

Playwright CLI documents `npm install -g @playwright/cli@latest` and `playwright-cli install --skills`; adapt this to a verified pinned local development dependency instead of making a global, mutable install mandatory. An existing Playwright MCP integration is also acceptable. Do not install agent-browser, Playwright CLI and Playwright MCP together without a concrete capability gap. [CLI setup](https://github.com/microsoft/playwright-cli), [Microsoft's CLI/MCP comparison](https://github.com/microsoft/playwright-mcp)

## What to fix in the prompt, and what to leave to the agent

Fix the product facts and acceptance criteria. Leave palette, typography, layout details, headless component library and chart implementation open to an evidence-backed design decision. A framework choice does not establish visual identity. Customizing semantic primitives is compatible with an original interface; importing a complete dashboard template is not the same work.

Do not prescribe near-black plus neon green as the antidote to AI design. Anthropic's current skill explicitly identifies that treatment, cream/serif/clay and broadsheet-style hairline layouts as common defaults too. The lesson is to choose a visual language for this product and explain why, rather than enforcing a universal prohibited-font list. [Current Anthropic design guidance](https://github.com/anthropics/skills/blob/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design/SKILL.md)

Ask the design agent to complete these concrete outputs autonomously:

1. **Reference board:** inspect 3–5 real product surfaces, capture relevant screenshots, and explain one specific interaction or information-design lesson from each. Start with Uniswap's position workflow, Pendle's maturity markets and Morpho's market comparisons; include one reference outside crypto if useful. Cite exact URLs and capture dates. Borrow patterns, not logos or proprietary assets. This research verified the URLs, not their full rendered interaction flows; the implementation agent must inspect them in a browser. [Uniswap](https://app.uniswap.org/positions), [Pendle](https://app.pendle.finance/trade/markets), [Morpho](https://app.morpho.org/vaults)
2. **Two materially different directions for one representative screen:** use actual FeeStrip fields and transaction states, not lorem ipsum. Render both. Have an independent critic compare them against the product; the lead selects one and records the rationale without blocking on a preference questionnaire.
3. **One committed design system:** semantic colors, typography and numeric rules, density and spacing, borders/elevation, controls, focus and disabled states, chart grammar, motion and responsive behavior. Centralize tokens. Reuse the selected identity across Markets, Position and Claim detail.
4. **One signature interaction:** show the existing NFT becoming two rights—its return receipt and a claim on a defined fee window. After a trade, the same visualization explains which wallet owns what. Make the financial concept memorable without a decorative marketing hero.
5. **A real operating product:** no wallet wall before market exploration; immediate meaningful data; working filters and deep links; clear executable quote; cashflow outcomes; retained position identity; independent capture, proof, withdrawal and redemption status.

Design agents own visual and interaction proposals; they cannot change economic semantics to simplify a screen. The contract/domain agent owns money and eligibility facts. Shared state contracts must be agreed before parallel screen implementation, and a single design owner integrates components so independent agents do not ship three incompatible visual systems.

## FeeStrip-specific UI truth that cannot be delegated away

- Explain **range and liquidity are frozen during the sold term**. Show the out-of-range state and its implications where the user chooses a term. The NFT is in escrow, not freely manageable in the seller wallet.
- Distinguish the native USDC fee leg from all fees, and distinguish the LP principal return right from a fixed dollar principal guarantee.
- Show original NFT ID, pool and exact ending block. Approximate calendar expiry is secondary because the agreement settles at a block boundary.
- Use purchase cost, ownership fraction, whole-period entitlement and break-even fee income. Do not replace these with an unjustified single guaranteed APR.
- Preserve claim value after maturity when unpaid fees remain. Pendle-like visual decay to zero is wrong for this whole-period unpaid-income claim.
- Display indicative accrued fees, captured USDC and contract-finalized claim entitlement as different concepts. Graph data and pricing estimates do not finalize settlement.
- Do not equate an Aqua virtual allocation with a locked or independently available reserve. An expired or depleted quote is unavailable even if still indexed.
- Keep NFT withdrawal and buyer redemption independent. Returning the NFT does not imply every payout is already proven, and pending proof does not imply the seller can take the buyer reserve.
- Production monetary values use exact base units and explicit token decimals. Round only for presentation; never make transaction amounts with floating-point multiplication.
- Show chain/source freshness and failure states. A stale index should not silently overwrite newer wallet balances or confirmed contract state.

These requirements derive from the final FeeStrip build brief, not from the design skills.

## Verification and critique gates

**A visual screenshot is required but does not prove financial correctness.** Keep behavioral and visual evidence separate. For a meaningful stage, render a batched desktop/mobile review, collect defects, fix the defects together and confirm the changed surfaces. Additional rounds should resolve specific remaining defects; do not run an endless aesthetic scoring loop.

| Gate | Evidence the lead should retain |
|---|---|
| Product comprehension | A critic who was not the screen author can identify who pays, what is sold, what remains locked and when each party can exit from the rendered screen. |
| Layout and identity | Desktop and mobile screenshots of all three primary views and the transaction review modal; no clipping, accidental page overflow or inconsistent component systems. |
| Real transaction flow | Integration test and explorer/receipt evidence for activation, Aqua trade, capture, return of the same NFT and redemption from another wallet. Assert onchain balances/rights, not just a success toast. |
| Adverse wallet states | Disconnected, wrong chain, insufficient funds, insufficient gas, user rejection, approval required, expired quote, moved maker liquidity, transaction revert, pending/replaced transaction and RPC/indexer error. |
| Financial states | Live, out of range, matured awaiting capture, captured awaiting proof, NFT withdrawn with unresolved reserve, finalized, partly redeemed, fully redeemed and early recombination on a separate series. |
| Accessibility | Keyboard-only navigation and modal focus; accessible labels and charts; meaningful reduced motion; contrast; a scan with axe plus manual inspection of issues automated checks cannot establish. |
| Performance | Measure representative market and detail views with realistic data. Avoid render/request waterfalls and excessive chart updates; capture relevant browser console/network failures. |
| Reproducibility | A seeded local/fork test workflow and a separate live-provider smoke workflow. Stable visual baselines generated in the same browser/OS environment, using fixed data and time. |

Playwright's screenshot comparison requires stable rendering conditions; baseline generation is not design approval. Review the image before accepting the baseline. Its official accessibility guide explicitly says automation catches only part of accessibility. [Visual comparisons](https://playwright.dev/docs/test-snapshots), [accessibility testing](https://playwright.dev/docs/accessibility-testing)

Playwright also ships planner/generator/healer agents, configured through `npx playwright init-agents --loop=claude` (or `codex`, `vscode`, `opencode`). They are optional aids. The documented healer can produce a skipped test when it believes functionality is broken. **Override that outcome for required FeeStrip acceptance tests:** preserve the failure and fix the product or report the blocker; never skip, weaken assertions or accept new visual baselines solely to make CI green. [Playwright Test Agents](https://playwright.dev/docs/test-agents)

Each parallel browser worker needs an isolated browser session/profile, app port and test account where relevant. Sharing a persistent profile can conflict; using the user's real wallet session for automated tests is unnecessary. Use dedicated development/testnet wallets. [Playwright profile isolation](https://github.com/microsoft/playwright-mcp#user-profile)

## Figma decision

If the team supplies a Figma design or wants to jointly art-direct screens there, use the official remote MCP at `https://mcp.figma.com/mcp`, its relevant skills and actual design tokens/components. For Claude Code, Figma currently documents `claude plugin install figma@claude-plugins-official`; its manual alternative is `claude mcp add --transport http figma https://mcp.figma.com/mcp`. OAuth and file access are required. Available calls depend on the plan/seat, and supported clients are restricted to Figma's catalog. This is not a tool the IDE agent can assume is authenticated. [Official installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/), [access limits](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)

Code Connect is valuable after real components and a design system exist: mappings feed actual import and usage examples to generation. It does not independently create a good visual direction. Without an existing Figma collaboration need, keep coded prototypes and tokens as the initial source of truth; avoid an obligatory code-to-Figma-to-code cycle. [Code Connect integration](https://developers.figma.com/docs/figma-mcp-server/code-connect-integration/)

## Suggested compact instruction for the final IDE prompt

> Treat the frontend as a product design assignment. Read the supplied product facts, inspect existing work and tools, choose one design skill workflow, and establish a reference-led visual direction. Produce and render two distinct concepts for the core market/claim screen, select one using an independent critique, and record its design tokens and rationale. Build Markets, Position and Claim detail as complete operating surfaces. Make the separation of position ownership and fee ownership the signature interaction. Use the real protocol state machine, exact monetary units and live data freshness; show range lock, downside, awaiting-proof and wallet failure states. Reuse semantic components but author the composition and visual system. Verify in a browser at desktop and mobile sizes, retain before/after evidence for resolved defects, and run meaningful lifecycle and accessibility checks. Load only the skills each task needs. Use Figma when connected and useful; otherwise proceed with coded prototypes. Do not claim completion from a screenshot, mocked transaction, passing weakened test, or attractive landing page.
