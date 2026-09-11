// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHistoricalFeeVerifier} from "./IHistoricalFeeVerifier.sol";
import {BlockHashCheckpoints} from "./BlockHashCheckpoints.sol";
import {EthereumTrie} from "../../lib/proof-polytope/src/EthereumTrie.sol";
import {StorageValue} from "../../lib/proof-polytope/src/trie/Node.sol";
import {RLPReader} from "../../lib/proof-polytope/src/trie/ethereum/RLPReader.sol";

/// @notice End-of-block v4 growth authenticated by this chain's BLOCKHASH, never a server root.
/// @dev Layout: canonical v4-core 1.0 PoolManager _pools slot 6; StateLibrary offsets.
/// Deployment must select the canonical manager; its deployed codehash is frozen and proved at N.
contract HistoricalFeeVerifier is IHistoricalFeeVerifier {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;
    address public immutable poolManager;
    bytes32 public immutable managerCodeHash;
    uint256 public immutable chainId;
    BlockHashCheckpoints public immutable checkpoints;

    struct CachedGrowth {
        bool verified;
        uint256 value;
    }
    mapping(bytes32 => CachedGrowth) public endpointGrowth;
    event GrowthCached(bytes32 indexed key, uint256 value);

    error InvalidConfiguration();
    error InvalidEndpoint();
    error InvalidHeader();
    error InvalidAccount();

    constructor(address manager, BlockHashCheckpoints cache) {
        if (manager.code.length == 0 || address(cache).code.length == 0) revert InvalidConfiguration();
        poolManager = manager;
        managerCodeHash = manager.codehash;
        chainId = block.chainid;
        checkpoints = cache;
    }

    /// @param witness abi.encode(bytes rlpHeader, bytes[] accountNodes, bytes[] deduplicatedStorageNodes)
    function verify(
        uint256 endpointBlock,
        bytes32 poolId,
        int24 lower,
        int24 upper,
        bool usdcIsCurrency0,
        bytes calldata witness
    ) external view returns (uint256 insideGrowth) {
        if (
            block.chainid != chainId || endpointBlock >= block.number || lower >= upper || lower < -887272
                || upper > 887272
        ) revert InvalidEndpoint();
        CachedGrowth memory cached = endpointGrowth[endpointKey(endpointBlock, poolId, lower, upper, usdcIsCurrency0)];
        if (cached.verified) return cached.value;
        (bytes memory header, bytes[] memory accountNodes, bytes[] memory storageNodes) =
            abi.decode(witness, (bytes, bytes[], bytes[]));
        if (keccak256(header) != checkpoints.get(endpointBlock)) revert InvalidHeader();
        RLPReader.RLPItem[] memory fields = header.toRlpItem().toList();
        if (fields.length < 15 || fields[8].toUint() != endpointBlock || fields[3].toBytes().length != 32) {
            revert InvalidHeader();
        }
        bytes32 root = bytes32(fields[3].toUint());
        bytes[] memory keys = new bytes[](1);
        keys[0] = abi.encodePacked(keccak256(abi.encodePacked(poolManager)));
        StorageValue[] memory account = EthereumTrie.VerifyProof(root, accountNodes, keys);
        if (account[0].value.length == 0) revert InvalidAccount();
        fields = account[0].value.toRlpItem().toList();
        if (
            fields.length != 4 || fields[2].toBytes().length != 32 || fields[3].toBytes().length != 32
                || bytes32(fields[3].toUint()) != managerCodeHash
        ) revert InvalidAccount();
        root = bytes32(fields[2].toUint());
        bytes32[4] memory slots = storageSlots(poolId, lower, upper, usdcIsCurrency0);
        keys = new bytes[](4);
        for (uint256 i; i < 4; ++i) {
            keys[i] = abi.encodePacked(keccak256(abi.encodePacked(slots[i])));
        }
        StorageValue[] memory values = EthereumTrie.VerifyProof(root, storageNodes, keys);
        uint256[4] memory v;
        for (uint256 i; i < 4; ++i) {
            if (values[i].value.length != 0) v[i] = values[i].value.toRlpItem().toUint();
        }
        // Slot0 stores the authoritative signed tick at bits 160..183.
        int24 tick = int24(uint24(v[0] >> 160));
        if (uint160(v[0]) == 0 || tick < -887272 || tick > 887272) revert InvalidEndpoint();
        unchecked {
            uint256 below = tick >= lower ? v[2] : v[1] - v[2];
            uint256 above = tick < upper ? v[3] : v[1] - v[3];
            insideGrowth = v[1] - below - above;
        }
    }

    /// @notice Amortize one authenticated proof across series with the identical pool/range/endpoint/currency.
    function cacheGrowth(
        uint256 endpointBlock,
        bytes32 poolId,
        int24 lower,
        int24 upper,
        bool currency0,
        bytes calldata witness
    ) external returns (uint256 value) {
        bytes32 key = endpointKey(endpointBlock, poolId, lower, upper, currency0);
        value = this.verify(endpointBlock, poolId, lower, upper, currency0, witness);
        if (!endpointGrowth[key].verified) {
            endpointGrowth[key] = CachedGrowth(true, value);
            emit GrowthCached(key, value);
        }
    }

    function endpointKey(uint256 endpointBlock, bytes32 poolId, int24 lower, int24 upper, bool currency0)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(endpointBlock, poolId, lower, upper, currency0));
    }

    function storageSlots(bytes32 poolId, int24 lower, int24 upper, bool currency0)
        public
        pure
        returns (bytes32[4] memory slots)
    {
        uint256 base = uint256(keccak256(abi.encode(poolId, uint256(6))));
        unchecked {
            slots[0] = bytes32(base);
            slots[1] = bytes32(base + (currency0 ? 1 : 2));
            slots[2] = bytes32(uint256(keccak256(abi.encode(lower, base + 4))) + (currency0 ? 1 : 2));
            slots[3] = bytes32(uint256(keccak256(abi.encode(upper, base + 4))) + (currency0 ? 1 : 2));
        }
    }
}
