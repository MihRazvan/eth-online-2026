# 003 — Retain authenticated witnesses independently of settlement

Accepted2026-09-11. Implements the first durability item in [the product research backlog](../research/README.md).

FeeStrip depends on exact end-of-block storage, while public providers can offer only a short historical proof window. A block-hash checkpoint preserves an anchor but cannot reconstruct account/storage proof nodes. We therefore acquire at N, before N+1 capture, and retain independently authenticated bytes in SQLite and two configured filesystem copies. [Operator/API documentation](../../packages/settlement/README.md) describes bounds and failure domains.

The service observes pinned deployment code and immutable relationships, scopes jobs by activation hash and immutable terms, and keeps alternate witnesses across reorgs. Raw proof authentication checks header hash and RLP fields, manager account inclusion, exact runtime hash, storage root, ordered slots and values. It separately compares the authenticated endpoint with an observed canonical header. Full Ethereum consensus verification is outside the worker; finality is an explicit RPC observation. The Solidity verifier authenticates settlement onchain.

Durability facts, endpoint finality, permanent block-hash checkpoints, cached verified growth, and financial allocation are separate. No service response authorizes payment. No timeout diverts claim reserves. NFT return remains independent of delayed proof settlement. The API only offers read-only status and digest-bound proof downloads; any wallet may submit a valid proof to the contract.

Independent review corrected lifecycle-vs-endpoint finality, incoherent orphan handling, SQLite payload repair from file copies, advertised download-byte digests, unbounded maintenance before due acquisition, and malformed HTTP target handling. Regression tests exercise these failures. A genuine Anvil witness additionally established that authenticated canonical RLP80 zero leaves must match Solidity semantics; all root/path/value authentication remains enforced.

The first operational deployment still needs independent durable failure domains, monitoring, measured throughput, operator-provided RPC/deployment pins, and public end-to-end acceptance. The local evidence makes none of those claims.
