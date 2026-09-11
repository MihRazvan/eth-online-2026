# Stack and funded offers

2026-09-11. React 19.3.0 / Vite 7.3.1 / TypeScript 5.9.3 / viem 2.56.3. Node 24, pnpm workspace, one optional SQLite data sink. Exact package versions and integrity hashes are in pnpm-lock.yaml. Vite 8's newer optional compiler peer combination was rejected for this first integration; plugin-react 5.1.4 advertises Vite 7 compatibility. Registry licenses and package scripts inspected before install; only esbuild's platform-binary installation approved.

Solidity graphs auto-detect compilers: canonical PositionManager is exactly 0.8.26 while pinned official AquaSwapVMRouter is exactly 0.8.30. Both use Cancun EVM with IR optimization. Never change canonical source pragmas merely to unify compilers.

Buyers fund exact onchain offers. Sellers explicitly accept offer IDs with minimum proceeds; approval of NFT movement does not convey sale consent. This avoids a signature/replay subsystem while preserving atomic funding, expiry and terms. Funded offers are distinct liabilities from captured fee reserves. Drafts hold no NFT.

Independent ERC20 per series enables official Aqua inventory and whole-period claim transfers. All accounting uses immutable Q. UI uses integer units. Quotes are not forecasts; exact payout remains contract proof allocation.

Analytics join Substreams history and FeeStrip Subgraph at a common block/hash, retaining source identity and lag. SQLite atomically stores block/cursor and events; reorgs require explicit rollback to a retained matching hash. Unknown history is displayed as incomplete, not zero. Graph never authorizes settlement.
