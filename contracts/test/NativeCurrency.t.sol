// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {FeeStripBase, EndpointStub} from "./FeeStrip.t.sol";
import {FeeStrip} from "../src/FeeStrip.sol";
import {ICanonicalPositionManager} from "../src/interfaces/ICanonicalPositionManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract ReenteringResidual {
    FeeStrip public strip;
    uint256 public id;
    bool public attempted;
    bool public reentered;

    constructor(FeeStrip strip_, uint256 id_) {
        strip = strip_;
        id = id_;
    }

    function withdraw() external {
        strip.withdrawResidual(id, address(this));
    }

    receive() external payable {
        attempted = true;
        (reentered,) = address(strip).call(abi.encodeCall(FeeStrip.withdrawResidual, (id, address(this))));
    }
}

contract RejectETH {
    receive() external payable {
        revert("NO_ETH");
    }
}

contract NativeCurrencyTest is FeeStripBase {
    function setUp() public override {
        super.setUp();
        key = PoolKey(Currency.wrap(address(0)), Currency.wrap(address(token0)), 3000, 60, IHooks(address(0)));
        manager.initialize(key, uint160(1 << 96));
        strip = new FeeStrip(ICanonicalPositionManager(address(posm)), token0, endpoint);
        vm.prank(buyer);
        token0.approve(address(strip), type(uint256).max);
        vm.prank(seller);
        posm.setApprovalForAll(address(strip), true);
        vm.deal(address(donor), 1e18);
        nft = _mint(seller);
    }

    function testNativeOtherCurrencyAndUSDCIsCurrency1ReentrancyIsolation() public {
        uint256 id = _activate();
        donor.donate(key, 200e6, 800e6);
        vm.roll(END);
        endpoint.set(_growth());
        uint256 snap = vm.snapshotState();
        uint256 expected = _nativeCollect(nft, address(strip), seller);
        vm.revertToState(snap);
        vm.roll(END + 1);
        donor.donate(key, 100e6, 400e6);
        strip.capture(id);
        strip.settle(id, "");
        assertEq(strip.series(id).soldUSDC, expected);
        RejectETH reject = new RejectETH();
        vm.prank(seller);
        vm.expectRevert();
        strip.withdrawResidual(id, address(reject));
        vm.prank(buyer);
        assertGt(strip.redeem(id, Q * 3 / 4, buyer), 0);
        ReenteringResidual recipient = new ReenteringResidual(strip, id);
        vm.prank(seller);
        strip.transferResidual(id, address(recipient));
        recipient.withdraw();
        assertTrue(recipient.attempted());
        assertFalse(recipient.reentered());
        assertEq(strip.series(id).otherReserve, 0);
        _solvent();
    }
}
