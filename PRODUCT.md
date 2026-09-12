# usufruct product context

The user renamed FeeStrip to **usufruct** on11September2026 and supplied the orchard/specimen design direction. `DESIGN.md` records that identity. Historical specs and deployed contract identifiers still use FeeStrip.

The product lets an LP accept USDC upfront for fractional claims to an existing Uniswap v4 position's native USDC fees during one fixed earning window. The original canonical hookless NFT enters escrow with its exact liquidity/range frozen. The same NFT is returned after late fee capture; historical proof allocation and independent redemption are separate steps. Holders own their fraction of the whole period's unpaid income, including income accrued before a transfer.

Audience: LPs assessing an upfront fee sale, buyers comparing uncertain fee claims, and makers supplying secondary liquidity. Main tasks: discover an instrument, review/fund/accept exact terms, trade existing claims, recover the original NFT and redeem verified income. Supported chain is Ethereum Sepolia for public testing; deterministic fixtures and local-chain verification remain explicitly labelled.

Economic authority and detailed acceptance gates remain `feestrip-handoff/PRODUCT_CONTRACT.md`. Current implementation and limitations are in `docs/STATUS.md`. No public end-to-end settlement, live Graph composition, human wallet acceptance, audit or commercial validation is implied by the visual redesign. The current release targets ETHOnline 2026 Classic with a working product and truthful integration evidence. See `docs/TEAMMATE_BRIEF.md` for the explanation and demo walkthrough.
