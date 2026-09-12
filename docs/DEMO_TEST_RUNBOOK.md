# usufruct — end-to-end test runbook

Exact frontend steps and local rehearsal commands. Read the [project brief and judge demo](TEAMMATE_BRIEF.md) for the product explanation, current limitations and separately staged examples. Public testing uses **Ethereum Sepolia** at https://usufruct-mu.vercel.app. This runbook does not authorize bypassing operational readiness or treat local tests as public acceptance.

## End-to-end test: exact manual flow

### 1. Prepare the people, assets and operator

Use separate browser profiles/wallet contexts:

- **S — seller:** owns an eligible, nonempty canonical v4 NFT. Supported USDC must be one currency; hooks/subscription restrictions must pass the app’s validation.
- **B — funding buyer / maker:** a different wallet, with Sepolia ETH and supported test USDC. It can later publish some acquired claims for sale.
- **C — secondary buyer:** a third wallet, with gas and test USDC, to demonstrate a genuine claim transfer and independent redemption.
- **Operator:** runs checkpoint/proof preservation before activation, monitors the deadline, arranges controlled pool activity and retains evidence. This role is not a payout authority.

Two people can coordinate these roles, but three wallet contexts make the full trade/redemption demonstration clearer. Share public addresses only. Previously discovered NFTs include 39216 and 39220–39222; verify current ownership/eligibility rather than assuming a fixed role from an old session.

Before a public sale, require fresh deployment-matching `/api/operations` readiness for **protocol, keeper, retention and replication**, and complete the operator’s restart/remote-restoration rehearsal. Fund gas for every wallet, including potentially expensive proof allocation. Use the app’s links for authentic Sepolia test USDC and ETH; do not use mainnet funds or arbitrary tokens named “USDC”.

Record a test ticket: app commit, network, S/B/C addresses, NFT ID, upfront payment, sold percentage, Q, exact N, acceptance deadline in UTC, offer link, resulting series link and operator. For a small rehearsal, **0.25 test USDC / 25% sold** is an example to agree on, not a standing instruction to fund a particular NFT. Choose N with comfortable time for both wallets and activity. The form’s default is **1 USDC / 80% / +600 blocks / one-hour acceptance deadline**; replace defaults deliberately.

### 2. Fund and activate — two different wallets

| Who | Click / check | Expected result |
| --- | --- | --- |
| S | **Pin a tree → NFT ID or Uniswap link → Find position → Copy position link** | The exact eligible NFT and owner appear. The link looks like `#pin/39220`. |
| B | Open S’s link → **Fund an offer**. Set **Upfront USDC**, **Sold share (%)**, **Exact end block**, **Accept before (UTC)** | Recheck the NFT, owner, range/liquidity and immutable Q. End block must remain more than 32 blocks ahead; deadline more than one minute ahead. |
| B | **Review funding → Fund offer**; approve USDC if requested, then submit funding | USDC enters offer escrow. There are still no claims and no activated sale. |
| B | **My cabinet → Your funded offers → Copy offer link** | Send the generated exact-offer link to S, e.g. `#pin/39220?offer=3`. Use the actual ID, not this example. |
| S | Open the link; check **Funded offer to review** → **1. Approve this NFT → Approve NFT transfer** | Only NFT approval is confirmed. |
| S | **2. Review funded sale → Accept exact funded terms** | Seller receives the agreed USDC; the original NFT enters escrow; B and S receive their bought/retained claims. Record the new series ID/link. |

**If sale review is disabled after approval:** first check that B really funded an offer and that S opened its exact link. Also check the connected owner/network, operational readiness, deadline/cutoff and whether the position changed. Approval alone is never an agreement or payment. A funded offer does not automatically create a secondary-market ask.

### 3. Trade the issued claims

1. B opens **My cabinet → Publish sell quote** and chooses **Sell claims (ask)**. Set a small **Claim quantity**, **Total USDC ask** and **Expires in minutes**. Replace the maker form’s 1,000-claim / 84-USDC defaults.
2. B selects **Review maker quote → Approve and publish quote**. Complete the required approval and publication actions. Inventory remains in B’s wallet; Aqua allocations do not create extra capital.
3. C opens the issued claim from Orchard, sets **Claims to buy**, then **Review purchase → Confirm claim purchase**. Complete USDC approval if requested.
4. Verify actual USDC and FeeClaim balance changes for B and C. Show C’s cabinet and saved receipt. Leave both wallets with claims for independent payout testing.

Also exercise a **Buy claims (bid)** and **Review claim sale → Confirm claim sale** in the extended test. Test maker cancellation via **Your maker quotes → Review quote cancellation → Cancel this maker quote**. Never mistake a listed but depleted/expired quote for available liquidity.

