# Local native deployment fixture

AI-assisted by OpenAI Codex. `contracts/script/DeployLocalNative.s.sol` broadcasts actual unmodified v4 PoolManager/PositionManager deployments and creates NFT #1 for a supplied seller. It is restricted to chain 31337. The two unrestricted six-decimal faucets are **local fixtures**, even though one uses the USDC ticker. PosM's unused Permit2, descriptor and WETH dependencies are zero; native ERC20 mint/fee collection paths work, NFT tokenURI and Permit2-funded minting are not offered by this fixture.

```
anvil --port 8545
forge script contracts/script/DeployLocalNative.s.sol:DeployLocalNative \
  --sig 'run(address,address)' \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --rpc-url http://127.0.0.1:8545 --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --broadcast --slow
```

These are public default Anvil addresses, not credentials. Use a fresh dedicated local chain. The script returns PoolManager, PositionManager, USDC fixture, other fixture, activity router and NFT ID in that order. Its emitted `LocalNativeDeployed` event provides the same data plus liquidity. All positions use hookless 0.3% fee, tick spacing 60, ticks [-120,120], initial sqrtPriceX96=2^96 and L=10^12. No endpoint or FeeStrip contract is mocked/deployed here: deploy BlockHashCheckpoints, the real HistoricalFeeVerifier bound to this manager, and FeeStrip next from their compiled artifacts. The market's 0.8.30 graph can deploy independently without importing the exact-0.8.26 canonical implementation.

Verified on an isolated local Anvil port 18547: deployment broadcast succeeds, NFT #1 belongs to seller with L=10^12, funded donation reduces buyer balances by 200 USDC/150 TEST, and the native swap spends 100 USDC and receives 99.690060 TEST. Receipts and exact deltas are retained in `local-native-fixture.json`; these hashes are **local**, not explorer links. The swap/donation router pulls the caller's approved balances. It has no access to FeeStrip reserves. The router is a test activity generator without user slippage protection; do not expose it as a production swap product.

The first draft used a simulation-time timestamp as the mint deadline; actual broadcast correctly rejected the stale deadline. The fixture now allows one hour between simulation and inclusion. No economic test expectation was weakened.
