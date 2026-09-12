# FeeStrip lifecycle Subgraph

Indexes series terms, original NFT identity, range, supply and lifecycle. Generated bindings come from FeeStrip's actual ABI. Mapping reads contract state at the event block; failed reads stop indexing instead of inventing backing.

Run from repository root:

```
pnpm exec graph codegen packages/subgraph/subgraph.yaml --output-dir packages/subgraph/generated
pnpm exec graph build packages/subgraph/subgraph.yaml --output-dir packages/subgraph/build
```

The generic `subgraph.yaml` uses the zero address deliberately for build verification. **Do not deploy that template.** The generated `subgraph.sepolia.yaml` targets the actual public FeeStrip contract and preserves historical data (`prune: never`) for common-block composition.

## Live Sepolia deployment

Studio project [usufruct](https://thegraph.com/studio/subgraph/usufruct), version **v0.1.0**, is deployed. Public configuration and exact deployment CID are in [subgraph-sepolia.json](../../deployments/subgraph-sepolia.json).

Query endpoint: https://api.studio.thegraph.com/query/1760193/usufruct/v0.1.0

Deploy from the repository root with `GRAPH_SUBGRAPH_SLUG=usufruct` and `GRAPH_DEPLOY_KEY` saved in ignored root `.env`. Use a new version label for a new deployment:

```sh
node scripts/graph/prepare-sepolia.mjs
pnpm exec graph codegen packages/subgraph/subgraph.sepolia.yaml --output-dir packages/subgraph/generated
pnpm exec graph build packages/subgraph/subgraph.sepolia.yaml --output-dir packages/subgraph/build
node scripts/graph/deploy-studio.mjs v0.1.1
```

Preparation checks the public RPC chain and deployed contract bindings before generating the manifest from `deployments/sepolia.json`. The deployment helper passes only the Studio credential to the CLI, redacts it from output, and leaves global Graph authentication untouched. Record the resulting version/CID/query URL in the public deployment configuration before verification. Deploying to Studio does not publish on the decentralized Graph Network.

```sh
node scripts/graph/verify-studio.mjs
```

Verification reads no secrets: it checks deployment identity and indexer health, queries entities at a fixed block hash, and compares that block with Sepolia RPC. Number-selected `_meta` returned a null hash in the live test; retain hash selection for consistent source attribution. The Studio query endpoint accepted unauthenticated requests during verification.

At the recorded check, `nextSeriesId=1` and the entity lists were empty, as expected before a public sale. Live query/indexer progress is verified; actual sale-event mapping and the live Substreams join remain pending. See [retained evidence](../../docs/evidence/graph.md). Analytics never authorize settlement, and this single Subgraph does not complete the selected Graph bounty.
