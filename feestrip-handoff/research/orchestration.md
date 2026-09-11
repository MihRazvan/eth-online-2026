# FeeStrip IDE-agent orchestration and harness memo

Research checked 11 September 2026. This memo proposes a portable workflow for the IDE agent that will build FeeStrip. It is a design recommendation, not evidence that the application or its integrations already exist. No repository files, settings, plugins or installations were changed during this research.

## Decision

Use the installed agent's native orchestration, skills and browser tools, with one accountable lead, bounded independent workers, short versioned task contracts and evidence-based completion. Build the working product and its verification harness together. Do not build a separate agent platform, install a fleet manager by default, or assume that a large agent count is itself progress.

An effective handoff should specify the product promises, accounting invariants, acceptance evidence and authority boundaries. Let the IDE agent inspect the actual repository and select implementation details against these constraints, writing brief decisions before creating interfaces that other workers depend on.

## Twelve concrete instructions for the handoff

1. **Discover the execution environment before configuring it.** Read existing repository instructions, Git status/remotes, package manifests, installed agent version/help, tool and skill inventories, browser access and authenticated services. Record only relevant capabilities and gaps. Use current official documentation for version-dependent APIs. Never invent a slash command, model ID, tool, provider capability or integration result. Tooling discovered in this research is a candidate, not a claim that the IDE has it.

2. **Keep one lead responsible for the result.** The lead owns product decisions, shared interfaces, cross-package consistency, progress state and final integration. Start with two to four useful independent workers rather than a fixed fleet size. Candidate lanes: contract/accounting implementation; historical-proof feasibility; market/indexing integration; frontend design and browser verification. Some lanes must wait for agreed interfaces. Parallelize code reading, independent modules and competing failure hypotheses. Keep a tightly coupled state-machine change with one owner. Official Codex and Cursor docs explicitly recommend focused delegation and warn about conflicting concurrent edits. [1, 2]

3. **Write a task contract for every delegated task.** Include objective, exact inputs and base commit, must-preserve invariants, allowed files, forbidden shared files, expected interface, dependencies, acceptance evidence and return format. A worker must flag a required interface change before silently editing another worker's area. Return concise findings and paths rather than dumping logs into the lead's context. A specialist title is not a substitute for a precise assignment.

4. **Isolate writes and runtime state.** Use native isolated worktrees when the installed client supports them, otherwise ordinary Git worktrees; confirm the worker's actual working directory. Give each active writer its own branch, output directories and dev-server/Anvil ports. Keep deployment nonces and shared test-chain mutations serialized or use separate fork instances. Do not copy production secrets into every worker. Read-only reviewers can share a checkout if they do not mutate caches, snapshots or state unexpectedly. Worktrees isolate files, not remote services or wallet nonces. [3, 4, 5]

5. **Use skills selectively and verify their provenance.** Prefer already installed official or narrowly maintained skills whose procedures match the task. Inspect the source, license, scripts, hooks and network access before importing third-party skills. Pin the source revision and record it in a small tool manifest; avoid broad marketplace installs or executable downloads merely because they are popular. Agent Skills is a portable `SKILL.md` format, but discovery paths and optional frontmatter differ by client. Skills extend instructions and executable capability, so treat acquisition as installing software. [6, 7]

6. **Keep always-loaded instructions small.** Make `AGENTS.md` a short map of product invariants, commands, ownership rules and paths to deeper documents. Store architecture decisions, protocol specifications, test matrices, design references and evidence in separate files loaded only when relevant. Where needed, make `CLAUDE.md` or Cursor rules a thin client adapter to the canonical instructions instead of independently maintained copies. Do not paste the entire research report into every subagent prompt. Claude advises concise instruction files; Codex has a cumulative instruction-size cap. [8, 9]

7. **Make progress recoverable without the chat transcript.** Maintain one concise project status file and a feature/task ledger: pending, in progress, verified or blocked, with a concrete acceptance result and commit. Record architecture decisions separately. At session start or after context recovery, read those files and recent commits, verify the relevant working baseline, then continue the highest-value unblocked task. Before stopping or compacting, record exact unfinished work, running processes, known failures and the next command. Avoid multiple competing state files. Anthropic's long-running-agent experiments emphasize incremental work, durable progress and verification before marking a feature complete. [10]

8. **Make the harness executable.** Provide reproducible commands for setup, formatting, type checking, contract tests, focused integration tests, local chain reset/seed, application launch and browser smoke checks. Add deterministic fixtures, controlled block/time advancement and deliberate failure cases. Keep rich logs, traces, screenshots and gas outputs in evidence artifacts referenced by concise summaries. A passing build is not evidence that selling, trading or redeeming a claim works. CI should run the same relevant commands used locally.

9. **Use hooks for simple, bounded enforcement, with portable script fallbacks.** Good uses include formatting changed files, checking for leaked secrets, restoring a short status pointer after compaction and refusing to mark a task complete without required evidence. Keep hooks idempotent and fast; avoid full test suites on every edit or endless stop-hook loops. Verify the event schema for the installed client and preserve existing configuration. Do not use hooks to disable permission checks or automatically approve previously rejected operations. Claude and Cursor expose hooks, but they have different schemas and lifecycle events. [11, 12]

