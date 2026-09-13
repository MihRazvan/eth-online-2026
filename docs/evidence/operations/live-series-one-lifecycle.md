# Series 1: public financial lifecycle checkpoint

At **2026-09-13 14:37:22 UTC**, actual Sepolia series **1** had paid three distinct holders, returned original NFT **39216** to its seller, and paid the seller's post-endpoint residual. **1000Q remain outstanding** in the controlled buyer's wallet, backed by **100002 USDC micros** in FeeStrip. This is an allocated, partially redeemed series; it is not fully redeemed or a zero-reserve settlement.

The [sanitized receipt and balance evidence](live-series-one-lifecycle.json) records **30 successful public transactions**, their token transfers, gas costs and canonical block hashes. The snapshot is block **11696517**, hash `0x7957e0a744139945062406aaabe08d2c07710972afc9e473d0231fa7e8937f2c`. Every receipt header matched an independent PublicNode read. Finalized head was **11696430** at collection time, so the latest successful receipts were canonical confirmations **not yet all finalized**. Later judge-ask publication and subsequent trades are outside this checkpoint.

The buyer funded **0.25 USDC**. Seller acceptance transferred NFT39216 into FeeStrip, paid that exact price to the seller, and issued **2500Q** to the buyer and **7500Q** to the seller. Original Q is permanently **10000e18** base units. Acceptance also cleared **4768425 WETH wei** of older, non-USDC fees through FeeStrip to the seller; those fees were not sold claim income.

The intended second controlled wallet never acquired claims. A **teammate-owned wallet** instead made three real Aqua/SwapVM purchases from the original buyer. User/teammate confirmation supplies the human attribution; receipts independently establish the address activity. Each USDC payment passed through the deployed router to the maker, and the claims transferred to the teammate:

| Purchase | Claims | USDC paid |
| --- | ---: | ---: |
| First | 189Q | 0.009450 |
| Second | 63Q | 0.003150 |
| Third, after endpoint N | 748Q | 0.037400 |
| Total | 1000Q | 0.050000 |

The teammate subsequently redeemed the full **1000Q** for **0.099999 USDC**. This includes entitlement to unpaid sold-window income accrued before the purchases; the endpoint did not cancel those claims. The USDC difference is **0.049999 before ETH gas**, not a net cross-currency profit calculation.

Controlled seller-funded donations supplied **1.0 USDC before endpoint 11696317** and **0.5 USDC afterward**. These deliberately generated test fee growth; no organic revenue or repeatable investment return is established. The keeper checkpointed N. Late native capture at block **11696375** collected **1.499999 USDC**. The NFT-return receipt precedes allocation, and an independent read at the return block confirms `nftReturned=true, allocated=false`.

Allocation authenticated **0.999999 USDC** for claims and **0.500000 USDC** for the residual. This agrees with the independent [native endpoint oracle](live-series-one-native-oracle.md), [retained-proof restoration](live-series-one-restore.json), and separately scoped [live Graph join](live-series-one-graph.md). Graph did not authorize allocation.

| Holder/action | Claims consumed or transferred | USDC paid |
| --- | ---: | ---: |
| Teammate redemption | 1000Q burned | 0.099999 |
| Original buyer redemption | 1500Q burned | 0.149999 |
| Seller inventory transfer to buyer | 1000Q transferred, none burned | 0 |
| Seller redemption | 6500Q burned | 0.649999 |
| Seller residual withdrawal | No claims burned | 0.500000 |

Every redemption used `floor(amount × 999999 / originalQ)` in USDC micros. The three burns consumed **9000Q** and paid **899997 micros**. The remaining **1000Q** belong to the controlled buyer; seller, teammate and unused controlled holder each have zero claims. Seller USDC reconciled from **15.050000** to **14.199999**, buyer from zero to **0.449999**, and the unused holder from zero to **0.250000**, exactly matching the relevant receipt transfer deltas. Unrelated teammate wallet balances are omitted.

The reserve identity is exact:

`1499999 captured = 899997 paid claims + 500000 withdrawn residual + 100002 retained reserve`.

A single redemption of all remaining 1000Q would pay **99999 micros**, leaving **3 micros** permanently segregated rounding dust. Splitting later redemptions can increase dust. The retained reserve is mostly a live liability and must not be described as dust or available to the residual owner.

Recorded gas cost is **0.009688483666894931 ETH**, summing actual `gasUsed × effectiveGasPrice` across the listed transactions, including three discovered teammate USDC approvals and the keeper checkpoint. Controlled wallets plus keeper account for **0.008671921536903176 ETH**; the teammate accounts for **0.001016562129991755 ETH**. The separate **0.035 ETH** participant funding remains a funding allocation, not automatically a spent fee. Gas totals exclude earlier contract deployment/NFT mint, host setup, later judge inventory publication and unrelated wallet activity.

All values above belong to this canonical snapshot. Remaining inventory, quote validity and reserve liabilities must be read again after further purchases or redemptions. No raw signed transaction, wallet secret or credential is included.
