# Research-driven recovery increment

2026-09-11. Codex lead implementation/integration, proof specialist acquisition, independent infrastructure and frontend review. Economic contracts and deployed trust assumptions are unchanged. Research and ordered follow-ups: [synthesis](../research/README.md).

## Buyer capital recovery

The contract already allowed a buyer to cancel an unconsumed funded offer, including after expiry. The application lacked that path. The new owned-offer list enumerates all unconsumed funding for the connected buyer, displays exact native-USDC refund amounts, and requires an explicit cancellation review. Its aggregate says “in unaccepted offers,” including expired ones. The adapter rechecks ownership and consumed state; the contract remains authoritative if seller acceptance races cancellation. UI success follows a successful transaction receipt.

The independent reviewer reproduced a fixture-only bug when cancelling the newest of two offers: the older funding remained recoverable but disappeared from the seller's acceptance control. The fix restores the remaining offer, and a saved browser regression covers reverse-order cancellation and rejected signatures. No onchain ownership/refund issue was found in this bounded review.

Actual local browser sequence verifies funding101USDC, separate NFT approval/acceptance, Aqua maker publication and trade, delayed capture, original NFT return before allocation, authentic historical proof, independent redemption by three holders, residual withdrawal, then exact100USDC refund of the expired seed offer. The final escrow balance equals segregated dust, `fundedOfferUSDC == 0`, and `reservedUSDC` does not change during cancellation. Values and receipts: [browser-chain-lifecycle.json](browser-chain-lifecycle.json).

## Canonical witness acquisition

Acquisition now prefers `{blockHash, requireCanonical:true}`. Only explicit unsupported-selector diagnostics permit a number fallback. It checks configured/observed chain ID, serializes and hashes the exact header, validates manager and unique requested slot identities, rejects malformed response/RLP structure, then rereads the canonical header and chain before returning. Metadata identifies local31337 accurately and states the remaining cryptographic validation requirement.

Ten mock-RPC tests reuse genuine retained Sepolia bytes to cover successful acquisition, narrow fallback, real error propagation, reorgs, substituted/missing/duplicate fields, malformed structure and chain changes. The independent infrastructure reviewer reran all10 tests and performed a read-only PublicNode Sepolia acquisition at block11682982: hash selector succeeded, witness14400bytes. This observation is not proof-service uptime or public FeeStrip acceptance.

An integrated browser run caught a compatibility defect: new decimal-string `chainId` metadata was rejected by a reader expecting a number. The reader now accepts exact safe integers or canonical decimal strings, checks available endpoint/manager metadata, and rejects mismatches. A regression covers both representations and malformed/substituted values. Legacy artifacts without metadata still rely on the authoritative Solidity verifier.

JavaScript structure checks do **not** authenticate the account/storage tries. Solidity continues to do that before allocation. Canonical rereading is an observation, not finality; a later reorg still needs recovery. Durable scheduling, atomic witness storage, independent offline verification, redundant copies and checkpoint monitoring remain backlog items. No server payout signature or timeout allocation was introduced.

## Integrated verification

- `pnpm test`:27pass, including17core/data and10acquisition tests.
- `pnpm build`:passes TypeScript and production bundle.
- `pnpm test:browser`:16fixture/scope tests pass.
- `LOCAL_RPC_URL=http://127.0.0.1:8546 pnpm test:browser:chain`:complete real local lifecycle passes in7.3seconds, including seed/reset.
- Separate browser artifact directories prevent one suite deleting the other's screenshots. The dedicated8546 node avoids resetting8545; generated deployment files remain checkout-local shared resources.
- Lead visually inspected the390px cancellation review: exact refund, seller address, race explanation and confirmation control fit within the viewport. Retained image: [mobile cancellation](../design/evidence/local-offer-cancellation-mobile.png).

All local transactions use explicitly enabled unlocked Anvil actors and faucet assets. Actual injected-wallet signing, live Graph composition and the controlled public lifecycle still require the access the user is gathering. These checks are not an audit.
