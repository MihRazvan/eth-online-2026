// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPositionDescriptor} from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {LocalToken, LocalActivityRouter} from "../src/demo/LocalFixtures.sol";

/// @notice Local Anvil chain 31337 only. Authentic canonical source; clearly labeled faucet currencies.
/// Deploy BlockHashCheckpoints, HistoricalFeeVerifier and FeeStrip next using their artifacts.
contract DeployLocalNative is Script {
    event LocalNativeDeployed(address poolManager, address positionManager, address usdc, address other, address router, uint256 tokenId, uint128 liquidity);

    function run(address seller, address buyer) external returns (address, address, address, address, address, uint256) {
        require(block.chainid == 31337, "LOCAL_CHAIN_ONLY");
        require(seller != address(0) && buyer != address(0), "ZERO_ACTOR");
        vm.startBroadcast();
        PoolManager manager = new PoolManager(seller);
        PositionManager posm = new PositionManager(manager, IAllowanceTransfer(address(0)), 50_000, IPositionDescriptor(address(0)), IWETH9(address(0)));
        LocalToken usdc = new LocalToken("Local USD Coin fixture", "USDC");
        LocalToken other = new LocalToken("Local other-currency fixture", "TEST");
        (Currency c0, Currency c1) = address(usdc) < address(other) ? (Currency.wrap(address(usdc)), Currency.wrap(address(other))) : (Currency.wrap(address(other)), Currency.wrap(address(usdc)));
        PoolKey memory key = PoolKey(c0, c1, 3000, 60, IHooks(address(0)));
        manager.initialize(key, uint160(1 << 96));
        LocalActivityRouter router = new LocalActivityRouter(manager, key);
        usdc.mint(seller, 50_000e6); usdc.mint(buyer, 50_000e6);
        other.mint(seller, 50_000e6); other.mint(buyer, 50_000e6);
        // Mint the unchanged individual position through native PosM with pre-funded settlement.
        usdc.mint(address(posm), 1e12); other.mint(address(posm), 1e12);
        bytes[] memory p = new bytes[](5);
        p[0] = abi.encode(key, int24(-120), int24(120), uint256(1e12), type(uint128).max, type(uint128).max, seller, bytes(""));
        p[1] = abi.encode(c0, uint256(0), false); p[2] = abi.encode(c1, uint256(0), false);
        p[3] = abi.encode(c0, seller); p[4] = abi.encode(c1, seller);
        uint256 tokenId = posm.nextTokenId();
        posm.modifyLiquidities(abi.encode(abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE), uint8(Actions.SETTLE), uint8(Actions.SWEEP), uint8(Actions.SWEEP)), p), block.timestamp + 1 hours);
        emit LocalNativeDeployed(address(manager), address(posm), address(usdc), address(other), address(router), tokenId, 1e12);
        vm.stopBroadcast();
        return (address(manager), address(posm), address(usdc), address(other), address(router), tokenId);
    }
}
