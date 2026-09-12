// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FeeStripBase} from "./FeeStrip.t.sol";
import {FeeStrip} from "../src/FeeStrip.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

contract FundedCommitmentTest is FeeStripBase {
    function _removeLiquidity(uint128 amount) private {
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(nft, uint256(amount), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, seller);
        vm.prank(seller);
        posm.modifyLiquidities(
            abi.encode(abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR)), params),
            block.timestamp
        );
    }

    function _fundReviewed(bytes32 reviewed) private returns (uint256) {
        vm.prank(buyer);
        return strip.fundOffer(seller, nft, Q, Q * 3 / 4, 100e6, END, uint64(block.timestamp + 1 days), reviewed);
    }

    function testCurrentCommitmentMatchesIndependentPoolRangeLiquidityEncoding() public view {
        assertEq(strip.positionCommitment(nft), keccak256(abi.encode(key, int24(-120), int24(120), L)));
    }

    function testFuzzSellerLiquidityChangeBeforeFundingCannotSubstituteReviewedExposure(uint128 removalSeed) public {
        uint128 removed = uint128(bound(removalSeed, 1, L - 1));
        bytes32 reviewed = strip.positionCommitment(nft);
        // The seller front-runs the already reviewed buyer transaction, before any escrow exists.
        // No block advance is needed: the adversarial order can occur within one block.
        _removeLiquidity(removed);
        assertEq(posm.getPositionLiquidity(nft), L - removed);
        assertTrue(strip.positionCommitment(nft) != reviewed);
        uint256 buyerBefore = token0.balanceOf(buyer);
        uint256 sellerBefore = token0.balanceOf(seller);
        uint256 escrowBefore = token0.balanceOf(address(strip));
        uint256 allowanceBefore = token0.allowance(buyer, address(strip));
        uint256 nextBefore = strip.nextOfferId();
        vm.expectRevert(FeeStrip.InvalidPosition.selector);
        _fundReviewed(reviewed);
        assertEq(token0.balanceOf(buyer), buyerBefore, "no buyer payment");
        assertEq(token0.balanceOf(seller), sellerBefore, "no sale proceeds");
        assertEq(token0.balanceOf(address(strip)), escrowBefore, "no new escrow");
        assertEq(token0.allowance(buyer, address(strip)), allowanceBefore, "allowance unconsumed");
        assertEq(strip.nextOfferId(), nextBefore, "no offer created");
        assertEq(strip.fundedOfferUSDC(), 0, "no funding liability");
        assertEq(strip.nextSeriesId(), 1, "seller cannot accept a nonexistent substituted offer");
        assertEq(posm.ownerOf(nft), seller, "NFT remains unlocked with seller");
        // Positive control: the changed position remains valid, but needs a new buyer review.
        bytes32 newlyReviewed = strip.positionCommitment(nft);
        uint256 offer = _fundReviewed(newlyReviewed);
        vm.prank(seller);
        uint256 id = strip.acceptOffer(offer, 100e6);
        assertEq(strip.series(id).liquidity, L - removed);
        assertEq(token0.balanceOf(buyer), buyerBefore - 100e6);
        assertEq(strip.series(id).quantity, Q, "original Q unchanged");
    }

    function testZeroAndWrongRangeCommitmentsCannotCreateFunding() public {
        vm.expectRevert(FeeStrip.InvalidPosition.selector);
        _fundReviewed(bytes32(0));
        // Even a valid-looking different range cannot replace the current NFT's ticks.
        bytes32 otherRange = keccak256(abi.encode(key, int24(-60), int24(120), L));
        vm.expectRevert(FeeStrip.InvalidPosition.selector);
        _fundReviewed(otherRange);
        assertEq(strip.nextOfferId(), 1);
        assertEq(strip.fundedOfferUSDC(), 0);
        assertEq(token0.balanceOf(address(strip)), 0);
    }

    function testPositionChangesAfterFundingStillCannotBeAcceptedAndBuyerCanRefund() public {
        bytes32 reviewed = strip.positionCommitment(nft);
        uint256 offer = _fundReviewed(reviewed);
        _removeLiquidity(L / 2);
        vm.prank(seller);
        vm.expectRevert(FeeStrip.InvalidPosition.selector);
        strip.acceptOffer(offer, 100e6);
        uint256 buyerBefore = token0.balanceOf(buyer);
        vm.prank(buyer);
        strip.cancelOffer(offer);
        assertEq(token0.balanceOf(buyer), buyerBefore + 100e6);
        assertEq(strip.fundedOfferUSDC(), 0);
        assertEq(posm.ownerOf(nft), seller);
    }
}
