// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
// Binding/discovery fixture only. It does not model a real funded FeeStrip sale.
contract FixtureManager {}
contract FixtureVerifier {
    uint256 public immutable chainId;
    address public immutable poolManager;
    bytes32 public immutable managerCodeHash;
    address public immutable checkpoints;
    constructor(address manager,address checkpoints_) {
        chainId=block.chainid;poolManager=manager;managerCodeHash=manager.codehash;checkpoints=checkpoints_;
    }
}
contract FixtureFeeStrip {
    struct PoolKey {address currency0;address currency1;uint24 fee;int24 tickSpacing;address hooks;}
    struct Series {
        uint256 tokenId;address claim;address residualOwner;PoolKey key;int24 tickLower;int24 tickUpper;uint128 liquidity;
        uint64 activationBlock;uint64 endBlock;uint256 baselineX128;uint256 quantity;uint256 capturedUSDC;uint256 otherReserve;
        uint256 soldUSDC;uint256 redeemedQuantity;uint256 paidClaims;uint256 residualUSDC;bool captured;bool allocated;bool nftReturned;bool closed;
    }
    address public immutable verifier;
    address public immutable poolManager;
    address public immutable usdc;
    uint256 public nextSeriesId=2;
    Series private entry;
    constructor(address verifier_,address manager,address usdc_) {
        verifier=verifier_;poolManager=manager;usdc=usdc_;
        entry.tokenId=1;entry.liquidity=100;entry.quantity=10000;entry.activationBlock=uint64(block.number);entry.endBlock=uint64(block.number+3);
    }
    function series(uint256 id) external view returns(Series memory result){if(id==1)return entry;}
}
