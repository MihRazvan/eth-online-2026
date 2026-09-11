# Tool selection and source snapshots

Research date: 11 September 2026. These are candidates, not an install-all manifest. Source was inspected; package registry availability and every combination were not independently installed and tested. Verify the actual host, version, license, scripts and discovery mechanism. Prefer project scope and a reproducible pin. Preserve existing settings and credentials.

## Native orchestration first

| Actual host | Relevant current mechanisms | Qualification |
| --- | --- | --- |
| Codex | [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), `.codex/agents/*.toml`; [skills](https://learn.chatgpt.com/docs/build-skills), `.agents/skills/`; `AGENTS.md` | Current docs describe subagents as enabled by default. Delegation does not itself create isolated worktrees. Verify installed client support. |
| Claude Code | [Subagents](https://code.claude.com/docs/en/sub-agents), `.claude/agents/`; [skills](https://code.claude.com/docs/en/skills), `.claude/skills/`; [worktrees](https://code.claude.com/docs/en/worktrees) | Subagent `isolation: worktree` is documented. [Agent Teams](https://code.claude.com/docs/en/agent-teams) remains experimental and disabled by default; it is optional, not a build prerequisite. |
| Cursor | [Subagents](https://cursor.com/docs/subagents), [worktrees](https://cursor.com/docs/configuration/worktrees), [skills](https://cursor.com/docs/skills), [hooks](https://cursor.com/docs/hooks) | Use installed version's supported editor/CLI features. Do not translate another client's configuration by guesswork. |

If native delegation is unavailable, execute the same bounded tasks and independent review passes sequentially. Do not install a fleet framework merely to reproduce native capabilities.

Use one planning workflow. [OpenSpec](https://github.com/Fission-AI/OpenSpec), [Spec Kit](https://github.com/github/spec-kit), or [Superpowers](https://github.com/obra/superpowers) can be useful if already adopted or if one closes a concrete coordination gap. None is required. OpenSpec currently documents Node >=20.19 and client-specific command spellings; Spec Kit changed its integration surface in its v1 release. Check installed help rather than pasting old slash commands. Keep project prompts/specs regardless of framework.

## Frontend and browser

| Candidate and reviewed source | Use | Version-sensitive finding |
| --- | --- | --- |
| [Impeccable](https://github.com/pbakaus/impeccable/tree/cb56ed6c19a07329a9fa0cd4e657bee040156593) | Primary design, critique and polish workflow | Source package 4.1.0, Node >=22.18. Current interface is one `impeccable` skill with subcommands. `craft` remains in README but is deprecated in the skill. Start with `init`, then `shape`/ordinary work, and targeted `critique`, `audit`, `harden`, `polish`. |
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/34040c9c568585f6929bedeaad110ad08f079624/skills/frontend-design/SKILL.md) | Fallback or reference creative guidance | Choose one primary creative workflow. Current advice also warns against previously fashionable alternatives becoming generic; do not impose a universal replacement palette. |
| [Vercel agent skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278) | Selected React performance and web-interface review | Actual skill name is `vercel-react-best-practices`, directory `skills/react-best-practices`. Apply framework-relevant rules. `web-design-guidelines` fetches another mutable source; record its resolved revision. |
| [Skills CLI](https://github.com/vercel-labs/skills/tree/80feb48868972d518436f26711509bc78595b5cb) | Optional selective project-scoped skill installation | Supports selecting skills and agent targets. Inspect/pin both installer and source. Do not install an entire marketplace by default. |
| [agent-browser](https://github.com/vercel-labs/agent-browser/tree/8c15ff9f71ae60c7e99e66afe1e2d4b9bf414fe2) | Interactive inspection if existing browser tooling is inadequate | Source package 0.37.1, Node >=24. Current skill is a discovery stub; `agent-browser skills get core` supplies the manual. Current implementation uses Chrome/CDP; do not assume Playwright internals. |
| [Playwright CLI](https://github.com/microsoft/playwright-cli) / [test agents](https://playwright.dev/docs/test-agents) | Browser operation and durable E2E regression tests | CLI package is `@playwright/cli`, binary `playwright-cli`. Test-agent definitions are generated for the actual client. Healer behavior may skip broken tests; required FeeStrip acceptance tests may not be skipped to pass. |
| [Synpress](https://github.com/synpress/synpress/blob/dev/README.md) | Optional small real-wallet suite | GitHub release metadata and current development documentation describe different generations. Validate published package, Playwright and wallet versions together. |
| [Figma MCP](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) | Optional when a real Figma design/collaboration workflow exists | Requires suitable access/authentication. Do not make a code → Figma → code round trip a prerequisite for design quality. |

Impeccable's documented installer shape is `npx impeccable install --providers=claude --scope=project`, with corresponding supported provider names for other clients. Resolve and pin a suitable package first, inspect effects, and use the installed version's help. This is a source reference, not an instruction to run an unpinned command. Its `PRODUCT.md`/`DESIGN.md` context should summarize the selected economics and visual direction without overwriting this packet's product contract.

The web-interface guideline source was inspected at [e3d624baaf29dc1fc645aff3e38f03e564d2d6b1](https://github.com/vercel-labs/web-interface-guidelines/tree/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1). Record updates if a skill later fetches another revision.

## Sponsor-specific skills

| Source snapshot | Selective candidates | Important boundary |
| --- | --- | --- |
| [Uniswap/uniswap-ai](https://github.com/Uniswap/uniswap-ai/tree/5338d6edb6a5948d05701c4b295139a0b74efb92) | `v4-sdk-integration`, `viem-integration` | Located under `packages/plugins/uniswap-trading/skills/` and `packages/plugins/uniswap-viem/skills/`. SDK/app guidance is not authoritative proof of contract semantics. It does not require FeeStrip to add a hook. |
| [StreamingFast/substreams-skills](https://github.com/streamingfast/substreams-skills/tree/8ccccf24f6eeba1f1b1f4db3c0d9d0c95a548293) | `substreams-dev`, `substreams-ethereum`, relevant SQL/sink/testing skills | Default branch is `develop`. The inspected update documents ClickHouse DatabaseChanges needing a nonzero undo buffer while the hosted runner does not pass the flag. Use a verified sink path; do not assume reorg recovery works. |
| [graphprotocol/subgraphs-skills](https://github.com/graphprotocol/subgraphs-skills/tree/7b3499af5018d19c55daabf8272aaa265df928b3) | `subgraph-dev`, `subgraph-optimization`, `subgraph-testing` | README contains an older repository/plugin-install command. Use inspected pinned files and the current host's supported installation mechanism. |

Skill metadata such as `allowed-tools` or a requested model is host-specific guidance, not an authorization grant. Install only relevant skills and keep their license notices if copied. Use canonical deployed contracts, ABI and integration experiments to resolve overbroad or stale instructions.

## Verification

| Tool | Reviewed release or source | Role |
| --- | --- | --- |
| [Foundry](https://github.com/foundry-rs/foundry/releases/tag/v1.8.1) | v1.8.1, 28 August 2026 | Primary contract/fork/stateful harness, corpus replay and targeted mutation |
| [Slither](https://github.com/crytic/slither/releases/tag/0.11.6) | 0.11.6, 28 July 2026 | Static analysis with triaged findings |
| [Trail of Bits skills](https://github.com/trailofbits/skills/tree/321ccfe628eca0d314b0ee4eaffcdd8a05639aaf) | 9 September snapshot | Selected `property-based-testing`, `spec-to-code-compliance`, `entry-point-analyzer`, `differential-review`; CC-BY-SA applies when copied |
| [Echidna](https://github.com/crytic/echidna/releases/tag/v2.3.3) / [Medusa](https://github.com/crytic/medusa/releases/tag/v1.5.1) | v2.3.3 / v1.5.1 | Optional additional sequence exploration when evidence justifies another engine |
| [Halmos](https://github.com/a16z/halmos/releases/tag/v0.3.3) | v0.3.3 | Optional bounded arithmetic/authorization properties, not a whole-system proof |

Foundry guide snapshot: [7004a8cb395b0e75fb774002dbdc1fac902ea9ee](https://github.com/foundry-rs/book/tree/7004a8cb395b0e75fb774002dbdc1fac902ea9ee). Keep invariant checks after each action for reserve safety. Preserve failure and coverage corpora. `forge fuzz replay --corpus-dir ...` selects corpus replay; the omission has different behavior. `forge test --mutate` is an MVP whose surviving mutants do not make the process fail. Inspect structured results and triage survivors. Mutation needs a compatible pure-contract profile; it rejects FFI and certain unsafe external-access configurations.

For proofs, read [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186), [EIP-2935](https://eips.ethereum.org/EIPS/eip-2935), and [Geth archive storage](https://geth.ethereum.org/docs/fundamentals/archive). An archive marketing label does not establish availability of historical trie proofs. Actually test the needed endpoint/window and retain public witnesses and authenticated checkpoints. A finite block-hash history is not permanent proof availability.

Use [GitHub Actions secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use): pinned action revisions, minimal permissions, no deployment credentials in untrusted test execution. CI is evidence of executed checks, not an audit label.
