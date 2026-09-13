# Seller listings

An authenticated, persistent advertisement for exact terms of a **nonbinding request for a funded offer**. Publishing never transfers the NFT, issues claims, freezes liquidity, starts the earning period or moves USDC. The seller must later accept a buyer-funded offer through the existing FeeStrip contract. Signed listing cancellation withdraws the advertisement; existing onchain offers remain unchanged and buyers retain their refund path.

## Integration

```js
import {ListingStore} from './src/store.mjs';
import {createListingService} from './src/service.mjs';
import {createListingsHandler} from './src/http.mjs';

const scope = {chainId, feeStrip, positionManager, usdc};
const store = new ListingStore('/persistent/listings.sqlite', scope);
const service = createListingService({client: publicClient, scope, store});
const handler = createListingsHandler(service);
// Mount handler at /api/listings on the existing bounded HTTP server.
// publicClient uses the trusted configured chain RPC, with bounded timeout/retries.
```

Use a persistent volume and one service writer. SQLite WAL/FULL commits persist exact messages/signatures and cancellation tombstones across restart. The file refuses another deployment scope. Preserve the database, WAL and tombstones together in backups. Restoring an older backup can resurrect omitted cancellations; never represent that as authoritative cancellation recovery. No cleanup deletes old signed records or revocations.

The public route accepts GET discovery and POST signed intent operations. It has no operator credential, arbitrary RPC proxy, contract transaction or custody capability. Publishing does not depend on keeper readiness. Existing frontend funding/acceptance readiness gates must stay intact. Do not deploy this route as an in-memory or ephemeral serverless store.

## Browser-safe shared API

`src/shared.mjs` and `shared.d.mts` export `SellerListing` declarations, `ORIGINAL_Q`, `LISTING_INTENT`, `validateTerms`, `validateScope`, `listingTypedData`, `listingId`, `cancellationTypedData` and `validateCancellation`. This module imports only viem and can be bundled into the frontend.

The exact listing fields are `schemaVersion:1`, `chainId:number`, `feeStrip`, `positionManager`, `usdc`, `seller`, `tokenId`, `positionCommitment`, `originalSupply`, `buyerQuantity`, `proceedsMicros`, `endBlock`, `deadlineTimestamp`, `nonce`. Numeric amounts and blocks are canonical unsigned decimal strings. Addresses are nonzero Ethereum addresses; nonce and commitment are bytes32. EIP-712 domain: name `usufruct Listing`, version `1`, chainId and FeeStrip verifyingContract. The dedicated Listing message includes `NONBINDING_FUNDED_OFFER_REQUEST`. FeeStrip itself does not verify or consume this signature.

Only 65-byte recovered **EOA** signatures are supported. The service rejects contract and delegated-code wallets rather than pretending to verify ERC-1271. ERC-1271/6492/7702 support needs a separate reviewed implementation. Revalidate seller account/chain identity after wallet signing before publishing; preserve the exact reviewed commitment and signature through funding. No re-signing or silent commitment replacement is permitted.

Current product bounds match the browser: original Q = 10,000 × 10^18, 0 < buyerQuantity ≤ Q, 0 < proceeds ≤ 1,000 test USDC, endBlock more than 32 and at most 216,000 blocks ahead, acceptance deadline more than 60 seconds and at most 24 hours ahead. Bounds use canonical chain time. Listing observations mark closing/expired records rather than changing their signed terms.

## HTTP contract

- `GET /api/listings?limit=10&cursor=0x…&seller=0x…&tokenId=42`: all filters optional; limit 1–20; response `{status:'available',scope,listings,nextCursor}`. Cursor is the last listingId and ordering is lexicographic. Cancelled/expired/stale records remain observable; the UI can distinguish them.
- `GET /api/listings?listingId=0x…`: response `{status:'available',scope,listing}`.
- `POST /api/listings` with `{operation:'publish',listing:{listingId,terms,signature}}`: verifies and durably stores exact signed terms; replay is idempotent and cannot change the stored record.
- `POST /api/listings` with `{operation:'cancel',cancellation:{chainId,feeStrip,seller,listingId,signature}}`: the signature comes from `cancellationTypedData` with the signature field omitted. Permanent, idempotent revocation of this listingId; works before publication and after ownership changes. An unrelated signer cannot cancel a known listing or poison an unpublished seller's ID.

`scope` includes deployment addresses, `intent`, `signatureSupport:'EOA_ONLY'`, `custody:'NONE'`, and `activation:'SELLER_ACCEPTS_FUNDED_OFFER'`. Each observation contains the exact signed listing plus `status`, `reason`, `observedBlock`, `observedHash` and `observedAt` (chain timestamp). Record status is `available`, `cancelled`, `expired`, `stale` or `unavailable`. The top-level success status means service success, not executable or guaranteed sale. Errors are bounded `{error,message}` responses; upstream messages never reach clients.

Input is bounded to 16 KiB, four concurrent handler requests, 20 observations per page and fixed query fields. Store defaults bound 10,000 listings, 100 lifetime listings per seller and 10,000 unpublished cancellations. Existing published listings remain cancellable at capacity. These are abuse bounds, not durable service availability guarantees. Host-level request/body timeouts, rate limits, persistent-disk monitoring and RPC timeout/retry bounds remain required in the hosting integration. The route does not promise an exclusive listing reservation; multiple buyers can still fund competing offers onchain.

## Trust and verification

The injected RPC must support EIP-1898 `eth_call`/`eth_getCode` with `requireCanonical:true`. Each observation checks chain ID and FeeStrip's configured positionManager/USDC bindings, reads owner and validated position commitment at one block hash, and checks that the block remains canonical before returning. RPC failure/reorg fails closed. This is an RPC observation of a listing, not authenticated income evidence or proof allocation. Do not replace `settle`'s historical proof authority with it.

Run `node --test packages/listings/test/*.test.mjs` from the repository root. Tests use genuine local EIP-712 signatures and SQLite restart, with a clearly synthetic canonical-RPC fixture. They cover field/domain tampering, signer support, timing bounds, nonce reuse, cancellation replay, owner/liquidity changes, reorg rejection, bounded HTTP and safe failures. They do not claim a live seller listing, wallet acceptance or deployed listing service.
