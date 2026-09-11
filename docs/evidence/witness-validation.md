# Offline witness authentication

Recorded 2026-09-11 by Codex, isolated `work/witness-validation` worktree based on `743cc48`. This increment adds independent offline MPT authentication before a retention worker treats an acquired artifact as verified. It does not change economic contracts, payout calculations, dependencies, chain state or canonical anchoring.

`validateWitness(artifact, expected, {python})` in `packages/settlement/src/validate.mjs` accepts the current `acquireWitness` envelope and returns `{blockHash, stateRoot, storageRoot, values: string[], managerCodeHash}`. `expected` contains canonical decimal-string `chainId` and `blockNumber`, a manager address, an independently pinned manager code hash, and the exact ordered 32-byte storage-slot array. Never obtain the expected code pin from the artifact's RPC `codeHash`. The existing public artifact's legacy safe JSON numbers are accepted for chain/block metadata; current decimal-string metadata is also accepted.

The Node wrapper snapshots its input before yielding, decodes the Solidity `(bytes,bytes[],bytes[])` witness with viem, and requires exact equality with the header RLP, ordered account nodes and deduplicated storage-node union in that same snapshot. Re-encoding must reproduce the entire ABI byte string; appended bytes, alternative offsets/padding or differing nodes fail closed. Storage-node deduplication normalizes hex case and preserves first occurrence, matching the current acquisition envelope. It then invokes the fixed Python script through stdin without a shell or temporary artifact. Python failure, missing dependencies, malformed output, a 30-second timeout or excessive output fails closed.

`scripts/proof/validate_witness.py` independently authenticates:

- Canonical RLP header encoding, its hash, required field widths, exact header number, and consistency with the RPC header object and artifact metadata.
- The manager account at `keccak(address)` against that header's state root, including account nonce, balance, storage root and code hash. Account absence fails. Code identity is bound to the caller's expected pin, not an RPC assertion.
- Each unique requested storage key at `keccak(32-byte slot)` against the authenticated account storage root, including authenticated absence. Claimed RPC values must equal the authenticated values. Missing, extra, duplicate or substituted keys fail. Values are emitted in expected-slot order as precise decimal strings.
- Canonical integer encodings in account/storage RLP. Authenticated absence and a present canonical RLP integer-zero leaf both decode to zero, matching the existing Solidity verifier. Public Ethereum normally deletes zero slots; the present-zero representation was observed in the actual Anvil1.5.1 Cancun lifecycle. Optional retained manager bytecode and declared value arrays, when present, must agree with authenticated data.

Python stdout additionally includes normalized slots and the explicit scope: **authenticated to the supplied execution header; canonical consensus and chain identity are not established**. Ethereum execution headers do not commit a chain ID. Matching chain metadata cannot prove a provider's network identity. The caller still must compare the returned block hash with its independently established canonical commitment/checkpoint, manage finality/reorgs, and supply slots derived from the frozen pool/range/currency. Neither a structurally valid header hash nor full MPT consistency establishes that this is the canonical endpoint. The Python script alone authenticates the JSON envelope; the Node API additionally binds the exact encoded settlement witness. No offline success authorizes payout by itself.

## Reproduction and observed results

No dependency versions changed: `rlp==4.1.0`, `eth-hash[pycryptodome]==0.7.1`, and `trie==3.1.0` remain in the existing `scripts/proof/requirements.txt`. The Python implementation uses the maintained `HexaryTrie.get_from_proof` for path verification with strict RLP decoding. The existing local environment `/tmp/feestrip-proof-venv/bin/python` contains those exact pins; system Python here lacks `rlp` and must not silently substitute structural-only validation.

From the repository root, after installing the root Node dependencies:

```sh
python3 -m venv .scratch/proof-venv
.scratch/proof-venv/bin/python -m pip install -r scripts/proof/requirements.txt
.scratch/proof-venv/bin/python -m unittest discover -s scripts/proof -p test_validate_witness.py -v
FEESTRIP_PROOF_PYTHON="$PWD/.scratch/proof-venv/bin/python" node --test packages/settlement/test/validate.test.mjs
```

The `python` option defaults to `FEESTRIP_PROOF_PYTHON`, then `python3`. Standalone Python input is one JSON object `{artifact, expected}` on stdin; successful JSON appears on stdout, validation errors on stderr with a nonzero exit. Duplicate JSON object keys are rejected. The caller-supplied Python executable and installed dependency environment are trusted execution dependencies.

Observed after integration: **13 Python tests and 9 Node tests passed**. Node tests execute the actual Python process; there is no validator success stub. Coverage includes the current decimal-string acquisition envelope, public witness reproduction, genuine retained Anvil zero-valued leaves, huge exact integers, MPT branch inclusion and missing-child absence, divergent-extension absence, empty storage tries, embedded inline descendants, absent manager rejection, header/account/storage/slot/value/code tampering, malformed/missing proof nodes, malformed ABI, changing both ABI and JSON together, input mutation while Python is running, and unavailable Python. Returned value order survives differently ordered/zero-padded RPC proof keys.

The initial integrated local run exposed an overly restrictive added policy rejecting every present zero leaf. Two independent reviewers confirmed actual outside-growth leaves authenticated to `0x80`; removing only that policy preserves all canonical integer, root, slot, claimed-value and code-pin checks. The new positive regression accepts authenticated zero and rejects substituting it beneath the original nonzero root. [Geth's normal deletion behavior](https://github.com/ethereum/go-ethereum/blob/master/core/state/state_object.go) does not make such a separate numeric restriction necessary to the existing verifier's trust boundary. This correction does not change any contract or payout formula.

The genuine retained Sepolia fixture authenticates N **11,682,191**, header hash `0x435e69c8a0f3ad2b97190657c410a92f69a2dd5a3af9241c4b55b3e2a003c3ea`, manager code hash `0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1`, and all four exact previously recorded storage values. Its state root is `0x585626f107ca43beae5f972fe21110b9e5e10d6556ce1667740598bea52f6b3c`; its authenticated manager storage root is `0x4932545c8daf40919845778e01f0de95bd38bc5286cd906edcc0fcc7fbfff2e0`. This is offline reuse of retained public bytes, not a fresh provider call or a new public settlement.

Generated tests are explicitly synthetic. To deterministically exercise inline nodes without searching Keccak preimages, one fixture inserts a decoy trie key sharing 63 nibbles with a real requested slot's hashed key. It proves the requested path through actual embedded branch/leaf structures; it does not claim a valid public Ethereum state for the synthetic header or knowledge of the decoy slot's preimage. Empty-trie absence and normal multi-slot branch paths use the same real trie library. These results supplement the existing Solidity verifier and canonical-anchor tests; they are not an independent audit of that verifier or full live financial acceptance.
