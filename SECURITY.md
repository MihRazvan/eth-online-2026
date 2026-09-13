# Security

usufruct is a tested Ethereum Sepolia prototype. It has not received an independent professional security audit and is not offered as a production mainnet deployment.

The protocol fixes original NFT custody, liquidity, range and the sold earning window at acceptance. Historical allocation is verified onchain; analytics and backend responses cannot choose a payout. Claims use the original supply denominator after redemption. Funded offers, claim income and residual assets have separate accounting.

Important dependencies include canonical contract bindings, RPC correctness, timely blockhash preservation, historical proof availability, storage durability and upstream contract behavior. A proxy runtime pin does not freeze that proxy’s implementation. Missing proof may delay redemption; it does not make claim reserves available to the seller. Market quotes require real inventory and can become stale after a lifecycle change.

[Verification](docs/VERIFICATION.md) documents public transactions and separately labelled fork/local checks. [Static analysis](docs/evidence/static-analysis.md) records 13 reviewed findings; it is not an audit. Upstream audits do not cover this application’s integrations.

Never place wallet keys, deploy credentials or private RPC tokens in browser configuration or public issues. For a suspected security issue, use a private repository security report when available, or contact the repository owner privately before publishing sensitive details.
