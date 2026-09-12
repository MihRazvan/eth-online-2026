# Wallet position discovery

12 September 2026. Fix for eligible canonical Sepolia NFTs missing from Pin a tree. The manifest previously exposed only prepared NFT39216 plus NFTs referenced by application offers/series.

Read-only public RPC inspection at block11687312 confirmed NFTs39220,39221,39222 belong to `0x746bb7beFD31D9052BB8EbA7D5dD74C9aCf54C6d`. All three contain native ETH and the configured authentic Sepolia USDC, use no hooks/subscriber, and have nonzero liquidity. NFTs39218/39219 instead contain ETH/LINK and remain ineligible.

## Implementation and limits

- The connected wallet's incoming canonical PositionManager Transfer events are searched over the latest50,000blocks, in pages of5,000, capped at100candidate IDs. Results cache for30seconds per wallet; current ownership and eligibility are checked again at the snapshot block. This is recent discovery, not complete historical wallet enumeration.
- A read-only lookup accepts a uint256 NFT ID or exact `https://app.uniswap.org/positions/v4/ethereum_sepolia/<id>` link. It never fetches the supplied URL. Ownership, authentic USDC, hooklessness, liquidity and subscriber restrictions are checked before session import. Imported IDs are held in memory for that wallet; refresh may require lookup again for older positions.
- Generic RPC failures and failed metadata on discovery-only candidates produce an incomplete-search notice; they cannot hide existing claims/recovery. Failures for configured or financial-state NFTs still propagate. An unsupported manual lookup gives its specific reason.
- Discovery/import adds no transaction authority. Approval, exact funded acceptance, reviewed-wallet binding and all contract validation remain unchanged. No IDs were added to the public manifest.

## Verification

TypeScript and isolated public Vercel build pass. All47UI tests pass, including9new discovery/parser/eligibility regressions. Coverage includes wrong-network/host/credential-bearing links, uint256 bounds, pagination edges, duplicates, exact-cap truncation, partial RPC failure, current owner, transferred-away NFTs, unsupported currency and broken token metadata alongside preserved claims. A separate protocol reviewer identified the metadata-availability and exact-cap defects; both were fixed and re-reviewed.

The actual public build was exercised at desktop1440px and mobile390px with live public RPC reads and a read-only wallet-account stub. The three user NFTs appeared automatically, lookup selected39221, and lookup of39218 returned the USDC requirement. No page errors or horizontal overflow were observed. The stub rejects every method except account/chain reads, so this does **not** verify participant signing or the financial lifecycle. No public transaction was sent.

[Browser result](position-discovery/browser-local.json), [desktop](position-discovery/desktop.png), [mobile](position-discovery/mobile.png).

Reproduce against a separately served public build with:

```sh
pnpm build:vercel
DISCOVERY_BASE_URL=http://127.0.0.1:4198 node scripts/public/verify-position-discovery.mjs
```

The read-only public regression intentionally targets the reported wallet/IDs; later transfers, burns or eligibility changes can invalidate this historical expectation. Output goes to ignored `.scratch/discovery`. The public frontend is published through the existing GitHub/Vercel integration; retain a separate result when verification against the live alias succeeds.