10. **Require independent evidence for important claims.** Have a fresh read-only reviewer examine settlement/accounting changes and the actual diff, trace adversarial paths and return concrete reproductions. Have a browser worker exercise the interface, capture screenshots and inspect errors. Resolve material findings and rerun the relevant checks. Keep review bounded by known risk: an independent model's agreement is not a substitute for a test, and a green test suite is not an audit. The lead checks source evidence rather than accepting a worker's confident summary.

11. **Commit real milestones and push them autonomously.** The user has authorized ongoing small commits and pushes to the project repository. Use the configured identity; commit coherent working changes with plain descriptive messages and the validation relevant to that change. Do not fabricate authorship, backdate commits, add artificial delays, split meaningless changes to mimic a human, or hide AI assistance. Preserve the actual history and the hackathon's AI attribution/spec requirements. In a shared checkout only the lead stages, commits and pushes; in isolated worktrees a worker may commit its own bounded work, while the lead integrates and pushes the shared delivery branch. Never force-push or rewrite published history merely to make it look tidy. Respect branch protections; if direct pushes are blocked, push the task branch and create the appropriate draft PR rather than changing protections. Check the remote and staged diff before each push.

12. **Measure useful progress and simplify when the harness gets in the way.** Completion means accepted product behavior, not agent count, tokens, commits or code volume. Add a specialist when it resolves an identifiable risk or unlocks an independent lane. Retire idle workers and remove stale instructions. The cited empirical work gives evidence against assuming that either more agents or more context instructions always improves quality; neither paper establishes a universal optimal fleet size. [13, 14]

## Native workflow adapters

These are availability observations from current official documentation, not a requirement to install or upgrade a client. Verify the IDE's actual version and settings before writing configuration. Prefer a natural-language request such as “delegate this independent review to a read-only subagent” over copied commands that may be obsolete.

| Client | Current documented capabilities | Adaptation for this project |
| --- | --- | --- |
| Claude Code | Project skills under `.claude/skills/`; custom subagents under `.claude/agents/`; tool restrictions, memory, hooks and `isolation: worktree` are documented. Ordinary subagents operate within a session. [15, 16] | Use focused native subagents first. Put reusable FeeStrip procedures in project-scoped skills only after a need appears. Give child agents explicit task context and relevant invariants; do not assume every built-in loads every instruction file. |
| Claude Code Agent Teams | Still explicitly **experimental and disabled by default**. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; current docs say teammates are interactive-only, with limitations including incomplete restoration of in-process teammates on resume. [17] | Optional when workers need sustained peer discussion; not a dependency of the handoff. Do not silently enable global experimental settings. If unavailable, use ordinary subagents or separate supported sessions with worktrees and durable task notes. |
| Codex | Current releases enable subagent workflows by default in CLI/IDE/app; custom local agent definitions use `.codex/agents/*.toml`. The official page says to request delegation directly or through applicable repository/skill instructions. [1] | The handoff should explicitly authorize bounded delegation. Discover actual available agent tooling, inherit the chosen model unless a reason is documented, and avoid obsolete experimental flags or hardcoded example model names. Do not assume subagent threads create isolated worktrees automatically. |
| Codex skills and review | Local project skills use `.agents/skills/`; the CLI documents resumable chats and read-only review of uncommitted work, commits or a base branch. [18, 19] | Use native review where present; otherwise spawn a read-only reviewer. Resume native state when possible, then reconcile it with the versioned progress ledger. Worktree support in the app is distinct from concurrent subagent support. |
| Cursor | Native subagents are documented for editor, CLI and cloud. Custom agents use `.cursor/agents/`; skills include `.agents/skills/` and `.cursor/skills/`; worktrees and hooks are documented. [2, 4, 12, 20] | Use the installed version's native subagents, browser and worktree workflow. Keep shared skill content canonical. Do not assume user-local skills are present in cloud agents: project skills travel with the repository, while personal-skill synchronization has separate rules. |
| Other or restricted IDE agent | Capability not established by these sources. | Keep the same task contracts, scripts and evidence requirements; execute sequentially where orchestration is absent. Report the actual missing capability and continue useful work. Never pretend parallel agents ran. |

No claim of formal GA status is made where a vendor merely documents a feature without that label. Claude Agent Teams are the explicit experimental exception identified above.

## Suggested task contract

```text
Task: Historical cutoff proof vertical slice
Base: <commit and worktree path>
Objective: Prove native USDC fee entitlement for one supported v4 position
           at the agreed block, using genuine historical chain state.
Read first: product invariants; settlement specification; dependency pins.
Write ownership: <explicit package/test paths>
Do not edit: frontend, shared ABI schema, root lockfile, other tasks' files.
Dependencies: agreed series identity and settlement interface.
Must preserve: fixed L/range; old fees excluded; post-cutoff fees reserved
               for the LP; no seller approval required for buyer redemption.
Evidence: reproducible command, chain/block references, actual proof fixture,
          negative proof cases, result paths, any missing provider capability.
Return: changed files, tested behavior, exact failures/limitations, proposed
        interface changes, commit hash if committing in your own worktree.
If blocked: record the specific cause; continue independent checks; do not
            substitute a trusted backend number or synthetic fixture and
            call the real-chain proof complete.
```

