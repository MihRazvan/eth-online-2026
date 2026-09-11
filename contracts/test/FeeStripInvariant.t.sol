// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {FeeStripBase, TestToken, EndpointStub} from "./FeeStrip.t.sol";
import {Test} from "forge-std/Test.sol";
import {FeeStrip} from "../src/FeeStrip.sol";
import {FeeClaim} from "../src/FeeClaim.sol";

contract AccountingHandler is Test {
    FeeStrip public strip;
    TestToken public usdc;
    address[3] public actors;
    uint256[2] public nativeSold;
    uint256[2] public captured;
    uint256[2] public modelPaid;
    uint256[2] public modelBurned;
    uint256[2] public modelResidualPaid;
    uint256 public transfers;
    uint256 public redemptions;
    uint256 public settlements;
    uint256 public residualWithdrawals;

    constructor(
        FeeStrip strip_,
        TestToken usdc_,
        address seller,
        address buyer,
        address holder,
        uint256[2] memory expected
    ) {
        strip = strip_;
        usdc = usdc_;
        actors = [seller, buyer, holder];
        nativeSold = expected;
        for (uint256 i; i < 2; i++) {
            captured[i] = strip.series(i + 1).capturedUSDC;
        }
    }

    function transferClaim(uint256 seriesSeed, uint256 actorSeed, uint256 amountSeed) public {
        uint256 id = seriesSeed % 2 + 1;
        address from = actors[actorSeed % 3];
        address to = actors[(actorSeed % 3 + 1) % 3];
        FeeClaim claim = strip.series(id).claim;
        uint256 balance = claim.balanceOf(from);
        if (balance == 0) return;
        uint256 amount = bound(amountSeed, 1, balance);
        vm.prank(from);
        claim.transfer(to, amount);
        transfers++;
    }

    function settle(uint256 seed) public {
        uint256 id = seed % 2 + 1;
        if (strip.series(id).allocated) return;
        strip.settle(id, "");
        settlements++;
    }

    function redeem(uint256 seriesSeed, uint256 actorSeed, uint256 amountSeed) public {
        uint256 i = seriesSeed % 2;
        uint256 id = i + 1;
        settle(i);
        FeeStrip.Series memory s = strip.series(id);
        address actor = actors[actorSeed % 3];
        uint256 balance = s.claim.balanceOf(actor);
        if (balance == 0) return;
        uint256 amount = bound(amountSeed, 1, balance);
        uint256 expected = amount * nativeSold[i] / s.quantity;
        uint256 beforeBalance = usdc.balanceOf(actor);
        vm.prank(actor);
        uint256 paid = strip.redeem(id, amount, actor);
        assertEq(paid, expected);
        assertEq(usdc.balanceOf(actor) - beforeBalance, expected);
        modelPaid[i] += expected;
        modelBurned[i] += amount;
        redemptions++;
    }

    function withdrawResidual(uint256 seed) public {
        uint256 i = seed % 2;
        settle(i);
        FeeStrip.Series memory s = strip.series(i + 1);
        uint256 amount = s.residualUSDC;
        vm.prank(s.residualOwner);
        strip.withdrawResidual(i + 1, s.residualOwner);
        modelResidualPaid[i] += amount;
        residualWithdrawals++;
    }

    function directDonation(uint96 amount) public {
        usdc.mint(address(strip), amount);
    }

    function moveResidual(uint256 seriesSeed, uint256 actorSeed) public {
        uint256 id = seriesSeed % 2 + 1;
        address owner = strip.series(id).residualOwner;
        vm.prank(owner);
        strip.transferResidual(id, actors[actorSeed % 3]);
    }
}

contract FeeStripInvariantTest is FeeStripBase {
    AccountingHandler internal handler;

    function setUp() public override {
        super.setUp();
        uint256 id1 = _activate();
        uint256 nft2 = _mint(seller);
        uint256 offer = _offer(nft2, Q, Q * 3 / 4);
        vm.prank(seller);
        uint256 id2 = strip.acceptOffer(offer, 0);
        donor.donate(key, 901e6, 113e6);
        vm.roll(END);
        endpoint.set(_growth());
        uint256 snap = vm.snapshotState();
        uint256 expected1 = _nativeCollect(nft, address(strip), address(this));
        uint256 expected2 = _nativeCollect(nft2, address(strip), address(this));
        vm.revertToState(snap);
        vm.roll(END + 10);
        donor.donate(key, 433e6, 51e6);
        strip.capture(id1);
        strip.capture(id2);
        handler = new AccountingHandler(strip, token0, seller, buyer, holder, [expected1, expected2]);
        // Exercise every economically meaningful action before randomized continuations.
        handler.transferClaim(0, 1, Q / 5);
        handler.redeem(0, 2, Q / 10);
        handler.transferClaim(1, 0, Q / 8);
        handler.redeem(1, 1, Q / 8);
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.transferClaim.selector;
        selectors[1] = handler.redeem.selector;
        selectors[2] = handler.settle.selector;
        selectors[3] = handler.withdrawResidual.selector;
        selectors[4] = handler.directDonation.selector;
        selectors[5] = handler.moveResidual.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantRightsAndSeriesLiabilitiesConserved() public view {
        uint256 liability;
        for (uint256 i; i < 2; i++) {
            FeeStrip.Series memory s = strip.series(i + 1);
            assertEq(s.claim.totalSupply() + handler.modelBurned(i), s.quantity);
            assertEq(s.paidClaims, handler.modelPaid(i));
            assertLe(s.paidClaims, handler.nativeSold(i));
            assertEq(s.soldUSDC, handler.nativeSold(i));
            liability += handler.captured(i) - handler.modelPaid(i) - handler.modelResidualPaid(i);
        }
        assertEq(strip.reservedUSDC(), liability);
        assertGe(token0.balanceOf(address(strip)), liability + strip.fundedOfferUSDC());
        assertGe(handler.transfers(), 2);
        assertGe(handler.redemptions(), 2);
        assertEq(handler.settlements(), 2);
    }
}
