# usufruct — end-to-end test runbook

Exact frontend steps and local rehearsal commands. Read the [project brief and judge demo](TEAMMATE_BRIEF.md) for the product explanation, current limitations and separately staged examples. Public testing uses **Ethereum Sepolia** at https://usufruct-mu.vercel.app. This runbook does not authorize bypassing operational readiness or treat local tests as public acceptance.

## Current public test ticket — 13 September

| Field | Verified state / next action |
| --- | --- |
| Series / position | [Series 1](https://usufruct-mu.vercel.app/#market/1), canonical NFT 39216, USDC/WETH pool, activation 11696226, exactN 11696317 |
| Original terms | Q 10000; buyer 2,500 claims for 0.25 test USDC; seller initially 7500. Read current balances before further actions |
| Actual secondary holder | Teammate 0x746b…4C6d bought 189+63+748=1,000 claims. The initially planned agent-controlled holder did not receive those claims |
| Captured / returned | Actual late capture 1.499999 USDC; original NFT returned at 11696393 **before allocation** |
| Allocation | Public allocation observed: 0.999999 USDC sold reserve / 0.500000 residual. Teammate redemption confirmed:1,000 claims paid 0.099999 USDC; buyer 1,500 claims paid 0.149999 USDC; seller 6,500 paid0.649999 plus 0.500000 residual. All are actual confirmed payouts |
| Preservation | Keeper saved N at N+2; endpoint/receipt finalized; remote proof restored into fresh local DB/two copies using 2 GETs, zero writes and no RPC witness fallback |
| Graph | Actual live joined series 1 query verified at 11696247; partial earning history 22/22 known blocks, all in range |
| Immediate owners | Lead preserves confirmed receipts/reserve accounting and maintains the backed judge quote. Teammate redemption is confirmed. Team records confusion, tests a fresh repeat session and completes human submission |

Confirmed payouts are **0.099999 USDC** for the teammate’s 1,000 claims, **0.149999 USDC** for the original buyer’s 1,500 claims, and **0.649999 USDC** for the seller’s 6,500 claims. The seller separately withdrew the **0.500000 USDC residual**. A later controlled holder bought **10 claims for 0.000500 USDC** and redeemed them for **0.000999 USDC** through the updated public UI. Current totals are **9,010 claims redeemed / 0.900996 USDC paid / 0.099003 USDC retained**, with **990 funded, unredeemed claims** reserved for judges. A single redemption of those 990 claims would pay 0.098999 USDC and leave four micro-USDC of rounding dust; splitting redemptions may increase dust. The reserve remains a liability, not available project cash. [Complete public lifecycle evidence](evidence/operations/live-series-one-lifecycle.md).

The controlled repeat [purchase](https://sepolia.etherscan.io/tx/0x239f863f30530277460a0ef8f05f03724196cf0f6cecc9767c894fb27a93b909) and [redemption](https://sepolia.etherscan.io/tx/0xd82bf3a5625e43d8e5018024cc546b87c84ebf8cbe4469ad3dc3d45452bdeb50) extend the earlier lifecycle snapshot. They are actual canonical receipt observations, not a claim of finality or a second unaided human session.

The renewed **990-claim / 0.049500-USDC ask**, expiring **20 September at 14:45 UTC**, is reviewed but its publication receipt is still pending at this checkpoint. Treat the older quote as stale after the redemption. Fresh executable inventory must be checked before inviting another buyer.

[Receipts and sponsor evidence](evidence/sponsors.md), [remote restoration](evidence/operations/live-series-one-restore.json), [native endpoint comparison](evidence/operations/live-series-one-native-oracle.md), [live Graph join](evidence/operations/live-series-one-graph.md). This was controlled public testing with funded donations. It is not yet a completed unaided user study.

**Continue this series from its actual current state.** Do not republish, fund again, repeat capture or return the NFT again to follow an old checklist. Allocation being observed does not mean a pending redemption succeeded. Review the correct current claim balance and predicted payout, sign once, retain the receipt, and compare the actual USDC increase. The original Q remains 10000 after other holders redeem. A fresh judge needs an executable quote backed by unredeemed inventory; renew quotes after relevant state changes.

## End-to-end test: exact manual flow

### 1. Prepare the people, assets and operator

Use separate browser profiles/wallet contexts:

- **S — seller:** owns an eligible, nonempty canonical v4 NFT. Supported USDC must be one currency; hooks/subscription restrictions must pass the app’s validation.
- **B — funding buyer / maker:** a different wallet, with Sepolia ETH and supported test USDC. It can later publish some acquired claims for sale.
- **C — secondary buyer:** a third wallet, with gas and test USDC, to demonstrate a genuine claim transfer and independent redemption.
- **Operator:** runs checkpoint/proof preservation before activation, monitors the deadline, arranges controlled pool activity and retains evidence. This role is not a payout authority.

Two people can coordinate these roles, but three wallet contexts make the full trade/redemption demonstration clearer. Share public addresses only. Previously discovered NFTs include 39216 and 39220–39222; verify current ownership/eligibility rather than assuming a fixed role from an old session.

Before a public sale, require fresh deployment-matching `/api/operations` readiness for **protocol, keeper, retention and replication**, and inspect the operator’s current restart/remote-restoration evidence. The actual series 1 drill is complete; later series still need continuous preservation. Fund gas for every wallet, including potentially expensive proof allocation. Use the app’s links for authentic Sepolia test USDC and ETH; do not use mainnet funds or arbitrary tokens named “USDC”.

Record a test ticket: app commit, network, S/B/C addresses, NFT ID, upfront payment, sold percentage, Q, exact N, acceptance deadline in UTC, offer link, resulting series link and operator. For a small rehearsal, **0.25 test USDC / 25% sold** is an example to agree on, not a standing instruction to fund a particular NFT. Choose N with comfortable time for both wallets and activity. Read and replace the current form defaults deliberately; never assume an earlier screenshot’s terms are still selected.

### 2. Publish, fund and activate — two different wallets

Publishing requires an available persistent listing service. Only standard EOA signatures are supported currently. New funding and acceptance additionally require operational settlement readiness. If the service is unavailable, an editable draft is not a published listing.

| Who | Click / check | Expected result |
| --- | --- | --- |
| S | **Pin a seed → Choose position**; find/select the exact eligible NFT | Verify owner, pool, liquidity and range. |
| S | **Set listing**; set share, asking USDC, exact earning end block and acceptance deadline | The amount is payment for this exact share. There is no verified fee forecast or promised return. |
| S | **Review listing → Sign and publish listing** | Sign typed data, without gas or NFT approval. A durable listing link opens; NFT ownership and balances stay unchanged. |
| B | Open the listing link, connect a different wallet → **Review exact funding → Fund offer** | Inspect the same signed terms; approve USDC if requested, then fund the refundable onchain offer. There are no claims yet. |
| B | **Holdings → Your funded offers → Copy offer link** | Share the actual exact-offer link with S, e.g. `#pin/39220?offer=3`. |
| S | Open that link, or choose **3 · Funded offers**; check the selected funded offer → **1. Approve this NFT → Approve NFT transfer** | Only NFT approval is confirmed. |
| S | **2. Review funded sale → Accept exact funded terms** | Seller receives USDC; the original NFT enters escrow; bought/retained claims are minted once. Record the series ID. |

The direct position-link buyer proposal also remains available. A buyer can propose exact terms for the owner to accept without a published advertisement.

**If sale review is disabled after approval:** check that B actually funded an offer and S selected it. Check owner/network, project readiness, deadline/cutoff and unchanged liquidity/range. Approval alone is never a sale. Publishing or funding does not automatically create a secondary-market ask.

Test **Withdraw listing** separately: it is a gasless signed withdrawal of the advertisement, not a refund or NFT transaction. Existing funded offers remain cancellable by their buyers. Several buyers can fund competing offers; publishing does not reserve the NFT. After a lost publication response/reload, use the saved draft to retry the exact same signed terms. Forgetting a browser draft does not withdraw a server listing.

### 3. Trade the issued claims

1. B opens **Holdings → Publish sell quote** and chooses **Sell claims (ask)**. Set a small **Claim quantity**, **Total USDC ask** and **Expires in minutes**. Set a reviewed small amount and price; do not reuse a placeholder default or already depleted quote.
2. B selects **Review maker quote → Approve and publish quote**. Complete the required approval and publication actions. Inventory remains in B’s wallet; Aqua allocations do not create extra capital.
3. C opens the issued claim from Market, sets **Claims to buy**, then **Review purchase → Confirm claim purchase**. Complete USDC approval if requested.
4. Verify actual USDC and FeeClaim balance changes for B and C. Show C’s cabinet and saved receipt. Leave both wallets with claims for independent payout testing.

Also exercise a **Buy claims (bid)** and **Review claim sale → Confirm claim sale** in the extended test. Test maker cancellation via **Your maker quotes → Review quote cancellation → Cancel this maker quote**. Never mistake a listed but depleted/expired quote for available liquidity.

### 4. Cross the endpoint, return the NFT and pay holders

1. Generate **controlled, funded pool activity** before N and some after N. The operator supplies this; the frontend neither creates swaps nor fast-forwards Sepolia. Label test donations/activity honestly.
2. Preserve the endpoint witness and canonical checkpoint. Wait until a block strictly **after N**.
3. Open the issued claim → **Capture actual fees → Confirm transaction**. Record the collected reserve. This may include post-period USDC; it is not all owed to claim holders.
4. As S/residual owner, open **Holdings → Recover NFT #… → Confirm transaction**. Verify the same token ID returned, while allocation is still pending. This is a key demonstration.
5. Once recovery shows the exact finalized proof is available, open the issued claim → **Allocate fee reserve → Confirm transaction**. The app uses authenticated proof recovery or the exact verified onchain growth cache. It does not accept a manually typed payout amount. If proof is unavailable, leave the reserve protected and show the recovery state.
6. B and C separately open **Holdings → Read claim & recovery** for this series, then **Redeem … claims → Confirm transaction**. Disconnect S while doing this. The current UI redeems each wallet’s whole remaining claim balance. Compare actual payouts with original-Q entitlement; tiny amounts can round down to zero micro-USDC.
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

