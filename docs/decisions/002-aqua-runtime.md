# Aqua and SwapVM market runtime

The market uses official SwapVM source pin `afd99c408b4ed610027f4426c6f98650acac9f5f` and Aqua v1.0.0; full dependency pins are in [market-dependencies.json](../../contracts/market-dependencies.json). Powered by SwapVM — © Degensoft Ltd 2025.

The default AquaSwapVMRouter dispatcher omits the repository’s StaticBalances and LimitSwap fixed-price instructions. FeeStripRouter extends that dispatcher with those two unmodified instructions. Other dispatch and asset transfers remain in the official implementation. The application deploys its own source-pinned Aqua instance and extended router; these addresses are not presented as pre-existing official deployments.

FeeStripMarket builds a fixed-price strategy binding series state, exact token ratio, expiry and salt. Capture, allocation and redemption invalidate old terms; a claim transfer alone does not. Makers publish a new strategy after a state change. Input/output limits and current inventory determine executable capacity.

Aqua allocations are virtual. Publishing the same inventory twice does not create twice the assets. Settlement reserves never approve either the router or Aqua.

Each strategy checks the same series state before input and after both transfers. This prevents a token callback or alternate transfer ordering from changing lifecycle state during execution. Four callback/order regressions verify atomic rollback. Both ask and bid directions use real FeeClaim tokens in contract and local-chain tests; [public transactions](../VERIFICATION.md) demonstrate the deployed ask path and stale-quote rejection.
