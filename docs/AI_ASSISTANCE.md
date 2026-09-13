# Authorship and attribution

usufruct was developed with substantial OpenAI Codex assistance. AI assistance is part of the implementation provenance; generated work is not presented as unaided human authorship.

| Area | Contribution |
| --- | --- |
| Human product direction | Project name, visual references, interaction requirements, product critiques and prioritization |
| Human testing and access | Testnet/hosting/Graph access, wallet participation, reports of discovery and approval confusion, and an actual public purchase/redemption |
| AI-assisted engineering | Solidity protocol and proof contracts, Aqua/SwapVM integration, Graph composition, React interface, operations services, tests and documentation |
| AI-assisted verification | Separate protocol, infrastructure and frontend reviews; reproducible local/fork checks; constrained public transaction execution and receipt reconciliation |

The implementation process used an initial economic requirements brief, the supplied HTML design reference, explicit follow-up UX reports and requests for end-to-end validation. Codex used shell tools, Foundry, Playwright, Git, provider CLIs and official documentation. The [verification records](VERIFICATION.md) distinguish automated checks, controlled wallet actions and participant transactions. They do not assert an unaided usability study or professional audit.

## Upstream work

- [ScopeLift Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is related prior work. Fee/principal separation is not claimed as a new invention.
- Uniswap v4, Aqua, SwapVM and other Solidity dependencies retain their source pins and licenses in [contracts/dependencies.json](../contracts/dependencies.json), [contracts/market-dependencies.json](../contracts/market-dependencies.json) and the vendored sources.
- Powered by SwapVM — © Degensoft Ltd 2025. The [runtime description](decisions/002-aqua-runtime.md) identifies this application’s dispatcher extension and fresh source-pinned deployments.
- Polytope-derived proof code retains Apache-2.0 attribution. The imported Substreams package retains its [source record and license](../packages/substreams/upstream/SOURCE.json).
- Anton and Space Mono are self-hosted with their licenses in [the font directory](../apps/web/public/fonts). Interface direction came from a supplied visual/HTML reference; its placeholder financial values do not define the protocol.

The application uses the usufruct brand; deployed contract names and typed-signature domains retain FeeStrip. Original application code uses the [MIT license](../LICENSE). Private credentials and confidential tool context are excluded from the repository.