### 4. Cross the endpoint, return the NFT and pay holders

1. Generate **controlled, funded pool activity** before N and some after N. The operator supplies this; the frontend neither creates swaps nor fast-forwards Sepolia. Label test donations/activity honestly.
2. Preserve the endpoint witness and canonical checkpoint. Wait until a block strictly **after N**.
3. Open the issued claim → **Capture actual fees → Confirm transaction**. Record the collected reserve. This may include post-period USDC; it is not all owed to claim holders.
4. As S/residual owner, open **My cabinet → Recover NFT #… → Confirm transaction**. Verify the same token ID returned, while allocation is still pending. This is a key demonstration.
5. Open the issued claim → **Allocate fee reserve → Confirm transaction**. The app uses authenticated proof recovery or the exact verified onchain growth cache. It does not accept a manually typed payout amount. If proof is unavailable, leave the reserve protected and show the recovery state.
6. B and C separately open **My cabinet → Read claim & recovery** for this series, then **Redeem … claims → Confirm transaction**. Disconnect S while doing this. The current UI redeems each wallet’s whole remaining claim balance. Compare actual payouts with original-Q entitlement; tiny amounts can round down to zero micro-USDC.
7. As the residual beneficiary, use **Withdraw residual fees** for separately available residual funds. Do not count retained fee claims twice as residual income.

Retain receipts and before/after balances for funding, acceptance, trade, capture, NFT return, allocation and both redemptions. Check that NFT return preceded allocation, and disclose any operator assistance.

### 5. Recovery and repeatability checks

- Create a **separate unaccepted offer**; B uses **Your funded offers → Review cancellation → Cancel offer and recover USDC**. Expiry alone does not refund it. This is not cancellation of an accepted sale.
- Reject a wallet prompt; reload during a pending transaction; change wallet/network during review. The app must require the correct review and avoid a duplicate submission.
- For a replaced transaction, use **Saved transaction receipts → Replaced or cancelled in your wallet?**. Public reconciliation waits for finality. Do not delete browser storage or submit again to work around a pending guard.
- Test insufficient gas, unavailable proof/API, and stale, depleted or cancelled quotes. Preserve the distinction between “earning ended”, “captured”, “NFT returned” and “redeemable”.
- Repeat with another holder redeeming first. Recheck maker inventory and **publish a fresh quote after relevant series-state changes/redemptions**. There is no automatic quote renewal.

## Local rehearsal available now

Use a dedicated checkout and node: these commands reset their local chain and write generated deployment/witness files. Requirements are Node 24.12.0, pnpm 12.3.4, Foundry 1.5.1 and Python with venv support.

```sh
pnpm install --frozen-lockfile
forge build
pnpm exec playwright install chromium
python3 -m venv .scratch/brief-proof-venv
.scratch/brief-proof-venv/bin/python -m pip install -r scripts/proof/requirements.txt
export FEESTRIP_PROOF_PYTHON="$PWD/.scratch/brief-proof-venv/bin/python"
```

Start the dedicated node in another terminal:

```sh
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --hardfork cancun
```

The complete automated browser runs start their own app/recovery server and reset the node. Run them from the terminal with the Python variable set, without a conflicting dev server:

```sh
pnpm test:browser:chain
USE_VERIFIED_GROWTH_CACHE=true pnpm test:browser:chain
```

For a hands-on local demo instead:

```sh
pnpm local:reset
VITE_DATA_MODE=local VITE_ENABLE_TEST_WALLET=true pnpm dev
```

Open `http://127.0.0.1:4174/?wallet=seller`, `?wallet=buyer` and `?wallet=holder` in separate contexts and click **Connect wallet** in each. The query parameter selects a local actor; it does not connect automatically. The seed already funds **offer 1 for NFT 1** with local faucet assets; the seller can start at approval/acceptance. After acceptance and a trade, run `pnpm local:mature 1` in another terminal to create controlled donations, retain N’s witness and advance beyond N. Then perform capture → NFT return → allocation → redemption in the app. `local:mature` saves proof bytes but does not record a permanent checkpoint: complete allocation well before N+256, or have the operator record `checkpoint(N)` within its window first. Do not advance hundreds of extra blocks while presenting. Use the actual series ID if it is not 1. The automated suites cover the retained API/cache recovery variants more thoroughly.

Local unlocked wallets do **not** test a production wallet’s approval screens. Plain `pnpm dev` without the local flags is a labelled **fixture preview**, not this transactional rehearsal. See [development instructions](development.md) for isolated ports and additional regressions.

