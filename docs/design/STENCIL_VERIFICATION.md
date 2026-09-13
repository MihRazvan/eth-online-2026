# Supplied HTML redesign — verification

13 September 2026. The user's HTML reference is preserved under [reference](reference/README.md). The active application uses its Anton/Space Mono type, light/dark themes, blue bands, window frame, citrus marks, dither texture and barcode furniture. Reference transaction simulations were replaced with real adapter actions and exact economic terms.

Visual review covered seven routes at desktop1440px and mobile390px in both themes, with no horizontal page overflow. Representative screenshots below use explicitly labelled deterministic fixtures and are not public-chain evidence:

- [Landing, dark](evidence/stencil/landing-dark.png)
- [Market, mobile light](evidence/stencil/market-mobile-light.png)
- [Pin selection, dark](evidence/stencil/pin-dark.png)

The application renders the landing explanation and legal links even while chain data is unavailable. Keyboard focus and selection remain usable, theme persists, and a one-base-unit claim selection retains exact original-Q arithmetic. Updated78hermetic browser checks pass.

Actual isolated-Anvil verification covers both authenticated-witness and verified-cache settlement variants, each with four browser tests. It includes the real seller listing form at zero ETH, signed publication, unchanged nonce/NFT/USDC, SQLite restart, second-wallet discovery, exact buyer funding, listing withdrawal preserving funded-offer rights, seller NFT approval/acceptance and immutable original-Q claims. Existing trade/capture/NFT-return/allocation/redemption and wallet-replacement sequences also pass. Actual bid/ask/maker-cancellation regression preserves reserves and exact payments.

A counterparty-refresh bug discovered during the chain test was corrected: once a linked NFT is activated, the issued-claim link remains visible outside the hidden Pin steps and the obsolete form disappears. The local reset script now advances the fresh Anvil head to wall time, so repeated suites do not mistake an old startup timestamp for a current canonical observation.

These are local test results. A participant-reviewed Sepolia financial lifecycle, hosted checkpoint and remote proof restoration must be verified separately. Public readiness is reported by the deployed service; visual completion never enables it.
