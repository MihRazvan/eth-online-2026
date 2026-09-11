# Static analysis

Slither0.11.5 analyzed first-party deployed contracts after the Aqua callback correction. The analyzer reported13 findings:4 medium,6 low and3 informational. These are reviewed findings, **not a clean analyzer report or an audit**. No high finding was reported.

The committed `scripts/static/slither-reviewed.json` records every exact description, fingerprint and disposition. Zero-initialized memory and an intentionally unused native liquidity return account for the medium findings. The low findings concern nonReentrant entrypoints with state writes after pinned dependency calls, and timestamps deliberately used for offer/trade expiry. The exact sold endpoint remains a block number. The informational findings cover proof-validator complexity, a virtual dispatcher proven reachable by actual Aqua transfers, and the bounded compiler pragma shared between two pinned compilation graphs.

Run `python3 scripts/static/check.py`. Analyzer failure or any finding delta fails the check; the baseline is never silently regenerated. Line changes can require fresh review. Vendored code, test harnesses, deployment scripts and unrestricted local faucet fixtures are excluded from this first-party report. This scope does not establish the safety of dependencies or production deployments.
