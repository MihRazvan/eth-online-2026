# Complete local FeeStrip lifecycle

2026-09-11. `node scripts/chain/lifecycle.mjs` passed against a dedicated Anvil31337 instance after native deployment and `node scripts/chain/seed.mjs`.

This is actual local chain execution: unmodified canonical Uniswap source deployments, fixed-original-Q FeeClaims, official Aqua/SwapVM runtime with the documented two-instruction dispatcher extension, real checkpoint and historical header/account/storage verification. Token faucets are explicitly local fixtures; none of these addresses or receipts are represented as public-chain deployments. `local-lifecycle.json` contains exact addresses, real local transaction hashes and transaction gas.

The command independently branches native PositionManager collection via Anvil snapshot/revert at activation and N. Local impersonation only enables that independent collection oracle. It restores the exact snapshot before retaining the actual Anvil header and EIP-1186 witness. The settlement path uses EVM BLOCKHASH to authenticate that real local header; no injected root, payout, verifier stub or administrator allocation is used. The separate genuine public Sepolia witness remains immutable and separately labeled.

Verified sequence: pre-period native fees cleared to seller; funded offer accepted atomically; exact NFT/liquidity preserved; issued FeeClaims traded against USDC through Aqua; native N-snapshot fee oracle; real N witness retained; additional funded donations after N; late capture; same NFT returned while allocation unresolved; permissionless checkpoint and settlement; holder/buyer/seller independently redeem; residual USDC and other-currency withdrawal.

| Allocation | USDC base units |
| --- | ---: |
| Independent native N collection / authenticated sold amount | 799999999 |
| Actual late capture | 1199999999 |
| Residual USDC | 400000000 |
| Final segregated floor dust after all claims consumed | 2 |

Actual transaction gas: funded acceptance1204073; Aqua claim trade164072; capture272114; NFT return83912; checkpoint45126; complete local settlement1555680; holder redemption110993 (see receipts for each holder); residual withdrawal84436. These include transaction intrinsic/calldata costs and exclude contract deployment. A local small trie is cheaper than the public Sepolia witness; public proof call alone measured4417289 gas. Neither result establishes commercial affordability. Keep fixed bands and proving cost visible in a demo.

Remaining: browser execution of the same code path, persistent public FeeStrip deployment with reliable witness retention, live Graph composition, human submission/review. Local full-lifecycle success does not make the combined public-chain acceptance gate passed.
