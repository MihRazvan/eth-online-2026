// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {HistoricalFeeVerifier} from "../../contracts/src/proof/HistoricalFeeVerifier.sol";
import {BlockHashCheckpoints} from "../../contracts/src/proof/BlockHashCheckpoints.sol";

interface ProofVm {
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
    function parseJsonUint(string calldata, string calldata) external pure returns (uint256);
    function parseJsonInt(string calldata, string calldata) external pure returns (int256);
    function parseJsonAddress(string calldata, string calldata) external pure returns (address);
    function parseJsonBytes32(string calldata, string calldata) external pure returns (bytes32);
    function parseJsonBool(string calldata, string calldata) external pure returns (bool);
}

/// @notice Run on fork at retained witness block N+1. No setBlockhash, etch, or injected state root.
interface ForkVm {
    function createSelectFork(string calldata, uint256) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
    function prank(address) external;
}

interface NativePositionManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }
    function getPoolAndPositionInfo(uint256) external view returns (PoolKey memory, uint256);
    function ownerOf(uint256) external view returns (address);
    function modifyLiquidities(bytes calldata, uint256) external payable;
}

interface NativeStateView {
    function getPositionInfo(bytes32, address, int24, int24, bytes32) external view returns (uint128, uint256, uint256);
}

interface BalanceToken {
    function balanceOf(address) external view returns (uint256);
}

contract VerifyPublic {
    ProofVm constant vm = ProofVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    event GasMeasured(string step, uint256 gasUsed);

    function run() external {
        string memory j = vm.readFile("scripts/proof/sepolia-witness.json");
        uint256 n = vm.parseJsonUint(j, ".blockNumber");
        require(block.chainid == 11155111 && block.number == n + 1, "fork at N+1 on Sepolia");
        BlockHashCheckpoints cache = new BlockHashCheckpoints();
        uint256 beforeGas = gasleft();
        bytes32 h = cache.checkpoint(n);
        emit GasMeasured("checkpoint", beforeGas - gasleft());
        require(h == vm.parseJsonBytes32(j, ".blockHash"), "canonical BLOCKHASH mismatch");
        HistoricalFeeVerifier v = new HistoricalFeeVerifier(vm.parseJsonAddress(j, ".manager"), cache);
        bytes memory witness = vm.parseJsonBytes(j, ".witness");
        beforeGas = gasleft();
        uint256 actual = v.verify(
            n,
            vm.parseJsonBytes32(j, ".poolId"),
            int24(vm.parseJsonInt(j, ".tickLower")),
            int24(vm.parseJsonInt(j, ".tickUpper")),
            vm.parseJsonBool(j, ".usdcIsCurrency0"),
            witness
        );
        emit GasMeasured("header/account/four-slot verification", beforeGas - gasleft());
        require(actual == vm.parseJsonUint(j, ".feeGrowthInsideX128"), "native growth mismatch");
        nativeCollectionAtN(j, actual);
    }
    event CollectionCompared(uint256 nativeCollected, uint256 computed, uint256 liquidity, uint256 baseline);

    function nativeCollectionAtN(string memory j, uint256 growth) internal {
        ForkVm f = ForkVm(address(vm));
        f.createSelectFork(
            f.envOr("PROOF_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com"), vm.parseJsonUint(j, ".blockNumber")
        );
        NativePositionManager pm = NativePositionManager(vm.parseJsonAddress(j, ".positionManager"));
        uint256 tokenId = vm.parseJsonUint(j, ".tokenId");
        (NativePositionManager.PoolKey memory key,) = pm.getPoolAndPositionInfo(tokenId);
        address owner = pm.ownerOf(tokenId);
        (uint128 liquidity, uint256 g0, uint256 g1) = NativeStateView(0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C)
            .getPositionInfo(
                vm.parseJsonBytes32(j, ".poolId"),
                address(pm),
                int24(vm.parseJsonInt(j, ".tickLower")),
                int24(vm.parseJsonInt(j, ".tickUpper")),
                bytes32(tokenId)
            );
        uint256 baseline = vm.parseJsonBool(j, ".usdcIsCurrency0") ? g0 : g1;
        uint256 delta;
        unchecked {
            delta = growth - baseline;
        }
        // This retained position fits the direct product; production allocation uses FullMath.
        require(delta <= type(uint256).max / liquidity, "sample overflow");
        uint256 expected = uint256(liquidity) * delta / (1 << 128);
        BalanceToken usdc = BalanceToken(vm.parseJsonAddress(j, ".usdc"));
        uint256 beforeBalance = usdc.balanceOf(owner);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, owner);
        f.prank(owner);
        uint256 beforeGas = gasleft();
        pm.modifyLiquidities(abi.encode(hex"0111", params), block.timestamp + 1);
        emit GasMeasured("native zero-liquidity fee collection at N", beforeGas - gasleft());
        uint256 collected = usdc.balanceOf(owner) - beforeBalance;
        require(collected == expected, "native collection mismatch");
        emit CollectionCompared(collected, expected, liquidity, baseline);
    }
}
