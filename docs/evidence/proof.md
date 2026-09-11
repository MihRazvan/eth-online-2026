# Historical proof evidence (Codex, 2026-09-11)

**Verified component: a genuine retained public Sepolia header/account/storage witness, actual fork BLOCKHASH authentication, and native collection at exactly the same N snapshot.** This is not a public FeeStrip transaction, a completed funded-sale lifecycle, an audit, or proof-service availability certification.

## Retained observation

`scripts/proof/sepolia-witness.json` retains the public RPC header, RLP encoding, full account/storage nodes, manager bytecode, slot derivation inputs, independently decoded values and ABI witness. No secret or RPC credential is included.

| Field | Value |
| --- | --- |
| Chain | Ethereum Sepolia, 11155111 |
| N | 11682191 |
| Header hash | `0x435e69c8a0f3ad2b97190657c410a92f69a2dd5a3af9241c4b55b3e2a003c3ea` |
| Canonical PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| Manager codehash at N | `0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1` |
| Canonical PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` |
| Existing NFT | 39005 |
| Circle Sepolia USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, pool currency1 |
| Pool | `0xc743656d27fde4e2d5895e878557aaa56dd48c8656d25e9db35ba10b1fe3d824` |
| Frozen range for observation | [-184551, -174797), hookless |
| Stored tick at N | -173794 (out of range at observation) |
| NFT liquidity at N | 343621107826 |
| Proven inside growth | 206941241816358898950454377569 |
| Native position's last-growth baseline | 0 |
| Native collection and calculated amount | **208 USDC base units**, each (0.000208 test USDC) |
| Raw account + deduplicated storage proof bytes | 11243 |
| ABI witness including header | 14400 bytes |

Canonical addresses were checked against [Uniswap's deployment table](https://developers.uniswap.org/docs/protocols/v4/deployments) and [Circle's USDC registry](https://developers.circle.com/stablecoins/usdc-contract-addresses). Code was read at N and hashed; manager code is retained, and PositionManager/USDC byte lengths and codehashes are recorded. USDC is a proxy: its runtime hash alone does not freeze future implementation behavior.

## Reproduce

From repository root, with Foundry 1.5.1 and Solidity 0.8.26:

```sh
python3 -m venv /tmp/feestrip-proof-venv
/tmp/feestrip-proof-venv/bin/pip install -r scripts/proof/requirements.txt
/tmp/feestrip-proof-venv/bin/python scripts/proof/check_retained.py
forge test --root contracts/test/proof -vv
forge script scripts/proof/VerifyPublic.s.sol --root contracts/test/proof --fork-url https://ethereum-sepolia-rpc.publicnode.com --fork-block-number 11682192 -vvvv
```

The first verification is offline, using independent Python `HexaryTrie` and RLP implementations. The hermetic Solidity suite injects the retained hash and manager bytecode **only for replay testing**. Its scoped Foundry config is independent of the integrated contract suite. Foundry 1.5.1's source-lint display can emit `file ... not found` for the scoped relative imports after successful compilation; the executable test summary and process status report the actual result.

The final script has **no `setBlockhash`, `etch`, or caller-root shortcut**. It forks the public chain at N+1, deploys a local checkpoint/verifier, obtains EVM `blockhash(N)`, checks equality with the retained header, and verifies the proof. It then creates an independent fork at N, reads native StateView position baseline, impersonates the existing NFT owner locally and performs canonical `DECREASE_LIQUIDITY(0)` followed by `TAKE_PAIR`. Actual USDC balance delta is the oracle. Impersonation authorizes the local collection only; it is not a public transaction or a holder signature. The script fails if the RPC cannot serve required state.

Fresh acquisition (a separate command, deliberately never silently replaces the immutable regression witness):

```sh
/tmp/feestrip-proof-venv/bin/python scripts/proof/acquire.py --token 39005 --out /tmp/fresh-sepolia-witness.json
```

`PROOF_RPC_URL` overrides the acquisition/native-collection provider. Use a matching `--fork-url` for the initial fork. The script validates the RLP header hash, account/storage MPT proofs and deployed StateView growth before retaining output. RPC errors fail the command. A new witness changes N; use N+1 for its fork run. Do not update acceptance expectations simply to pass.

## Results and gas

16 Solidity tests pass, including 256 fuzz cases. Cases cover genuine witness replay, altered header/account/storage, missing proof, substituted chain/block/manager/codehash/pool, permanent checkpoints, current/future rejection, N+256 success, N+257 failure, immutable authenticated growth cache and inability to cache malformed evidence. No skipped tests.

Measured `gasleft` deltas on the public fork script, Solidity 0.8.26/Cancun/via-IR/optimizer 200:

| Operation | Gas |
| --- | ---: |
| Permissionless checkpoint | 24352 |
| Header + account + four storage slots + inside growth | 4417289 |
| Native existing-position zero-liquidity collection at N | 103009 |
| Warm cached growth read (hermetic cache test) | 3103 |

These are call-level measurements, excluding transaction intrinsic/calldata costs and verifier deployment; **not full FeeStrip settlement gas**. Cache-read gas is warm and excludes proof/write cost. The complete offline witness test is ~5.33M gas because it also loads its large stored witness. The tiny observed fee amount would not economically justify this proof by itself; no commercial viability claim follows. Shared cached endpoints may amortize cost but do not guarantee buyers exist.

## Provider and acceptance limitations

Public `ethereum-sepolia-rpc.publicnode.com` served `eth_getProof` for the current tip. Explicit tip-1, -2, -5, -16, -64 and -256 requests returned `distance to target block exceeds maximum proof window` during probing. A fresh tip witness was successfully retained and later verified after becoming historical. Even a one-block acquisition delay can therefore be fatal with this provider. This is observed behavior, not a service-level guarantee. `1rpc.io/sepolia` showed the same old-proof rejection. Tatum's public gateway served tip-1 but older probes returned root-hash-mismatch errors, then HTTP 429. `rpc.sepolia.org` returned HTTP 404; dRPC returned HTTP 400. These alternatives were not accepted as reliable archives.

The immutable retained proof now reproduces without historical `eth_getProof`; fork collection still needs historical state reads. A permanent checkpoint and a durable witness are independent obligations. Public deployments need reliable witness capture and monitoring. An unavailable proof never authorizes an arbitrary allocation.

Remaining gate: the **combined** controlled cleared-activation baseline, authenticated public N endpoint, M>N actual late capture, same-NFT release before proof, and integrated reserve-bounded settlement/redemption. This lane proves the genuine public witness and native N-collection component using a preexisting position's native baseline (zero); it does not claim the controlled activation branch. Protocol tests must verify clearing and late growth independently and integration must preserve the distinction. The current retained range is out of range at N; this is real observation, not a fabricated yield scenario.

All new proof source, scripts, tests and this evidence were authored by Codex. The Polytope subtree is third-party Apache-2.0 source, unchanged and file-hash pinned; the handoff provided its source candidate. No human audit or review is attributed.
