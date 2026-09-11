# Capability and source evidence

2026-09-11. Local GitHub repo confirmed empty via `git ls-remote` and `gh repo view`; viewer ADMIN, rulesets empty. Existing authenticated Git credential works; first baseline pushed. No account-wide settings changed.

Available: Node 24.12.0; pnpm 12.3.4; Foundry/anvil/cast 1.5.1 b0a9dd9; Slither 0.11.5; Python3; Rust/Cargo; GitHub connector/CLI; native specialist agents. Browser: Playwright 1.63.0 with Chromium installed locally. Not installed: Substreams CLI or Graph CLI initially. No project RPC, Graph or signing environment variables detected (names only inspected). No secrets recorded.

Selected tooling: native worktrees and agents, Foundry, Slither, React/Vite, Playwright, SQLite. No additional planning framework. Frontend evaluates pinned Impeccable and React guidance in its design record.

Graph guidance inspected from `streamingfast/substreams-skills` 8ccccf24f6eeba1f1b1f4db3c0d9d0c95a548293 (substreams-dev, EVM guidance, Apache-2.0) and `graphprotocol/subgraphs-skills` 7b3499af5018d19c55daabf8272aaa265df928b3 (subgraph-dev). Guidance read only; not blindly installed or its hooks executed. The brief already selects chain, events and data role and delegates architecture choices, so its generic preflight questionnaire is unnecessary. Current CLI help, executable builds and official documentation govern commands.

Public registry search found maintained StreamingFast `uniswap-v4-substreams` v0.1.1 at https://spkg.io/v1/packages/uniswap-v4-substreams/v0.1.1. Live execution still requires provider authentication. Supplied previous v0.1.0 research does not establish v0.1.1 schema compatibility.