This is an illustrative task boundary, not a contract architecture prescription. The lead must reconcile the latest FeeStrip specification and repo state before dispatch.

## Architecture instructions: decide the right things in the handoff

**Freeze in the prompt:** economic promises, custody restrictions, who can claim, fixed-band behavior, what income is sold, cutoff correctness, segregation of buyer reserves, honesty about mocks/live data, sponsor deliverables and independent verification.

**Require the agent to decide with a short recorded rationale:** repository layout; frontend framework; backend responsibilities; supported deployment chain and actual addresses; exact compiler/library versions; proof provider and durable witness strategy; graph pipeline; API/ABI interfaces; transaction orchestration; testing tools; hosting strategy. A default can guide these choices, but it must be checked against the repository and actual integration compatibility.

**Require a concrete experiment before treating as settled:** genuine historical proofs, native NFT fee capture/return, real Aqua/SwapVM token movement, live Graph composition, and the complete independent redemption flow. These can run as separate bounded feasibility lanes, with one lead owning their shared interfaces.

**Keep the execution harness subordinate to delivery:** the initial output should be a small actionable plan plus working baseline and first vertical slice, not a large collection of agent personas and speculative infrastructure. Formal specification is valuable for fee accounting; a heavyweight spec framework should be adopted only if its concrete workflow helps the team.

## Evidence and caveats behind the recommendations

Anthropic's published long-running-agent work observed premature completion and forgotten progress; their approach used a setup phase, incremental features, durable notes, Git history and browser verification. This supports recoverable execution, but the example is a web application experiment rather than evidence that unattended DeFi custody is safe. [10]

Cursor's January 2026 engineering report describes experiments with hundreds of agents. Flat coordination and shared locks caused contention and avoidance of difficult tasks; separating planning and execution helped. The report also says removing coordination complexity sometimes helped. Its large-scale experiments are not a documented turnkey product capability and do not establish that FeeStrip needs hundreds of agents. [21]

The AGENTS.md study's June 2026 revision reports that context files did not generally improve task success and increased inference costs by over 20% on average in its evaluated settings. Repository overviews were unhelpful, while nonstandard coding practices remained a useful purpose for instructions. A separate July study of 17 tasks, three repositories and 288 runs found no measurable correctness change within its stated equivalence bounds. These are bounded experiments, not a universal verdict against context files; retain critical protocol invariants and evaluate whether extra material helps. [13, 22]

The multi-agent scaling paper tested 180 configurations on four non-identical task benchmarks and found substantial task-dependent tradeoffs. Sequential tasks degraded under tested multi-agent architectures, while some parallelizable tasks improved. Its reported multipliers are benchmark-specific; they should not be used to forecast FeeStrip speed or quality. [14]

## Sources

1. OpenAI, Subagents: https://learn.chatgpt.com/docs/agent-configuration/subagents
2. Cursor, Subagents: https://cursor.com/docs/subagents
3. Claude Code, Worktrees: https://code.claude.com/docs/en/worktrees
4. Cursor, Worktrees: https://cursor.com/docs/configuration/worktrees
5. OpenAI, Worktrees: https://learn.chatgpt.com/docs/environments/git-worktrees
6. Agent Skills open standard overview: https://agentskills.io/home
7. Anthropic, Agent Skills security considerations: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
8. Claude Code, Memory and instructions: https://code.claude.com/docs/en/memory
9. OpenAI, AGENTS.md: https://learn.chatgpt.com/docs/agent-configuration/agents-md
10. Anthropic, Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
11. Claude Code, Hooks guide: https://code.claude.com/docs/en/hooks-guide
12. Cursor, Hooks: https://cursor.com/docs/hooks
13. Gloaguen et al., Evaluating AGENTS.md, v2 revised 23 June 2026: https://arxiv.org/abs/2602.11988v2
14. Kim et al., Towards a Science of Scaling Agent Systems: https://arxiv.org/abs/2512.08296
15. Claude Code, Subagents: https://code.claude.com/docs/en/sub-agents
16. Claude Code, Skills: https://code.claude.com/docs/en/skills
17. Claude Code, Agent Teams: https://code.claude.com/docs/en/agent-teams
18. OpenAI, Build skills: https://learn.chatgpt.com/docs/build-skills
19. OpenAI, Codex CLI: https://learn.chatgpt.com/docs/codex/cli
20. Cursor, Skills: https://cursor.com/docs/skills
21. Cursor, Scaling long-running autonomous coding: https://cursor.com/blog/scaling-agents
22. Khatri, Do Context Files Help Coding Agents?, 28 July 2026: https://arxiv.org/abs/2607.27250

Local OpenAI inspection before web fallback found no callable local Codex CLI/manual installation answering these capabilities; only this hosted runtime's configuration/plugin bundle. Consequently, OpenAI feature claims above rely on the fetched official documentation, not assumptions from this environment. No local configuration or secret content was printed.
