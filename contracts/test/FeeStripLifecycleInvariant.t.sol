// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {FeeStripBase} from "./FeeStrip.t.sol";
import {FeeStrip} from "../src/FeeStrip.sol";
import {LifecycleHandler} from "./LifecycleHandler.sol";

contract FeeStripLifecycleInvariantTest is FeeStripBase {
    LifecycleHandler internal lifecycleHandler;

    function setUp() public override {
        super.setUp();
        uint256[4] memory ids = [nft, _mint(seller), _mint(seller), _mint(seller)];
        address[3] memory actors = [seller, buyer, holder];
        for (uint256 a; a < 3; a++) {
            token0.mint(actors[a], 1e15);
            vm.startPrank(actors[a]);
            token0.approve(address(strip), type(uint256).max);
            posm.setApprovalForAll(address(strip), true);
            vm.stopPrank();
        }
        lifecycleHandler = new LifecycleHandler(strip, posm, token0, endpoint, donor, key, actors, ids);
        // Intentionally no funding, activation, capture or allocation in setup.
        bytes4[] memory selectors = new bytes4[](15);
        selectors[0] = lifecycleHandler.fund.selector;
        selectors[1] = lifecycleHandler.accept.selector;
        selectors[2] = lifecycleHandler.cancel.selector;
        selectors[3] = lifecycleHandler.earlyClose.selector;
        selectors[4] = lifecycleHandler.advance.selector;
        selectors[5] = lifecycleHandler.accrue.selector;
        selectors[6] = lifecycleHandler.capture.selector;
        selectors[7] = lifecycleHandler.returnNFT.selector;
        selectors[8] = lifecycleHandler.settle.selector;
        selectors[9] = lifecycleHandler.redeem.selector;
        selectors[10] = lifecycleHandler.withdrawResidual.selector;
        selectors[11] = lifecycleHandler.transferClaim.selector;
        selectors[12] = lifecycleHandler.moveResidual.selector;
        selectors[13] = lifecycleHandler.directDonation.selector;
        selectors[14] = lifecycleHandler.lifecycle.selector;
        targetSelector(FuzzSelector(address(lifecycleHandler), selectors));
        targetContract(address(lifecycleHandler));
    }

    function invariantDynamicRightsCustodyAndReserves() public view {
        uint256 liability;
        for (uint256 id = 1; id < strip.nextSeriesId(); id++) {
            FeeStrip.Series memory s = strip.series(id);
            assertEq(s.claim.totalSupply() + lifecycleHandler.modelBurned(id), s.quantity);
            assertEq(
                s.claim.balanceOf(seller) + s.claim.balanceOf(buyer) + s.claim.balanceOf(holder), s.claim.totalSupply()
            );
            if (!s.nftReturned && !s.closed) {
                assertEq(posm.ownerOf(s.tokenId), address(strip));
                assertEq(posm.getPositionLiquidity(s.tokenId), L);
            }
            assertEq(s.paidClaims, lifecycleHandler.modelPaid(id));
            if (s.allocated) assertEq(s.soldUSDC, lifecycleHandler.nativeSold(id));
            assertLe(s.paidClaims, s.soldUSDC);
            if (s.closed) {
                assertEq(s.residualOwner, address(0));
                assertTrue(s.nftReturned);
                assertEq(s.claim.totalSupply(), 0);
            }
            liability += lifecycleHandler.modelCaptured(id) - lifecycleHandler.modelPaid(id)
            - lifecycleHandler.modelResidualPaid(id);
        }
        assertEq(strip.fundedOfferUSDC(), lifecycleHandler.modelFunded());
        assertEq(strip.reservedUSDC(), liability);
        assertGe(token0.balanceOf(address(strip)), liability + lifecycleHandler.modelFunded());
    }

    function testDynamicHandlerCompletesMaturityAndEarlyClosureFromUnfundedNFTs() public {
        assertEq(strip.nextSeriesId(), 1);
        assertEq(strip.nextOfferId(), 1);
        lifecycleHandler.lifecycle(0, false);
        lifecycleHandler.lifecycle(1, true);
        // Resell the exact returned first NFT while its earlier holders retain unpaid claims.
        uint256 oldUnredeemedSupply = strip.series(1).claim.totalSupply();
        assertGt(oldUnredeemedSupply, 0);
        assertGt(strip.series(1).soldUSDC - strip.series(1).paidClaims, 0);
        lifecycleHandler.lifecycle(0, false);
        assertEq(strip.series(1).claim.totalSupply(), oldUnredeemedSupply);
        assertEq(lifecycleHandler.funds(), 3);
        assertEq(lifecycleHandler.accepts(), 3);
        assertEq(lifecycleHandler.earlyClosures(), 1);
        assertEq(lifecycleHandler.captures(), 2);
        assertEq(lifecycleHandler.returnsBeforeProof(), 2);
        assertEq(lifecycleHandler.settlements(), 2);
        assertGt(lifecycleHandler.redemptions(), 0);
        assertGt(lifecycleHandler.blockAdvances(), 0);
        invariantDynamicRightsCustodyAndReserves();
    }
}
