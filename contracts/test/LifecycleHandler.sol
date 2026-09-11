// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {FeeStrip} from "../src/FeeStrip.sol";
import {FeeClaim} from "../src/FeeClaim.sol";
import {TestToken, EndpointStub, NativeDonor} from "./FeeStrip.t.sol";
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/// @dev A stateful economic model. Its only historical oracle is native PosM collection
/// at an EVM snapshot when leaving N; no FeeStrip payout arithmetic derives entitlement.
contract LifecycleHandler is Test {
    using StateLibrary for IPoolManager;
    FeeStrip public strip;
    PositionManager public posm;
    IPoolManager public manager;
    TestToken public usdc;
    EndpointStub public endpoint;
    NativeDonor public donor;
    PoolKey public key;
    address[3] public actors;
    uint256[4] public nftIds;
    uint256[4] public liveOffer;
    uint256[4] public activeSeries;
    uint256 public constant QUANTITY = 1e18;
    mapping(uint256 => uint256) public offerCost;
    mapping(uint256 => address) public offerBuyer;
    mapping(uint256 => uint64) public offerEnd;
    mapping(uint256 => uint256) public seriesSlot;
    mapping(uint256 => uint256) public nativeSold;
    mapping(uint256 => uint256) public growthAtN;
    mapping(uint256 => bool) public endpointRecorded;
    mapping(uint256 => uint256) public modelCaptured;
    mapping(uint256 => uint256) public modelPaid;
    mapping(uint256 => uint256) public modelBurned;
    mapping(uint256 => uint256) public modelResidualPaid;
    uint256 public modelFunded;
    uint256 public funds;
    uint256 public cancellations;
    uint256 public accepts;
    uint256 public earlyClosures;
    uint256 public blockAdvances;
    uint256 public captures;
    uint256 public returnsBeforeProof;
    uint256 public settlements;
    uint256 public redemptions;
    uint256 public transfers;
    uint256 public donations;

    constructor(
        FeeStrip strip_,
        PositionManager posm_,
        TestToken usdc_,
        EndpointStub endpoint_,
        NativeDonor donor_,
        PoolKey memory key_,
        address[3] memory actors_,
        uint256[4] memory nftIds_
    ) {
        strip = strip_;
        posm = posm_;
        manager = posm_.poolManager();
        usdc = usdc_;
        endpoint = endpoint_;
        donor = donor_;
        key = key_;
        actors = actors_;
        nftIds = nftIds_;
    }

    function fund(uint256 slotSeed, uint256 amountSeed) public {
        uint256 slot = slotSeed % 4;
        if (activeSeries[slot] != 0 || liveOffer[slot] != 0) return;
        address seller = posm.ownerOf(nftIds[slot]);
        address buyer = actors[(slot + 1) % 3];
        if (buyer == seller) buyer = actors[(slot + 2) % 3];
        uint256 amount = 1e6 + (amountSeed % 100e6);
        uint64 end = uint64(vm.getBlockNumber() + 2 + (amountSeed % 12));
        vm.prank(buyer);
        uint256 offer = strip.fundOffer(
            seller, nftIds[slot], QUANTITY, QUANTITY * 3 / 4, amount, end, uint64(vm.getBlockTimestamp() + 1 days)
        );
        liveOffer[slot] = offer;
        offerCost[offer] = amount;
        offerBuyer[offer] = buyer;
        offerEnd[offer] = end;
        modelFunded += amount;
        funds++;
    }

    function cancel(uint256 slotSeed) public {
        uint256 slot = slotSeed % 4;
        uint256 offer = liveOffer[slot];
        if (offer == 0) return;
        uint256 beforeBalance = usdc.balanceOf(offerBuyer[offer]);
        vm.prank(offerBuyer[offer]);
        strip.cancelOffer(offer);
        assertEq(usdc.balanceOf(offerBuyer[offer]) - beforeBalance, offerCost[offer]);
        liveOffer[slot] = 0;
        modelFunded -= offerCost[offer];
        cancellations++;
    }

    function accept(uint256 slotSeed) public {
        uint256 slot = slotSeed % 4;
        uint256 offer = liveOffer[slot];
        if (offer == 0) return;
        if (offerEnd[offer] <= vm.getBlockNumber()) {
            cancel(slot);
            return;
        }
        address seller = posm.ownerOf(nftIds[slot]);
        // Independently collect preactivation fees in a temporary native snapshot.
        uint256 snap = vm.snapshotState();
        uint256 oldFees = _nativeCollect(nftIds[slot], seller);
        assertTrue(vm.revertToStateAndDelete(snap));
        uint256 beforeBalance = usdc.balanceOf(seller);
        vm.prank(seller);
        uint256 id = strip.acceptOffer(offer, offerCost[offer]);
        assertEq(usdc.balanceOf(seller) - beforeBalance, oldFees + offerCost[offer]);
        liveOffer[slot] = 0;
        activeSeries[slot] = id;
        seriesSlot[id] = slot;
        modelFunded -= offerCost[offer];
        accepts++;
    }

    function earlyClose(uint256 slotSeed) public {
        uint256 slot = slotSeed % 4;
        uint256 id = activeSeries[slot];
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        if (s.captured || s.closed || vm.getBlockNumber() >= s.endBlock) return;
        _gather(s.claim, s.residualOwner);
        uint256 snap = vm.snapshotState();
        uint256 expected = _nativeCollect(s.tokenId, address(strip));
        assertTrue(vm.revertToStateAndDelete(snap));
        uint256 beforeBalance = usdc.balanceOf(s.residualOwner);
        vm.prank(s.residualOwner);
        strip.recombine(id, s.residualOwner);
        assertEq(usdc.balanceOf(s.residualOwner) - beforeBalance, expected);
        modelBurned[id] += QUANTITY;
        activeSeries[slot] = 0;
        earlyClosures++;
    }

    function advance(uint256 amountSeed) public {
        uint256 count = 1 + (amountSeed % 18);
        for (uint256 step; step < count; step++) {
            _recordEndpoints();
            vm.roll(vm.getBlockNumber() + 1);
            vm.warp(vm.getBlockTimestamp() + 12);
            blockAdvances++;
        }
    }

    function accrue(uint256 amountSeed) public {
        // Canonical funded pool donation, distinct from unsolicited escrow transfers.
        donor.donate(key, 1e6 + (amountSeed % 100e6), 1e6 + (amountSeed % 50e6));
        donations++;
    }

    function capture(uint256 seriesSeed) public {
        uint256 id = _id(seriesSeed);
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        if (s.closed || s.captured || vm.getBlockNumber() <= s.endBlock) return;
        assertTrue(endpointRecorded[id], "advance must retain the exact N oracle");
        uint256 snap = vm.snapshotState();
        uint256 expected = _nativeCollect(s.tokenId, address(strip));
        assertTrue(vm.revertToStateAndDelete(snap));
        uint256 beforeBalance = usdc.balanceOf(address(strip));
        strip.capture(id);
        assertEq(usdc.balanceOf(address(strip)) - beforeBalance, expected);
        assertEq(strip.series(id).capturedUSDC, expected);
        assertGe(expected, nativeSold[id]);
        modelCaptured[id] = expected;
        captures++;
    }

    function returnNFT(uint256 seriesSeed) public {
        uint256 id = _id(seriesSeed);
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        if (!s.captured || s.closed || s.nftReturned) return;
        vm.prank(s.residualOwner);
        strip.withdrawNFT(id, s.residualOwner);
        assertEq(posm.ownerOf(s.tokenId), s.residualOwner);
        activeSeries[seriesSlot[id]] = 0;
        if (!s.allocated) returnsBeforeProof++;
    }

    function settle(uint256 seriesSeed) public {
        uint256 id = _id(seriesSeed);
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        if (!s.captured || s.closed || s.allocated) return;
        endpoint.set(growthAtN[id]);
        strip.settle(id, "");
        assertEq(strip.series(id).soldUSDC, nativeSold[id]);
        settlements++;
    }

    function redeem(uint256 seriesSeed, uint256 actorSeed, uint256 amountSeed) public {
        uint256 id = _id(seriesSeed);
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        if (!s.allocated || s.closed) return;
        address holder = actors[actorSeed % 3];
        uint256 balance = s.claim.balanceOf(holder);
        if (balance == 0) return;
        uint256 amount = 1 + (amountSeed % balance);
        uint256 expected = amount * nativeSold[id] / QUANTITY;
        uint256 beforeBalance = usdc.balanceOf(holder);
        vm.prank(holder);
        uint256 actual = strip.redeem(id, amount, holder);
        assertEq(actual, expected);
        assertEq(usdc.balanceOf(holder) - beforeBalance, expected);
        modelPaid[id] += expected;
        modelBurned[id] += amount;
        redemptions++;
    }

    function withdrawResidual(uint256 seriesSeed) public {
        uint256 id = _id(seriesSeed);
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        if (!s.captured || s.closed) return;
        uint256 expected = s.allocated ? modelCaptured[id] - nativeSold[id] - modelResidualPaid[id] : 0;
        uint256 beforeBalance = usdc.balanceOf(s.residualOwner);
        vm.prank(s.residualOwner);
        strip.withdrawResidual(id, s.residualOwner);
        assertEq(usdc.balanceOf(s.residualOwner) - beforeBalance, expected);
        modelResidualPaid[id] += expected;
    }

    function transferClaim(uint256 seriesSeed, uint256 actorSeed, uint256 amountSeed) public {
        uint256 id = _id(seriesSeed);
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        address from = actors[actorSeed % 3];
        uint256 balance = s.claim.balanceOf(from);
        if (balance == 0) return;
        vm.prank(from);
        s.claim.transfer(actors[(actorSeed % 3 + 1) % 3], 1 + (amountSeed % balance));
        transfers++;
    }

    function moveResidual(uint256 seriesSeed, uint256 actorSeed) public {
        uint256 id = _id(seriesSeed);
        if (id == 0) return;
        FeeStrip.Series memory s = strip.series(id);
        if (s.closed) return;
        vm.prank(s.residualOwner);
        strip.transferResidual(id, actors[actorSeed % 3]);
    }

    function directDonation(uint96 amount) public {
        usdc.mint(address(strip), amount);
    }

    /// @dev Runs the same public transitions from a genuinely unfunded NFT. Random calls
    /// to individual transitions can interleave additional series before/after this driver.
    function lifecycle(uint256 seed, bool early) public {
        uint256 slot = seed % 4;
        if (activeSeries[slot] != 0) return;
        if (liveOffer[slot] != 0) cancel(slot);
        fund(slot, seed);
        accept(slot);
        uint256 id = activeSeries[slot];
        if (id == 0) return;
        accrue(seed);
        if (early) {
            earlyClose(slot);
            return;
        }
        FeeStrip.Series memory s = strip.series(id);
        advance(s.endBlock - vm.getBlockNumber());
        assertGt(vm.getBlockNumber(), s.endBlock);
        accrue(seed / 2);
        capture(id - 1);
        returnNFT(id - 1);
        settle(id - 1);
        for (uint256 a; a < 3; a++) {
            redeem(id - 1, a, type(uint128).max);
        }
        withdrawResidual(id - 1);
    }

    function _id(uint256 seed) private view returns (uint256) {
        uint256 count = strip.nextSeriesId() - 1;
        return count == 0 ? 0 : seed % count + 1;
    }

    function _gather(FeeClaim claim, address owner) private {
        for (uint256 a; a < 3; a++) {
            if (actors[a] == owner) continue;
            uint256 amount = claim.balanceOf(actors[a]);
            if (amount == 0) continue;
            vm.prank(actors[a]);
            claim.transfer(owner, amount);
            transfers++;
        }
    }

    function _recordEndpoints() private {
        for (uint256 id = 1; id < strip.nextSeriesId(); id++) {
            FeeStrip.Series memory s = strip.series(id);
            if (s.closed || endpointRecorded[id] || s.endBlock != vm.getBlockNumber()) continue;
            (uint256 growth,) = manager.getFeeGrowthInside(key.toId(), s.tickLower, s.tickUpper);
            uint256 snap = vm.snapshotState();
            uint256 expected = _nativeCollect(s.tokenId, address(strip));
            assertTrue(vm.revertToStateAndDelete(snap));
            nativeSold[id] = expected;
            growthAtN[id] = growth;
            endpointRecorded[id] = true;
        }
    }

    function _nativeCollect(uint256 tokenId, address owner) private returns (uint256) {
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, address(this));
        uint256 beforeBalance = usdc.balanceOf(address(this));
        vm.prank(owner);
        posm.modifyLiquidities(
            abi.encode(abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR)), params),
            vm.getBlockTimestamp()
        );
        return usdc.balanceOf(address(this)) - beforeBalance;
    }
}
