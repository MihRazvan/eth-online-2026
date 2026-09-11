# Public-mode readiness and NFT discovery

This repository review used tracked source and existing sanitized evidence. It did not read `.env`, connect to a public RPC, sign transactions, start a server, or mutate a chain. A programmed read/write smoke run does not establish participant wallet acceptance.

## Public configuration

The browser build requires `VITE_DATA_MODE=testnet`; leave `VITE_ENABLE_TEST_WALLET` unset or false. Remove `?wallet=` from public URLs: deterministic actor selection is restricted to explicitly enabled loopback chain31337 and correctly rejects testnet use.

The public `/deployment.json` must contain:

- `mode: "testnet"`, numeric `chainId: 11155111`, and an absolute browser-accessible `rpcUrl`.
- `feeStrip`, `usdc`, `other`, `positionManager`, `poolManager`, `verifier`, `checkpoints`, `market`, `swapRouter`, and `aqua` addresses. `other` may be the zero address for native ETH; the other configured contracts must have code.
- `nftIds` as decimal-string canonical PositionManager IDs. Unsold positions are not discovered by enumerating the connected wallet: the browser combines this explicit list with IDs already referenced by FeeStrip offers and series. Add a freshly minted intended offer target to the manifest.
- Set `deploymentBlock` to the actual deployment/discovery start block. Omitting it makes Aqua event discovery begin at genesis; the current reader does not paginate provider log-range limits. `blockTimeSeconds: 12` is suitable for indicative Sepolia dates, while blocks remain the exact earning endpoints. `actors` is unnecessary in public mode.

The adapter pins Sepolia PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`, PositionManager `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` and native USDC `0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`, including their reviewed runtime hashes. It checks the RPC chain ID and custom contract bindings. The operator's verified deployment record remains the trust source for custom FeeStrip, market, router, Aqua and verifier runtimes; the frontend does not independently authenticate arbitrary bytecode beyond its stated pins and binding checks.

NFT eligibility is read from canonical PositionManager state: positive liquidity, hookless pool, no attached subscriber, and a native-USDC currency leg. Wrong-chain and account-change checks remain enforced before approval, simulation and submission. Public signing uses the injected EIP-1193 wallet; there is no backend signer. Wallet/provider selection beyond `window.ethereum` and participant acceptance in an actual extension or wallet browser remain separate checks.

## Credential and routing boundaries

`deployment.json` is public and Vite copies public assets into the build even if Git ignores them. Do not put a secret RPC URL, bearer token, private key, retention configuration or arbitrary operator configuration in that file. `VITE_*` values are browser-visible build inputs. Use a credential-free reader endpoint or an operator-controlled same-origin read-only RPC proxy; keep credential-bearing RPC configuration on the backend. CORS/HTTPS availability must be checked for the chosen browser endpoint.

Vite development routes `/api/recovery` to loopback8788 and `/api/analysis` to loopback8787. A static public host requires equivalent same-origin reverse-proxy routes; these development proxy settings do not deploy those services. The browser uses fixed same-origin API paths and never needs private backend RPC/Graph URLs. Missing analysis remains explicitly unavailable. Retention must run from its separate private `RETENTION_CONFIG`, with the chain/genesis/runtime pins, database and two artifact roots described in `packages/settlement/README.md`. Start observation before the series endpoint; a public proof capability check alone does not establish ongoing retention availability.

Provider failures previously could reach the UI as full viem errors containing URLs and nested request diagnostics. Public adapter boundaries now expose the concise viem `shortMessage` where available, redact HTTP/WebSocket URLs, and do not retain nested diagnostic causes in the outward error. This is bounded diagnostic hygiene, not a substitute for keeping credentials out of public configuration and browser network traffic. Failure remains visible; RPC errors are not converted into empty portfolio state.

## Fixed blocker: returned NFT subsequently burned

Before this change, `load()` requested `ownerOf`, pool/position information and liquidity for every configured, offered or historical series NFT in one `Promise.all`. Burning a returned NFT caused `ownerOf` to revert and aborted the entire snapshot. The fee claims and segregated reserves can remain valid after NFT return and burn, so this prevented their holder from using the interface.

The reader now checks `ownerOf` first and skips only the decoded canonical `Error("NOT_MINTED")`. The pinned PositionManager inherits this exact behavior from `contracts/lib/solmate/src/tokens/ERC721.sol:35`. A generic revert, empty revert, timeout, RPC error or transport message merely containing `NOT_MINTED` is not proof of absence and still rejects the snapshot. Existing series markets and wallet claim balances are built independently and survive a missing original NFT; other valid NFT positions remain visible.

Validation uses the actual adapter load flow with injected RPC responses and viem's decoded error objects, not a replacement portfolio implementation. The new regression preserves an allocated series, 5,000 unredeemed claims, a separately recoverable funded offer and a separate valid NFT while its original NFT returns canonical `NOT_MINTED`. Negative cases preserve provider-failure visibility, and a diagnostic regression verifies that URL and nested-header sentinels never reach the outward error. These are deterministic boundary tests, not public-chain evidence.

The selected adapter suite passes13 tests: three new readiness regressions, canonical chain/witness/native metadata checks, quote rounding/program/signer tests and recovery scope/cache/fallback tests. TypeScript and the public-mode production build pass. No dependency, generated ABI, root configuration or contract change is included. Full integrated browser regression and public participant signing remain with the integration owner.
