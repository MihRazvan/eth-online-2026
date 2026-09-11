# Building FeeStrip with an IDE agent

## Research and handoff recommendation

**Prepared 11 September 2026. Target repository: [MihRazvan/eth-online-2026](https://github.com/MihRazvan/eth-online-2026).**

Give the IDE agent an explicit product contract, freedom over implementation, a small set of useful specialist capabilities, and acceptance gates that require independent evidence. The strongest handoff is neither a vague instruction to build an impressive app nor a fully prescribed architecture. It states which economic outcomes must survive every implementation choice, then makes the agent demonstrate that its choices work.

For FeeStrip, the critical distinction is between **product semantics** and **engineering hypotheses**. The sold asset, earning period, custody restrictions and buyer's right to payment define the product. A particular verifier, frontend framework, database, contract factory pattern or agent framework does not. The handoff therefore fixes the former and delegates the latter, with short architecture decisions and executable experiments.

The repository was public and empty when inspected through GitHub: no branches or root contents. This research did not implement or push FeeStrip. Existing experiments concern isolated canonical integrations, synthetic proofs and component models; they do not establish a complete working protocol. The first implementation steps must close that evidence gap.

## 1. What the prompt should determine

FeeStrip lets an LP sell a defined period of an existing Uniswap v4 position's native USDC fees for an upfront payment. The NFT is escrowed, its range and liquidity are fixed, and the LP retains the right to recover the same NFT. Buyers hold transferable claims to the sold period's income. A claim carries unpaid accrual even when it changes hands.

ScopeLift's public Fixed Fee Swap is close prior work. Fee/principal separation, fixed bands and recombination are not novel by themselves. Its reviewed architecture uses vault shares and yield/principal tokens; FeeStrip's intended distinction is preserving a specific existing NFT, transferring the whole unpaid period claim, enforcing an exact delayed settlement endpoint and offering a direct claim/USDC market. This is a comparison with inspected code, not proof that no similar combination exists anywhere.[^1]

| Fix in the handoff | Delegate to the IDE agent |
| --- | --- |
| Existing supported canonical v4 NFT; same NFT returns | Internal contract/module boundaries and deployment pattern |
| Native USDC fee leg; other fees and outside-window USDC stay with residual rights | Token standards and representation, if the selected rights are preserved |
| Fixed range/liquidity while the period is active | Frontend framework, styling, components and charts |
| Fixed original claim supply; unpaid accrual travels with each claim | API, database and caching architecture |
| Exact end-of-block N entitlement even with late capture | Verifier, witness provider and authenticated checkpoint implementation |
| Capture actual fees before NFT withdrawal; withdrawal can precede proof | Compatible chain/deployment selection, with evidence |
| Permissionless valid proof submission and independent redemption | Tool, skill and native-agent selection |
| Reserve conservation and no unilateral early seller exit | Code layout, CI and deployment process |

This boundary avoids two recurring failures: an agent simplifying the financial instrument to fit convenient libraries, and an over-detailed prompt forcing an untested implementation assumption. A proposal to loosen bands, replace proof with a server signature, or convert both fee legs into USDC is a product change. Choosing a different React framework is ordinary implementation work.

## 2. Orchestration that helps the build

Current Codex, Claude Code and Cursor expose native subagent mechanisms. Their configuration and isolation behavior differ. Codex's current documentation describes subagents as enabled by default but does not make a delegated task an isolated checkout. Claude Code documents worktree isolation for subagents; its separate Agent Teams feature remains experimental and disabled by default. Cursor documents its own subagents, worktrees, skills and hooks. The prompt should ask the agent to inspect its actual environment and use its supported mechanism, not paste one client's setup into another.[^2][^3][^4]

For this project, useful independent responsibilities include historical-proof feasibility, core accounting, Aqua execution, Graph data and frontend design. A separate reviewer should attack economic assumptions; another should open and critique the app. These are responsibilities, not a requirement to run six agents continuously. A few well-scoped workers can make progress while interfaces stabilize. Workers blocked on the same unsettled ABI create coordination work rather than throughput.

Each assignment needs an objective, base commit, owned files, interface dependencies and observable acceptance evidence. One lead owns shared configuration, lockfiles, integration and pushes. Concurrent writers need separate worktrees, but also separate ports, databases, fork processes and transaction nonce ownership. Git worktrees isolate working directories, not external services.[^5]

Anthropic's application-development research supports durable progress state, incremental implementation and an evaluator that independently uses the running application. Its March 2026 harness report also illustrates why more iterations or more detailed initial architecture are not automatically better. These are engineering experiments, not evidence that a particular agent arrangement will secure a DeFi protocol.[^6][^7]

Cursor's large-agent experiment and broader multi-agent research similarly make task structure a central consideration. Parallel decomposition can help some workloads while sequential dependencies and coordination costs limit others. There is no defensible universal “fleet multiplier” to apply to FeeStrip.[^8][^9]

**Recommended operating model:** one accountable integration lead, bounded workers when useful, independent evidence-based reviewers, and one durable task/status ledger. Do not build an agent platform, stack several planning frameworks, or require experimental Agent Teams merely to begin.

## 3. Skills and repository context

Agent Skills provide a portable instruction format with progressive disclosure: metadata is discovered first and detailed instructions are loaded when applicable. That supports a compact root instruction file pointing to deeper product and task references. Host-specific metadata does not itself grant access or permission.[^10]

Recent empirical work argues for restraint with repository context. The June 2026 revision of *Evaluating AGENTS.md* reports no general success improvement from context files in its evaluated settings, alongside higher inference costs; nonstandard project practices were more useful than broad repository summaries. A separate July study, limited to 17 tasks in three repositories, found no measurable correctness shift within its stated equivalence bounds. Neither result establishes that context is useless; both caution against treating a large instruction file as inherently beneficial.[^11][^12]

For FeeStrip, the root guidance should contain the few facts an engineer must not accidentally violate, actual commands and pointers to current state. Load proof details for proof work and design references for design work. Preserve the full research packet for traceability without injecting it into every agent turn.

OpenSpec, Spec Kit or an existing workflow such as Superpowers may help when they provide a coherent task/spec lifecycle. They are alternatives, not cumulative requirements. The handoff permits one if useful and requires the underlying prompts, decisions and acceptance evidence regardless. Current tool help must determine command spelling and client integration.[^13]

## 4. A frontend workflow with an actual quality gate

The main frontend problem is not missing component libraries. It is premature convergence: an agent selects a familiar dashboard layout, fills it with cards and charts, and treats successful rendering as completion. The remedy is to separate exploration, implementation and independent criticism.

Impeccable is a useful current candidate for that process. The inspected September 10 source identifies package version 4.1.0 and Node 22.18 or newer. It now exposes a consolidated `impeccable` skill with subcommands; older instructions describing many standalone skills are stale. Its actual skill marks `craft` deprecated despite remaining README references. Installation should follow the reviewed, compatible release rather than a remembered command.[^14]

Anthropic's frontend-design skill is an alternative or reference, not a second competing creative director. Its current guidance also warns against previously fashionable replacements becoming generic. This matters: prescribing cream backgrounds and editorial serifs to avoid purple gradients can simply exchange one recognizable AI default for another.[^15]

The handoff requires the agent to inspect real financial products, borrow specific interaction lessons, and produce two or three rendered versions of the same core FeeStrip screen. Using the same data makes their hierarchy and composition comparable. The critic then opens each, identifies concrete problems and helps select a direction. The agent makes that routine design decision autonomously.

FeeStrip's signature should come from the instrument: one NFT splitting into distinct economic rights, a fixed range, an earning window, an uncertain break-even and separate capture/proof/redemption states. These are more valuable than ornamental motion or an arbitrary “premium” palette. Accessible primitives are welcome; their default styling should not determine the whole visual identity.

Vercel's React and web-interface review skills can supply focused checks after a direction exists. The reviewed React skill's actual name is `vercel-react-best-practices`; the web guideline skill retrieves a separate mutable source, so its resolved revision matters. Framework-specific rules must fit the chosen app.[^16]

Use an existing capable browser executor if available. Alternatives include current agent-browser or Playwright CLI, with durable Playwright regressions. The inspected agent-browser source is 0.37.1 and requires Node 24 or newer; that is a real compatibility consideration, not a reason to add it to every project. Figma MCP is optional when a real design/collaboration workflow benefits from it.[^17][^18]

Visual acceptance requires screenshots, real interactions, keyboard/focus review, narrow-width inspection and specific critic findings. Stable screenshot tests detect unintended changes; they do not establish good taste. Automated accessibility checks cover only part of accessibility.[^19]

## 5. Verification must be capable of disagreeing with the implementation

FeeStrip's hardest risk is assigning exact historical income while safely releasing the original NFT. A beautifully tested formula can still use the wrong pool position, tick semantics, baseline or state root. The verification harness must have an independent oracle.

The first proof gate should obtain a genuine header/account/storage witness from the selected deployment, authenticate it through the intended Solidity trust path, and compare the result with native Uniswap collection from an identical N snapshot using the cleared activation baseline. Reusing the FeeStrip arithmetic helper in the expected result is not independent verification.

Then collect at M>N after additional fees accrue. Demonstrate that the same NFT can return before the proof arrives, while the sold-period reserve and later residual allocation remain payable. Tampered manager, pool, slot, header, witness and series bindings must fail. Record complete gas costs, not just a synthetic verifier call.

EIP-1186 describes state-root-bound account/storage proofs. EIP-2935 provides a finite historical block-hash window, not indefinite witness availability. Geth's current archive documentation distinguishes historical state access from retained trie nodes needed for proofs. An “archive RPC” label does not close this gate; the exact provider and requested historical window must work.[^20][^21]

Foundry v1.8.1 and Slither 0.11.6 were current reviewed releases. Foundry now documents persistent fuzz corpora, replay and native mutation testing. However, mutation is an MVP and surviving mutants do not fail the command. Structured results require inspection. Reserve invariants should be checked after every generated action; campaigns should record successful transitions and expected reverts so an all-revert run cannot look comprehensive.[^22][^23]

Give an independent verification worker the economic requirements and public interface before implementation. Its model should track original supply, actual token movements, liabilities and rights. Require it to catch deliberate faults such as releasing the NFT before capture, removing cutoff binding, crediting old income to the seller after a claim transfer, or blocking everyone after the first redemption.

Trail of Bits supplies relevant property-testing, spec-compliance, entry-point and differential-review skills. Select those applicable to the current task and preserve license notices if copied. Another fuzzer or bounded symbolic tool is justified by a specific remaining gap, not by a longer tooling list.[^24]

Browser automation also needs an independent acceptance boundary. Playwright offers planner, generator and healer agents, but its documented healer can skip a test it considers broken. For required FeeStrip tests, skipping, removing assertions or changing expected payouts merely to pass is prohibited. A legitimate expectation change needs independent evidence. Use deterministic wallet adapters for fast app tests plus a smaller real-wallet suite; the former does not prove extension compatibility.[^25]

## 6. Sponsor integrations must be real and purposeful

Uniswap and 1inch have distinct roles in the selected product. Uniswap is the underlying LP position and fee source. Aqua/SwapVM is the market for the new fee-claim asset. This creates a meaningful integration without pretending the claim market is the original LP pool.

The Aqua gate is a real claim/USDC trade through compatible official infrastructure, verified through balances and authorization behavior. The earlier source pass found a SwapVM runtime/SDK opcode mismatch, so simply combining latest packages is insufficient. Virtual maker allocations must not be treated as independently locked capital. Redemption reserves must never become trading inventory.[^26]

The Graph's role is buyer analysis: compose live Substreams pool history with a live FeeStrip Subgraph, expose freshness and produce a useful joined result. Event-derived income estimates must remain estimates. They cannot authorize payout or override contract truth. The relevant Graph query metadata includes deployment, block and indexing-error information, which helps make the UI honest about lag.[^27]

Official ecosystem skills can accelerate integration, but inspected source reveals setup traps: StreamingFast's skill repository uses `develop`, includes a current ClickHouse undo-buffer caveat, and distinguishes hosted administration from streaming access; the Graph skill README contains an old installation command. Uniswap's SDK skills address application integration and do not replace source-level accounting verification. These findings support selective pinned adoption, not blindly installing every sponsor skill.[^28]

The selected targets remain Uniswap's **Best Uniswap Stack Contribution**, 1inch's **Build an Aqua App**, and The Graph's **Best Use of Composable or Standardized Graph Products**. Their official requirements call for different evidence. A fork demonstration acceptable to Aqua does not substitute for the chosen Graph track's live composition. Recheck the pages before submission and retain precise code paths, deployment/query identifiers and transaction evidence.[^29]

## 7. Git, attribution and recovery

The user has authorized the implementation agent to commit and push task-related work using existing authentication. The useful interpretation of “small commits that look human” is cohesive checkpoints with descriptive messages, made when a real increment is complete. Preserve configured identity, real timestamps and actual AI attribution. Do not manufacture chronology or conceal generated work.

The lead should verify an increment, update the evidence/status ledger, inspect the diff, commit, reconcile remote changes and push under the repository's branch rules. Updating the ledger before the commit makes the checkpoint recoverable after interruption. Authentication failure should preserve local commits and identify the blocker, not halt unrelated useful work. CI should run the same checks as local development and protect credentials with minimal permissions and pinned dependencies.[^30]

The supplied hackathon rules require prompts/specifications/planning artifacts and meaningful team involvement. The repository should preserve actual human decisions and reviews as they occur, with a truthful AI-assistance record. No number or style of commits guarantees eligibility. The agent can prepare demo materials; the submitted video requires human narration under the supplied rules.

## Deliverable and evidence boundary

`FeeStrip_IDE_Prompt.md` is the standalone implementation instruction. The ZIP adds the product contract, focused workflow/design/tool references, templates and earlier evidence. Extract it into the repository and ask the IDE agent to follow `feestrip-handoff/START_HERE.md`.

The handoff deliberately does not select a final verifier, certify a network/provider combination, claim an audit, guarantee awards, or replace human engineering judgment with tool count. Those uncertainties become named experiments and review gates. Its purpose is to make the next agent autonomous on implementation while accountable for financial correctness, actual integrations and visual quality.

## Sources

[^1]: [ScopeLift: Liquidity Provider Fixed Fee Swap](https://scopelift.co/blog/liquidity-provider-fixed-fee-swap); [reviewed source, e29438ffd2805cb0c53f046d1e2a1a6137a20b85](https://github.com/ScopeLift/fixed-fee-swap/tree/e29438ffd2805cb0c53f046d1e2a1a6137a20b85).
[^2]: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents); [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md); [Codex skills](https://learn.chatgpt.com/docs/build-skills).
[^3]: [Claude Code subagents](https://code.claude.com/docs/en/sub-agents); [worktrees](https://code.claude.com/docs/en/worktrees); [Agent Teams](https://code.claude.com/docs/en/agent-teams).
[^4]: [Cursor subagents](https://cursor.com/docs/subagents); [worktrees](https://cursor.com/docs/configuration/worktrees); [skills](https://cursor.com/docs/skills); [hooks](https://cursor.com/docs/hooks).
[^5]: [Git worktree documentation](https://git-scm.com/docs/git-worktree).
[^6]: [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), 26 November 2025.
[^7]: [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), 24 March 2026.
[^8]: [Cursor: Scaling long-running autonomous coding](https://cursor.com/blog/scaling-agents), January 2026.
[^9]: [Kim et al.: Towards a Science of Scaling Agent Systems](https://arxiv.org/abs/2512.08296).
[^10]: [Agent Skills specification](https://agentskills.io/specification); [Anthropic skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
[^11]: [Gloaguen et al.: Evaluating AGENTS.md, revised version](https://arxiv.org/abs/2602.11988v2), 23 June 2026.
[^12]: [Khatri: Do Context Files Help Coding Agents?](https://arxiv.org/abs/2607.27250), 28 July 2026.
[^13]: [OpenSpec](https://github.com/Fission-AI/OpenSpec); [Spec Kit](https://github.com/github/spec-kit); [Superpowers](https://github.com/obra/superpowers). Tool capabilities, not comparative outcome benchmarks.
[^14]: [Impeccable package source](https://github.com/pbakaus/impeccable/blob/cb56ed6c19a07329a9fa0cd4e657bee040156593/package.json); [actual skill interface](https://github.com/pbakaus/impeccable/blob/cb56ed6c19a07329a9fa0cd4e657bee040156593/skill/SKILL.src.md).
[^15]: [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design/SKILL.md).
[^16]: [Vercel agent skills, reviewed revision](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278); [web-interface guidelines revision](https://github.com/vercel-labs/web-interface-guidelines/tree/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1).
[^17]: [agent-browser source](https://github.com/vercel-labs/agent-browser/tree/8c15ff9f71ae60c7e99e66afe1e2d4b9bf414fe2); [Playwright CLI](https://github.com/microsoft/playwright-cli).
[^18]: [Figma remote MCP setup](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/); [access and limits](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/).
[^19]: [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots); [accessibility testing](https://playwright.dev/docs/accessibility-testing).
[^20]: [EIP-1186: account and storage proofs](https://eips.ethereum.org/EIPS/eip-1186); [EIP-2935: historical block hashes](https://eips.ethereum.org/EIPS/eip-2935).
[^21]: [Geth archive-node documentation](https://geth.ethereum.org/docs/fundamentals/archive).
[^22]: [Foundry v1.8.1](https://github.com/foundry-rs/foundry/releases/tag/v1.8.1); [Slither 0.11.6](https://github.com/crytic/slither/releases/tag/0.11.6).
[^23]: Foundry book at 7004a8cb395b0e75fb774002dbdc1fac902ea9ee: [fuzz corpus](https://github.com/foundry-rs/book/blob/7004a8cb395b0e75fb774002dbdc1fac902ea9ee/src/pages/guides/fuzz-corpus.mdx), [invariants](https://github.com/foundry-rs/book/blob/7004a8cb395b0e75fb774002dbdc1fac902ea9ee/src/pages/guides/invariant-testing.mdx), [mutation testing](https://github.com/foundry-rs/book/blob/7004a8cb395b0e75fb774002dbdc1fac902ea9ee/src/pages/guides/mutation-testing.mdx).
[^24]: [Trail of Bits skills, reviewed revision](https://github.com/trailofbits/skills/tree/321ccfe628eca0d314b0ee4eaffcdd8a05639aaf); [Medusa](https://github.com/crytic/medusa); [Halmos](https://github.com/a16z/halmos).
[^25]: [Playwright test agents](https://playwright.dev/docs/test-agents); [Synpress development documentation](https://github.com/synpress/synpress/blob/dev/README.md).
[^26]: [Aqua](https://github.com/1inch/aqua); [reviewed SwapVM opcodes](https://github.com/1inch/swap-vm/blob/afd99c408b4ed610027f4426c6f98650acac9f5f/contracts/libs/OpcodeList.sol); [reviewed SDK instruction table](https://github.com/1inch/sdks/blob/cc4b8c7c646beed8e3dfb2e39597d27f337ea4a7/typescript/swap-vm/src/swap-vm/instructions/index.ts).
[^27]: [The Graph query API](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/); [Substreams provider access](https://thegraph.com/docs/en/substreams/providers/the-graph-market/).
[^28]: Reviewed ecosystem skills: [Uniswap](https://github.com/Uniswap/uniswap-ai/tree/5338d6edb6a5948d05701c4b295139a0b74efb92), [StreamingFast](https://github.com/streamingfast/substreams-skills/tree/8ccccf24f6eeba1f1b1f4db3c0d9d0c95a548293), [The Graph](https://github.com/graphprotocol/subgraphs-skills/tree/7b3499af5018d19c55daabf8272aaa265df928b3).
[^29]: ETHOnline 2026 official prizes: [Uniswap Foundation](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation), [1inch](https://ethglobal.com/events/ethonline2026/prizes/1inch), [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph).
[^30]: [Git push documentation](https://git-scm.com/docs/git-push); [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).
