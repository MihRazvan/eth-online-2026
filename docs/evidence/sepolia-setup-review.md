# Sepolia setup review

The lead implemented the public transaction runner and private read proxy. A proof specialist implemented the bounded canonical position module; a separate infrastructure reviewer inspected both. The frontend specialist fixed burned-NFT discovery, with separate lead and infrastructure source review. This is engineering review, not an audit.

Review corrections incorporated before broadcast:

- Public minting uses token→Permit2→PositionManager bounded approvals and atomic MINT_POSITION/SETTLE_PAIR. It never pre-funds the publicly sweepable PositionManager. Receipt Transfer events identify the actual NFT; a pre-read nextTokenId is not authoritative.
- The journal uses an exclusive lock, file and parent-directory fsync, and atomic rename before a network send. Initial and resumed signed bytes are verified against their hash, recovered signer, chain, nonce, destination, calldata, value and maximum cost. A replaced receipt cannot silently satisfy the recorded action.
- Resumes recheck chain transactions even when a receipt was previously recorded. Public execution requires the same scripts, deployment ABIs/bytecode, wallet, chain and canonical pins as the completed mint/custody rehearsal.
- Saved position plans revalidate wrap amount, liquidity, tick range, source metadata and expiry constraints before any send. All token approvals and mint input maxima are bounded. Provider URLs and nested errors are excluded from diagnostics and public manifests.

The dedicated Sepolia fork at block11684080 executed all12 setup transactions against the actual deployed canonical contracts. A restart reused all receipts. The mint used4.95USDC and2051200415WETH base units;0.003testETH was wrapped, with the unused WETH retained by the wallet. A held runner lock rejected a second invocation without modifying the journal.

A separate snapshot test funded and accepted a one-wallet offer, checked NFT custody and fixed liquidity, captured after N, then returned the original NFT before proof allocation. It restored the snapshot afterward. This verifies compatibility with the public PositionManager runtime; it is not a public sale, independent buyer acceptance, or an exact public endpoint-proof comparison.

Nine offline setup tests cover native amount rounding, bounded approvals, receipt identity, durable replay, insufficient funds and corrupt saved plans. All36 UI tests and the complete local transaction-backed browser lifecycle pass, including real Aqua trading, retained-witness allocation and independent redemption. The production build passes. Public wallet signing and live Graph integration remain separate gates.

Public execution completed with12confirmed transactions in [deployment evidence](sepolia-deployment.json). Independent specialist checks through PublicNode matched all6 runtime hashes and15 immutable bindings: core contracts at block11684169/hash0x43318ad96495d5a4a3c6050392e3c4f117b1051fbd60783fd3cbd804c7507a6b, Aqua/routers at11684174/hash0x430d6f0abbdc205bce1540f0ce6474851b2f0bf0fcbe92afaf7722148043a031. Both headers were rechecked. A separate public read confirmed NFT39216 ownership, exact liquidity and15.05USDC remaining. Gas across setup transactions was0.014009397442426351testETH, plus0.003testETH wrapped. No public sale was activated.

The private retention helper was independently reviewed and changed to replace output atomically using a fresh0600file inside checked0700directories. Regenerating an existing0644output was verified to restore0600permissions. The worker observed public block11684194 with0jobs, then the recovery API started on8788. This is startup evidence only. The production testnet preview passed actual RPC loading, desktop/mobile rendering and rejected a test-wallet URL; all36UI tests were rerun after correcting the first-sale empty state.
