# FeeStrip lifecycle Subgraph

Indexes series terms, original NFT identity, range, supply and lifecycle. Generated bindings come from FeeStrip's actual ABI. Mapping reads contract state at the event block; failed reads stop indexing instead of inventing backing.

Run from repository root:

```
pnpm exec graph codegen packages/subgraph/subgraph.yaml --output-dir packages/subgraph/generated
pnpm exec graph build packages/subgraph/subgraph.yaml --output-dir packages/subgraph/build
```

The checked-in manifest uses the zero address deliberately and is **not a live deployment**. Before deploying, set a verified FeeStrip address, actual deployment block, chain/network and context chainId. Preserve historical data (`prune: never`) for common-block composition. Use the authenticated Studio project and the installed `graph deploy --help`; never commit deployment keys. Do not deploy the placeholder manifest.

Compose a pinned deployment's `_meta` block/hash with Substreams history using `packages/data/src/compose.mjs`. A successful WASM build does not prove event-handler execution or live indexing; those acceptance gates remain blocked until deployment and provider access exist. A single Subgraph is not the selected sponsor's full composition requirement.
