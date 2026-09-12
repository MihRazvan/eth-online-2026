# Operated Graph analysis increment

The frontend distinguishes a project-operated service pause from wallet prerequisites and offers a signature-free service recheck. Analysis distinguishes not requested, loading, unavailable, invalid inputs, missing quotes and usable sourced results. An older overlapping request cannot overwrite a newer result. Expected finality delay is shown separately from additional indexing lag; a current finalized source is not permanently labeled stale simply because the chain tip is ahead.

The operations image now includes optional Graph HTTP composition and an independently enabled history child. It still requires actual hosting, keeper operation and off-host backup before the public funding/acceptance gate opens. No public sale, public redemption or live instrument analysis is established by this increment.

## Source and history scope

The selected NFT39216 pool is USDC/WETH, fee3000, canonical hookless Sepolia v4. Its real initialization is block7432532. A measured1,000-block replay used1,040,384database bytes and took50.252seconds including startup. A4.26million-block lifetime replay would exceed the proposed1GiB proof volume. This is a storage estimate, not a throughput guarantee.

Complete earning-window tick history can instead begin with an actual Swap before activation. The default verified anchor is block11678801, transaction `0x6237cd0124382cc1c66f043a3b979854653839610e720504a222f552781137ed`, global log98, tick59600. Exact Alchemy receipt/log data and actual Substreams output agree; an independent reviewer verified the block hash and transaction inclusion through PublicNode. [Sanitized500-block qualification](operations/graph-swap-anchor.json), [full provenance and runtime commands](../../scripts/graph/STREAM_SERVICE.md).

The runner accepts only the actual matching event; it never inserts an RPC-seeded synthetic block. It retains every subsequent block and all same-block swap ordering, checks the retained anchor on restart, and rejects a finalized undo that would discard it. Analysis additionally checks that the selected pool's own anchor precedes its earning window, including multi-pool configurations. Earlier pool activity remains outside the stated history scope.

A locally retained snapshot now contains11,299 consecutive blocks11678801–11690099, approximately11.6MB. Its original seed and20recent block hashes agree with RPC, and Studio v0.2.0 agrees at the exact retained head/hash with zero series. [Saved tail verification](operations/graph-history-tail.json). This was caught up to the sampled finalized head; the stopped local snapshot is not an always-on service. A separate actual10-block resume verifies clean CLI termination, lock removal and retained cursor. [Resume evidence](operations/graph-cli-resume.json).

## API and operational bounds

The HTTP reader opens the stream database read-only, pins the committed Graph deployment and bundled package hash, and selects one common block hash. A post-query SQLite snapshot prevents pairing new-fork ticks with an old Graph hash; a final RPC canonical read and SQLite recheck reject a removed/orphaned source. RPC finalized height distinguishes finality delay from ingestion delay. Graph remains explanatory data, never allocation authority.

Four concurrent analyses, bounded uint256 query inputs,2MiB Graph response limits and20,000 samples bound HTTP work. SQL uses an indexed pool/block lookup and excludes post-endpoint history before materialization. Unavailable or oversized history produces503 with no invented estimate. Provider cursors, API credentials and transport diagnostics are not returned to browsers.

The history child has one exclusive writer, durable cursor resume, bounded retry/backoff and sanitized status output. It checks available disk before opening the database and at most every100responses, reserving at least256MiB. This is periodic protection, not a hard quota against other writers. Separate `ANALYSIS_ENABLED` and `GRAPH_STREAM_ENABLED` flags default off. Stream failure neither stops the settlement worker nor changes sales readiness. Only the history child receives the stream token; it receives no wallet key or bucket credentials.

## Verification and remaining acceptance

- 54core/data/acquisition/stream/verifier tests passed locally;9operations tests passed. These are separate suites.
- 65hermetic frontend tests and TypeScript/public build passed.
- Both actual isolated-chain browser variants passed all3cases, covering the complete financial flow and verified-growth-cache recovery. These use local test wallets, not human public-wallet acceptance.
- Independent implementation review corrected unbounded SQL work, caught the shared-volume capacity risk, and confirmed Swap seeding, per-pool coverage, canonicality, finality and credential isolation.
- The operations image built successfully. Read-only Sepolia startup passed contract/proof checks while correctly refusing new sales without keeper and replica readiness; the direct API requires authentication. An unavailable indexed series returns503; there is still no public activated series. A separate temporary container retained95new finalized blocks with proof retention ready at the sampled checks, then exited cleanly with its history preserved and writer lock released. [Live child and shutdown evidence](operations/graph-live-child.json).

The first hosted application run for `eae07d5` failed on an obsolete analysis-label assertion after all hermetic checks passed. The follow-up `3144776` passed both financial lifecycle variants but exposed the same generic status-selector issue in the separate quote regression; that receipt selector is now scoped to the financial confirmation too. The lifecycle now explicitly requests analysis and verifies unavailable data without a fabricated chart. Its transaction receipt locator is scoped to the financial confirmation because analysis also has an accessible status region. The subsequent hosted quote run exposed an immediate DOM assertion racing the post-transaction refresh. The quote checks now await the actual rendered state with bounded Playwright assertions, replacing the arbitrary350ms sleep. Both real-chain variants and the local actual bid/ask/cancellation regression pass; payout and reserve assertions were preserved. Live qualification also exposed Connect retaining its deadline timer after the final yielded block. The CLI now cancels at the exact requested boundary, closes SQLite and releases its lock, flushes output, then exits; an actual process regression retains a30minute timer to exercise this behavior.

All three hosted jobs passed for source `8f4d962`: [run34707231466](https://github.com/MihRazvan/eth-online-2026/actions/runs/34707231466), including both actual browser recovery variants and the final quote regression. Temporary local review services are stopped and their private history retained.

Hosted worker/backup verification, a real public sale, the live series/Subgraph/history buyer join, staged judge inventory and unaided participant acceptance remain open. The teammate's role is to exercise the prepared product with their wallet; implementation, operating configuration, automated checks and evidence preparation belong to the lead.
