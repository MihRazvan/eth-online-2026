# Prior evidence: scope and limits

These archives preserve earlier research experiments, not a working FeeStrip implementation. Inspect their manifests and source versions before reuse. Some notes refer to old scratch paths; adapt paths explicitly.

| Archive | What it contains | What it does not establish |
| --- | --- | --- |
| `FeeStrip_Research_Evidence.zip` | Isolated canonical Uniswap tests, synthetic historical-proof fixtures and independent arithmetic models from the feasibility pass | A genuine public-chain FeeStrip witness, authenticated end-to-end settlement or production gas cost |
| `FeeStrip_Code_Review_Evidence.zip` | Source-review material and isolated upstream/component tests and models | An integrated FeeStrip sale/trade/redemption lifecycle or a security audit |
| `FeeStrip_Final_Research_Evidence.zip` | Final predecessor/sponsor research and source snapshots | A deployed Aqua claim market or two live Graph products composed by FeeStrip |

Earlier experiments included eight native-Uniswap test cases (with two fuzz tests at 512 runs), nine Solidity synthetic-proof cases (including a 128-run fuzz test), and separate model/component work. Consult each archive for exact commands and scope before quoting results. ScopeLift's tests were read, not executed in the final comparison.

The earlier synthetic verifier measurement of 1,212,180 gas excluded authenticated-header and complete settlement costs. It is not a complete transaction or affordability estimate. Capture, proof authentication, allocation, NFT return and redemption require full measurements on the implemented path.

All new application acceptance gates begin pending. Preserve the distinction between local fixtures, pinned forks and public-chain transactions in the implementation evidence.
