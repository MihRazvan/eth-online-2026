# Documentation

Start with the [project brief](../PROJECT_BRIEF.md), then choose a path:

| I want to… | Read |
| --- | --- |
| Understand the product and explain the demo | [Teammate brief](TEAMMATE_BRIEF.md) |
| Run the app or its tests | [Quickstart](QUICKSTART.md) |
| Follow the exact seller, buyer and holder actions | [End-to-end runbook](DEMO_TEST_RUNBOOK.md) |
| Understand contracts, proofs and trust boundaries | [Architecture](ARCHITECTURE.md) |
| Check what is ready for a public demonstration | [Judge readiness](JUDGE_READINESS.md) |
| Review the submission and integration evidence | [Submission](submission.md) |

## Product and design

- [Product context](../PRODUCT.md) and [economic contract](../feestrip-handoff/PRODUCT_CONTRACT.md): the latter is the authority for custody, allocation and claim rights.
- [Design direction](../DESIGN.md): the current usufruct identity and interface reference.
- [Human test plan](user-test-plan.md): task completion, whole-period entitlement comprehension and recovery exercises.
- [Research index](research/README.md): product, protocol and engineering research behind the implementation.

## Engineering and operations

- [Development reference](development.md): expanded commands, proof dependencies and local lifecycle setup.
- [Public frontend deployment](deployment-vercel.md): static build, safe manifest and separately hosted APIs.
- [Settlement and retention](../packages/settlement/README.md): witness acquisition, durable storage, recovery and failure modes.
- [Graph service evidence](evidence/graph-service.md): Subgraph/Substreams composition, provenance and operating limits.
- [Integration review](evidence/integration-review.md) and [static analysis](evidence/static-analysis.md): findings, corrections and review scope.
- [Status ledger](STATUS.md): dated implementation, deployment and verification history.

## Submission and provenance

- [Sponsor integration matrix](evidence/sponsors.md): code paths and scoped evidence.
- [AI assistance](AI_ASSISTANCE.md): agent work and human review responsibilities.
- [Prior work and attribution](../README.md#prior-work-and-attribution): design lineage and upstream code.

Evidence labels matter: deterministic fixtures demonstrate interface behavior; local-chain tests exercise real contracts on disposable Anvil; fork or historical-proof checks establish specific components; public deployment does not by itself establish a completed public sale, trade and redemption. Use the dated readiness and evidence documents for the latest acceptance state.
