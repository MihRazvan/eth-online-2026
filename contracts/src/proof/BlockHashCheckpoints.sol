// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Permissionless permanent checkpoints of this chain's recent canonical block hashes.
/// @dev Call at N+1 through N+256 inclusive. Missing this window leaves allocation unresolved.
contract BlockHashCheckpoints {
    error BlockUnavailable(uint256 number);
    mapping(uint256 => bytes32) public hashes;
    event Checkpoint(uint256 indexed number, bytes32 blockHash);

    function checkpoint(uint256 number) external returns (bytes32 hash) {
        hash = hashes[number];
        if (hash != bytes32(0)) return hash;
        hash = blockhash(number);
        if (hash == bytes32(0)) revert BlockUnavailable(number);
        hashes[number] = hash;
        emit Checkpoint(number, hash);
    }

    function get(uint256 number) external view returns (bytes32 hash) {
        hash = hashes[number];
        if (hash == bytes32(0)) hash = blockhash(number);
        if (hash == bytes32(0)) revert BlockUnavailable(number);
    }
}
