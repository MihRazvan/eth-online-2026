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
