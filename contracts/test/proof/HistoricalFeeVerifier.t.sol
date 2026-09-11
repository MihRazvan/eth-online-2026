// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HistoricalFeeVerifier} from "../../src/proof/HistoricalFeeVerifier.sol";
import {BlockHashCheckpoints} from "../../src/proof/BlockHashCheckpoints.sol";

interface ProofVm {
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
    function parseJsonUint(string calldata, string calldata) external pure returns (uint256);
    function parseJsonInt(string calldata, string calldata) external pure returns (int256);
    function parseJsonAddress(string calldata, string calldata) external pure returns (address);
    function parseJsonBytes32(string calldata, string calldata) external pure returns (bytes32);
    function parseJsonBool(string calldata, string calldata) external pure returns (bool);
    function roll(uint256) external;
    function chainId(uint256) external;
    function etch(address, bytes calldata) external;
    function setBlockhash(uint256, bytes32) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

/// @dev Hermetic replay of retained PUBLIC witnesses. BLOCKHASH is injected only for offline tests.
/// scripts/proof/VerifyPublic.s.sol exercises actual fork BLOCKHASH without injecting it.
contract HistoricalFeeVerifierTest {
    ProofVm constant vm = ProofVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    HistoricalFeeVerifier verifier;
    BlockHashCheckpoints cache;
    bytes witness;
    bytes32 pool;
    uint256 endpoint;
    uint256 growth;
    int24 lower;
    int24 upper;
    bool currency0;
    bytes32 hash;
    event GasMeasured(string step, uint256 gasUsed);

    function setUp() public {
        string memory json = vm.readFile("../../../scripts/proof/sepolia-witness.json");
        endpoint = vm.parseJsonUint(json, ".blockNumber");
        pool = vm.parseJsonBytes32(json, ".poolId");
        hash = vm.parseJsonBytes32(json, ".blockHash");
        lower = int24(vm.parseJsonInt(json, ".tickLower"));
        upper = int24(vm.parseJsonInt(json, ".tickUpper"));
        currency0 = vm.parseJsonBool(json, ".usdcIsCurrency0");
        growth = vm.parseJsonUint(json, ".feeGrowthInsideX128");
        witness = vm.parseJsonBytes(json, ".witness");
        address manager = vm.parseJsonAddress(json, ".manager");
        vm.etch(manager, vm.parseJsonBytes(json, ".managerCode"));
        vm.chainId(11155111);
        vm.roll(endpoint + 1);
        vm.setBlockhash(endpoint, hash);
        cache = new BlockHashCheckpoints();
        verifier = new HistoricalFeeVerifier(manager, cache);
    }

    function verify(bytes memory w) internal view returns (uint256) {
        return verifier.verify(endpoint, pool, lower, upper, currency0, w);
    }

    function testRetainedPublicWitness() public {
        uint256 beforeGas = gasleft();
        uint256 actual = verify(witness);
        emit GasMeasured("header/account/four-slot growth verification", beforeGas - gasleft());
        require(actual == growth && growth > 0, "native StateView growth mismatch");
    }

    function testAuthenticatedGrowthCache() public {
        require(verifier.cacheGrowth(endpoint, pool, lower, upper, currency0, witness) == growth);
        vm.roll(endpoint + 10000);
        uint256 beforeGas = gasleft();
        require(verify("") == growth);
        emit GasMeasured("cached growth read", beforeGas - gasleft());
        vm.expectRevert();
        verifier.verify(endpoint, pool, lower, upper, !currency0, "");
    }

    function testInvalidWitnessCannotCache() public {
        vm.expectRevert();
        verifier.cacheGrowth(endpoint, pool, lower, upper, currency0, "");
        (bool exists,) = verifier.endpointGrowth(verifier.endpointKey(endpoint, pool, lower, upper, currency0));
        require(!exists);
    }

    function testPermanentCheckpoint() public {
        uint256 beforeGas = gasleft();
        require(cache.checkpoint(endpoint) == hash);
        emit GasMeasured("checkpoint", beforeGas - gasleft());
        vm.roll(endpoint + 10000);
        require(verify(witness) == growth);
        require(cache.checkpoint(endpoint) == hash, "idempotence");
    }

    function testWindowInclusive256() public {
        vm.roll(endpoint + 256);
        vm.setBlockhash(endpoint, hash);
        require(cache.checkpoint(endpoint) == hash);
    }

    function testExpiredUncachedFailsClosed() public {
        vm.roll(endpoint + 257);
        vm.expectRevert(abi.encodeWithSelector(BlockHashCheckpoints.BlockUnavailable.selector, endpoint));
        verify(witness);
    }

    function testCurrentAndFutureCannotCheckpoint() public {
        vm.expectRevert(abi.encodeWithSelector(BlockHashCheckpoints.BlockUnavailable.selector, block.number));
        cache.checkpoint(block.number);
        vm.expectRevert(abi.encodeWithSelector(BlockHashCheckpoints.BlockUnavailable.selector, block.number + 1));
        cache.checkpoint(block.number + 1);
    }

    function testWrongBlockRejected() public {
        vm.expectRevert();
        verifier.verify(endpoint + 1, pool, lower, upper, currency0, witness);
    }

    function testWrongChainRejected() public {
        vm.chainId(1);
        vm.expectRevert(HistoricalFeeVerifier.InvalidEndpoint.selector);
        verify(witness);
    }

    function testHeaderTamperRejected() public {
        (bytes memory h, bytes[] memory a, bytes[] memory s) = abi.decode(witness, (bytes, bytes[], bytes[]));
        h[h.length - 1] ^= 0x01;
        vm.expectRevert(HistoricalFeeVerifier.InvalidHeader.selector);
        verify(abi.encode(h, a, s));
    }

    function testAccountTamperRejected() public {
        (bytes memory h, bytes[] memory a, bytes[] memory s) = abi.decode(witness, (bytes, bytes[], bytes[]));
        a[0][a[0].length - 1] ^= 0x01;
        vm.expectRevert();
        verify(abi.encode(h, a, s));
    }

    function testMissingStorageRejected() public {
        (bytes memory h, bytes[] memory a,) = abi.decode(witness, (bytes, bytes[], bytes[]));
        vm.expectRevert();
        verify(abi.encode(h, a, new bytes[](0)));
    }

    function testStorageTamperRejected() public {
        (bytes memory h, bytes[] memory a, bytes[] memory s) = abi.decode(witness, (bytes, bytes[], bytes[]));
        s[0][s[0].length - 1] ^= 0x01;
        vm.expectRevert();
        verify(abi.encode(h, a, s));
    }

    function testOtherManagerRejected() public {
        address other = address(0xbeef);
        vm.etch(other, hex"00");
        verifier = new HistoricalFeeVerifier(other, cache);
        vm.expectRevert();
        verify(witness);
    }

    function testWrongCodeHashRejected() public {
        address manager = verifier.poolManager();
        vm.etch(manager, hex"00");
        verifier = new HistoricalFeeVerifier(manager, cache);
        vm.expectRevert(HistoricalFeeVerifier.InvalidAccount.selector);
        verify(witness);
    }

    function testFuzzWrongPoolCannotAlias(bytes32 different) public {
        if (different == pool) return;
        (bool ok, bytes memory out) = address(verifier)
            .staticcall(abi.encodeCall(verifier.verify, (endpoint, different, lower, upper, currency0, witness)));
        // Another authenticated pool is allowed only if its actual slots were present in the witness;
        // an absent pool must be rejected, not converted into invented growth.
        require(!ok || abi.decode(out, (uint256)) != growth, "substituted pool aliased entitlement");
    }
}
