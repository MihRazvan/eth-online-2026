# usufruct web application

The React, TypeScript and Vite interface for [usufruct](https://usufruct-mu.vercel.app). viem connects the application to Ethereum. Market, Pin a seed and Holdings support signed listings, funded offers, fee-claim trading, NFT recovery and independent payouts.

[Quickstart](../../docs/QUICKSTART.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Specification](../../docs/SPECIFICATION.md) · [Verification](../../docs/VERIFICATION.md)

## Development

From the repository root, with the pinned dependencies installed:

```sh
pnpm --filter @feestrip/web dev
pnpm --filter @feestrip/web build
pnpm --filter @feestrip/web test
```

The development server uses `http://127.0.0.1:4174`. The default fixture mode is explicitly labeled: balances, history, time and actions are simulated. It neither signs transactions nor publishes real listings.

Set `VITE_DATA_MODE=local` or `testnet` to use the deployment manifest at `/deployment.json`. These modes fail closed on invalid configuration and never fall back to fixtures. The public deployment uses Ethereum Sepolia. Local test-wallet access additionally requires `VITE_ENABLE_TEST_WALLET=true`, a loopback chain with ID 31337, and an explicit `?wallet=seller|buyer|holder` selection. See Quickstart for disposable-chain setup.

## Application boundaries

- [App.tsx](src/App.tsx) renders workflows and transaction reviews. [types.ts](src/types.ts) defines the adapter interface; [chainAdapter.ts](src/chainAdapter.ts) validates deployment identity, reads current state and executes reviewed actions through an injected EIP-1193 wallet.
- Claim amounts use 18-decimal integer base units; USDC uses 6. Earning endpoints are block numbers, while offer and quote expirations are timestamps. [amounts.ts](src/amounts.ts) preserves exact inputs and original-supply payout proportions.
- Quote capacity reflects current maker inventory, allowances and strategy state. Explicit user amounts survive refreshes; pristine selections fit executable capacity. Signing remains bound to the reviewed account and parameters.
- Transaction receipts survive reloads and distinguish approval, broadcast, confirmation and replacement. An application update offers an explicit reload without discarding recorded transactions or automatically reloading during signing.

The static frontend does not run its backing services. `/api/listings` stores signed advertisements; `/api/recovery` serves retained proof artifacts; `/api/analysis` supplies verified historical comparisons; `/api/operations` gates new funding and acceptance on settlement-service readiness. Refunds and existing payouts remain separate from that new-sale gate. Estimates and analysis never authorize settlement.

Browser manifests, static files and every `VITE_` value are public. Keep signing keys and service credentials outside the frontend.

## Design and accessibility

Anton and Space Mono are served locally from [public/fonts](public/fonts), with their license notices. Native SVG artwork, light/dark themes, keyboard-accessible disclosures and reduced-motion behavior support the interface. Claim rights, exact terms and recovery evidence remain available below the primary purchase controls.

## Verification

The documented interface revision passes 109 hermetic browser and component checks. These cover precise fractional purchases, quote and signer guards, receipts, lookup deadlines, estimate isolation, recovery states, keyboard navigation and mobile layout.

A separate suite exercises real contracts on a disposable local Anvil chain:

```sh
pnpm test:browser:chain
```

This suite resets its configured local node and covers funded acceptance, Aqua transfers, capture, NFT return, proof allocation and independent payouts. Follow Quickstart for prerequisites and isolated ports. Local results remain distinct from the actual Sepolia lifecycle recorded in [Verification](../../docs/VERIFICATION.md); they do not establish an unaided third-party wallet experience or mainnet readiness.
