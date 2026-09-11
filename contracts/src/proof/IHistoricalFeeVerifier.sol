// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IHistoricalFeeVerifier {
    function poolManager() external view returns (address);
    function verify(
        uint256 endpointBlock,
        bytes32 poolId,
        int24 lower,
        int24 upper,
        bool usdcIsCurrency0,
        bytes calldata witness
    ) external view returns (uint256 feeGrowthInsideX128);
}
