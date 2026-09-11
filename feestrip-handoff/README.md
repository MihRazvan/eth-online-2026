# FeeStrip implementation handoff

Prepared 11 September 2026 for https://github.com/MihRazvan/eth-online-2026.

## Start

Keep this folder in the repository. Give the IDE agent `START_HERE.md` as its task. The prompt is self-contained; the other files supply focused context when needed. This packet is input documentation, not a prescribed application directory structure.

Read `START_HERE.md` and `PRODUCT_CONTRACT.md` first. Then load only what the current task needs:

| File | Purpose |
| --- | --- |
| `WORKFLOW.md` | Ownership, architecture decisions, checkpoints and acceptance evidence |
| `DESIGN.md` | Reference study, design exploration, critique and financial UI truth |
| `TOOLS.md` | Reviewed tool candidates, exact source snapshots and setup cautions |
| `research/FeeStrip_Agent_Workflow_Research.md` | Cited explanation of the recommended engineering approach |
| `research/frontend.md`, `orchestration.md`, `verification.md` | Detailed specialist research |
| `research/FeeStrip_Final_Build_Brief.md` | Earlier product, settlement and sponsor analysis |
| `research/FeeStrip_Competitor_Code_Review.md` | Earlier public-code review, including corrected ScopeLift comparison |
| `research/graph.md`, `scopelift.md` | Focused sponsor and predecessor source notes |
| `templates/` | Adaptable starting points; not configuration to install blindly |
| `evidence/` | Previous isolated experiments and an explicit explanation of their limits |

## Authority and provenance

Follow the user's current instructions and applicable repository rules. `START_HERE.md` and `PRODUCT_CONTRACT.md` define the selected product; the earlier research files describe evidence, hypotheses and alternatives. An old alternative is not permission to change the selected economics. If a conflict matters, identify it explicitly and propose a concrete resolution.

All packet instructions are AI-assisted handoff material. Preserve them, subsequent project prompts/specs, and truthful AI attribution in the submission repository. Do not record private system prompts, hidden reasoning, credentials or fabricated human reviews.

The GitHub repository was public and empty when inspected: no branches and no root contents. No application code was pushed or changed during this handoff. Reinspect before bootstrapping because teammates may have started work.

No complete FeeStrip lifecycle, genuine public-chain FeeStrip proof, live Aqua claim market or live joined Graph deployment has been verified. The included experiments are useful starting evidence, not completed acceptance gates. Any references to prior passing tests must retain their original component/fork/synthetic scope.

## Product in one sentence

Sell a defined period of your existing Uniswap position's USDC fees upfront, then recover the same NFT; buyers own transferable claims that settle without your later approval.

Uniswap produces the underlying income. Aqua/SwapVM trades the separate fee claim. The Graph supplies live context for evaluating its uncertain value. Target the three partners' specified tracks, not additional integrations added only for logos.
