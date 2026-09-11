// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPositionDescriptor} from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {FeeStrip} from "../src/FeeStrip.sol";
import {FeeClaim} from "../src/FeeClaim.sol";
import {ICanonicalPositionManager} from "../src/interfaces/ICanonicalPositionManager.sol";
import {IHistoricalFeeVerifier} from "../src/interfaces/IHistoricalFeeVerifier.sol";

contract TestToken is ERC20 {
    constructor(string memory symbol_) ERC20(symbol_, symbol_, 6) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Explicit accounting-test stub, not historical-proof acceptance evidence.
contract EndpointStub is IHistoricalFeeVerifier {
    address public immutable poolManager;
    uint256 public growth;

    constructor(address manager) {
        poolManager = manager;
    }

    function set(uint256 growth_) external {
        growth = growth_;
    }

    function verify(uint256, bytes32, int24, int24, bool, bytes calldata) external view returns (uint256) {
        return growth;
    }
}

contract NativeDonor is IUnlockCallback {
    IPoolManager public immutable manager;

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    function donate(PoolKey memory key, uint256 amount0, uint256 amount1) external {
        manager.unlock(abi.encode(key, amount0, amount1));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (PoolKey memory key, uint256 a0, uint256 a1) = abi.decode(data, (PoolKey, uint256, uint256));
        manager.donate(key, a0, a1, "");
        _pay(key.currency0, a0);
        _pay(key.currency1, a1);
        return "";
    }

    function _pay(Currency currency, uint256 amount) private {
        if (Currency.unwrap(currency) == address(0)) {
            manager.settle{value: amount}();
        } else {
            manager.sync(currency);
            currency.transfer(address(manager), amount);
            manager.settle();
        }
    }
    receive() external payable {}
}

contract NativeSwapper is IUnlockCallback {
    IPoolManager public immutable manager;

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    function trade(PoolKey memory key, uint256 amount) external {
        manager.unlock(abi.encode(key, amount));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (PoolKey memory key, uint256 amount) = abi.decode(data, (PoolKey, uint256));
        BalanceDelta d = manager.swap(key, SwapParams(true, -int256(amount), TickMath.MIN_SQRT_PRICE + 1), "");
        manager.sync(key.currency0);
        key.currency0.transfer(address(manager), uint256(-int256(d.amount0())));
        manager.settle();
        manager.take(key.currency1, address(this), uint256(int256(d.amount1())));
        return "";
    }
}

contract RejectNFT {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("NO_NFT");
    }
}

abstract contract FeeStripBase is Test {
    using StateLibrary for IPoolManager;
    PoolManager internal manager;
    PositionManager internal posm;
    TestToken internal token0;
    TestToken internal token1;
    EndpointStub internal endpoint;
    FeeStrip internal strip;
    NativeDonor internal donor;
    PoolKey internal key;
    address internal seller = address(0xA11CE);
    address internal buyer = address(0xB0B);
    address internal holder = address(0xCAFE);
    uint256 internal nft;
    uint128 internal constant L = 1e12;
    uint256 internal constant Q = 1e18;
    uint64 internal constant END = 100;

    function setUp() public virtual {
        vm.roll(10);
        manager = new PoolManager(address(this));
        posm = new PositionManager(
            manager, IAllowanceTransfer(address(0)), 50_000, IPositionDescriptor(address(0)), IWETH9(address(0))
        );
        TestToken a = new TestToken("USDC fixture");
        TestToken b = new TestToken("OTHER fixture");
        (token0, token1) = address(a) < address(b) ? (a, b) : (b, a);
        key = PoolKey(Currency.wrap(address(token0)), Currency.wrap(address(token1)), 3000, 60, IHooks(address(0)));
        manager.initialize(key, uint160(1 << 96));
        endpoint = new EndpointStub(address(manager));
        strip = new FeeStrip(ICanonicalPositionManager(address(posm)), token0, endpoint);
        donor = new NativeDonor(manager);
        token0.mint(address(donor), 1e24);
        token1.mint(address(donor), 1e24);
        token0.mint(buyer, 1e18);
        vm.prank(buyer);
        token0.approve(address(strip), type(uint256).max);
        nft = _mint(seller);
        vm.prank(seller);
        posm.setApprovalForAll(address(strip), true);
    }

    function _mint(address owner) internal returns (uint256 id) {
        // Official PosM SETTLE payerIsUser=false path, funded before call. Permit2 unused.
        if (Currency.unwrap(key.currency0) == address(0)) vm.deal(address(posm), 1e12);
        else TestToken(Currency.unwrap(key.currency0)).mint(address(posm), 1e12);
        TestToken(Currency.unwrap(key.currency1)).mint(address(posm), 1e12);
        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE),
            uint8(Actions.SETTLE),
            uint8(Actions.SWEEP),
            uint8(Actions.SWEEP)
        );
        bytes[] memory p = new bytes[](5);
        p[0] = abi.encode(
            key, int24(-120), int24(120), uint256(L), type(uint128).max, type(uint128).max, owner, bytes("")
        );
        p[1] = abi.encode(key.currency0, uint256(0), false);
        p[2] = abi.encode(key.currency1, uint256(0), false);
        p[3] = abi.encode(key.currency0, owner);
        p[4] = abi.encode(key.currency1, owner);
        id = posm.nextTokenId();
        posm.modifyLiquidities(abi.encode(actions, p), block.timestamp);
    }

    function _offer(uint256 tokenId, uint256 quantity, uint256 buyQty) internal returns (uint256 offer) {
        vm.prank(buyer);
        offer = strip.fundOffer(seller, tokenId, quantity, buyQty, 100e6, END, uint64(block.timestamp + 1 days));
    }

    function _activate() internal returns (uint256 id) {
        uint256 offer = _offer(nft, Q, Q * 3 / 4);
        vm.prank(seller);
        id = strip.acceptOffer(offer, 100e6);
    }

    function _growth() internal view returns (uint256) {
        (uint256 g0, uint256 g1) = IPoolManager(address(manager)).getFeeGrowthInside(key.toId(), -120, 120);
        return Currency.unwrap(key.currency0) == address(token0) ? g0 : g1;
    }

    function _nativeCollect(uint256 tokenId, address owner, address recipient) internal returns (uint256 amount) {
        bytes[] memory p = new bytes[](2);
        p[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        p[1] = abi.encode(key.currency0, key.currency1, recipient);
        uint256 beforeBalance = token0.balanceOf(recipient);
        vm.prank(owner);
        posm.modifyLiquidities(
            abi.encode(abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR)), p),
            block.timestamp
        );
        amount = token0.balanceOf(recipient) - beforeBalance;
    }

    function _mature(uint256 id) internal returns (uint256 nativeAtN) {
        donor.donate(key, 800e6, 200e6);
        vm.roll(END);
        endpoint.set(_growth());
        uint256 snap = vm.snapshotState();
        nativeAtN = _nativeCollect(nft, address(strip), address(this));
        vm.revertToState(snap);
        vm.roll(END + 1);
        donor.donate(key, 400e6, 100e6);
        strip.capture(id);
    }

    function _solvent() internal view {
        assertGe(token0.balanceOf(address(strip)), strip.reservedUSDC() + strip.fundedOfferUSDC());
    }
}

contract FeeStripTest is FeeStripBase {
    function testNativeLifecycleSnapshotOracleLateCaptureTransferAndIndependentRedemption() public {
        donor.donate(key, 123e6, 45e6);
        uint256 snapshot = vm.snapshotState();
        uint256 oldFees = _nativeCollect(nft, seller, address(this));
        vm.revertToState(snapshot);
        uint256 sellerBefore = token0.balanceOf(seller);
        uint256 id = _activate();
        assertEq(token0.balanceOf(seller) - sellerBefore, 100e6 + oldFees);
        assertEq(posm.ownerOf(nft), address(strip));
        assertEq(posm.getPositionLiquidity(nft), L);
        uint256 exactNative = _mature(id);
        FeeStrip.Series memory s = strip.series(id);
        assertGt(s.capturedUSDC, exactNative);
        assertEq(strip.reservedUSDC(), s.capturedUSDC);
        vm.prank(seller);
        strip.withdrawNFT(id, seller);
        assertEq(posm.ownerOf(nft), seller);
        assertFalse(strip.series(id).allocated);
        vm.prank(buyer);
        s.claim.transfer(holder, Q / 4);
        strip.settle(id, "");
        assertEq(strip.series(id).soldUSDC, exactNative, "independent native collection oracle");
        vm.prank(holder);
        uint256 p1 = strip.redeem(id, Q / 4, holder);
        vm.prank(buyer);
        uint256 p2 = strip.redeem(id, Q / 2, buyer);
        assertEq(p2, exactNative / 2, "original-Q independent model after first burn");
        vm.prank(seller);
        uint256 p3 = strip.redeem(id, Q / 4, seller);
        assertEq(p1, exactNative / 4);
        assertEq(p2, exactNative / 2);
        assertEq(p3, exactNative / 4);
        uint256 beforeResidual = token0.balanceOf(seller);
        vm.prank(seller);
        strip.withdrawResidual(id, seller);
        assertEq(token0.balanceOf(seller) - beforeResidual, s.capturedUSDC - exactNative);
        assertEq(s.claim.totalSupply(), 0);
        assertEq(strip.reservedUSDC(), exactNative - p1 - p2 - p3);
        _solvent();
    }

    function testNativeSwapFeesCapturedWithoutChangingNFTLiquidity() public {
        uint256 id = _activate();
        NativeSwapper swapper = new NativeSwapper(manager);
        token0.mint(address(swapper), 100e6);
        swapper.trade(key, 100e6);
        assertGt(token1.balanceOf(address(swapper)), 0);
        vm.roll(END);
        endpoint.set(_growth());
        uint256 snap = vm.snapshotState();
        uint256 nativeN = _nativeCollect(nft, address(strip), address(this));
        vm.revertToState(snap);
        assertGt(nativeN, 0);
        vm.roll(END + 1);
        strip.capture(id);
        strip.settle(id, "");
        assertEq(strip.series(id).soldUSDC, nativeN);
        assertEq(posm.getPositionLiquidity(nft), L);
        vm.prank(buyer);
        assertGt(strip.redeem(id, Q * 3 / 4, buyer), 0);
    }

    function testOfferConsentMinProceedsExpiryCancelAndAtomicFailure() public {
        uint256 offer = _offer(nft, Q, Q);
        vm.prank(buyer);
        vm.expectRevert(FeeStrip.Unauthorized.selector);
        strip.acceptOffer(offer, 0);
        vm.prank(seller);
        vm.expectRevert(FeeStrip.InvalidTerms.selector);
        strip.acceptOffer(offer, 101e6);
        assertEq(posm.ownerOf(nft), seller);
        assertEq(strip.nextSeriesId(), 1);
        vm.warp(block.timestamp + 2 days);
        vm.prank(seller);
        vm.expectRevert(FeeStrip.InvalidTerms.selector);
        strip.acceptOffer(offer, 0);
        uint256 beforeBalance = token0.balanceOf(buyer);
        vm.prank(buyer);
        strip.cancelOffer(offer);
        assertEq(token0.balanceOf(buyer) - beforeBalance, 100e6);
        vm.prank(buyer);
        vm.expectRevert(FeeStrip.WrongState.selector);
        strip.cancelOffer(offer);
        _solvent();
    }

    function testFundingFailureAndMissingNFTApprovalLeaveNoSale() public {
        vm.prank(buyer);
        token0.approve(address(strip), 0);
        vm.expectRevert();
        _offer(nft, Q, Q);
        assertEq(strip.nextOfferId(), 1);
        vm.prank(buyer);
        token0.approve(address(strip), type(uint256).max);
        uint256 offer = _offer(nft, Q, Q);
        vm.prank(seller);
        posm.setApprovalForAll(address(strip), false);
        vm.prank(seller);
        vm.expectRevert();
        strip.acceptOffer(offer, 0);
        assertEq(strip.fundedOfferUSDC(), 100e6);
        assertEq(strip.nextSeriesId(), 1);
        assertEq(posm.ownerOf(nft), seller);
    }

    function testActiveCustodyRejectsApprovalCollectTransferAndRecombineWithoutAllClaims() public {
        uint256 id = _activate();
        vm.prank(seller);
        vm.expectRevert();
        posm.transferFrom(address(strip), seller, nft);
        vm.prank(seller);
        vm.expectRevert();
        posm.approve(seller, nft);
        bytes[] memory p = new bytes[](2);
        p[0] = abi.encode(nft, uint256(0), uint128(0), uint128(0), bytes(""));
        p[1] = abi.encode(key.currency0, key.currency1, seller);
        vm.prank(seller);
        vm.expectRevert();
        posm.modifyLiquidities(
            abi.encode(abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR)), p),
            block.timestamp
        );
        vm.prank(seller);
        vm.expectRevert();
        strip.recombine(id, seller);
        vm.prank(seller);
        vm.expectRevert(FeeStrip.WrongState.selector);
        strip.withdrawNFT(id, seller);
        vm.roll(END);
        vm.expectRevert(FeeStrip.WrongState.selector);
        strip.capture(id);
        assertEq(posm.getPositionLiquidity(nft), L);
    }

    function testBadNFTRecipientDoesNotBlockBuyersOrResidualBeneficiary() public {
        uint256 id = _activate();
        _mature(id);
        RejectNFT reject = new RejectNFT();
        vm.prank(seller);
        vm.expectRevert();
        strip.withdrawNFT(id, address(reject));
        strip.settle(id, "");
        vm.prank(buyer);
        assertGt(strip.redeem(id, Q * 3 / 4, buyer), 0);
        vm.prank(seller);
        strip.transferResidual(id, holder);
        vm.prank(holder);
        strip.withdrawNFT(id, holder);
        vm.prank(holder);
        strip.withdrawResidual(id, holder);
        assertEq(posm.ownerOf(nft), holder);
        assertEq(strip.series(id).residualOwner, holder);
        _solvent();
    }

    function testUnresolvedReserveCannotReachSellerAndDirectTransfersDoNotInflateClaims() public {
        uint256 id = _activate();
        uint256 exact = _mature(id);
        token0.mint(address(strip), 999e6);
        uint256 balance = token0.balanceOf(seller);
        vm.prank(seller);
        strip.withdrawResidual(id, seller);
        assertEq(token0.balanceOf(seller), balance);
        vm.prank(seller);
        strip.withdrawNFT(id, seller);
        strip.settle(id, "");
        assertEq(strip.series(id).soldUSDC, exact);
        vm.expectRevert(FeeStrip.WrongState.selector);
        strip.settle(id, "");
        _solvent();
    }

    function testInvalidAllocationAboveCaptureRevertsWithoutChangingState() public {
        uint256 id = _activate();
        _mature(id);
        endpoint.set(type(uint256).max / 1e12);
        vm.expectRevert(FeeStrip.InsufficientReserve.selector);
        strip.settle(id, "");
        assertFalse(strip.series(id).allocated);
        _solvent();
    }

    function testEarlyRecombinationConsumesEveryRight() public {
        uint256 id = _activate();
        FeeClaim claim = strip.series(id).claim;
        donor.donate(key, 333e6, 77e6);
        vm.prank(buyer);
        claim.transfer(seller, Q * 3 / 4);
        vm.prank(seller);
        strip.recombine(id, seller);
        assertEq(claim.totalSupply(), 0);
        assertEq(posm.ownerOf(nft), seller);
        assertTrue(strip.series(id).closed);
        assertEq(strip.series(id).residualOwner, address(0));
        vm.roll(END + 1);
        vm.expectRevert(FeeStrip.WrongState.selector);
        strip.capture(id);
    }

    function testFuzzFixedOriginalQIndependentPayoutModel(
        uint96 rawSold,
        uint96 rawLate,
        uint64 rawQuantity,
        uint64 rawSplit
    ) public {
        uint256 soldDonation = bound(rawSold, 1, 1e15);
        uint256 lateDonation = bound(rawLate, 1, 1e15);
        uint256 quantity = bound(rawQuantity, 2, 1e18);
        uint256 split = bound(rawSplit, 1, quantity - 1);
        uint256 offer = _offer(nft, quantity, quantity);
        vm.prank(seller);
        uint256 id = strip.acceptOffer(offer, 0);
        donor.donate(key, soldDonation, 0);
        vm.roll(END);
        endpoint.set(_growth());
        uint256 snap = vm.snapshotState();
        uint256 nativeN = _nativeCollect(nft, address(strip), address(this));
        vm.revertToState(snap);
        vm.roll(END + 1);
        donor.donate(key, lateDonation, 0);
        strip.capture(id);
        strip.settle(id, "");
        FeeClaim claim = strip.series(id).claim;
        vm.prank(buyer);
        claim.transfer(holder, split);
        vm.prank(holder);
        uint256 first = strip.redeem(id, split, holder);
        vm.prank(buyer);
        uint256 second = strip.redeem(id, quantity - split, buyer);
        // Independent small-number integer model; no FullMath and no FeeStrip entitlement oracle.
        assertEq(first, (nativeN * split) / quantity);
        assertEq(second, (nativeN * (quantity - split)) / quantity);
        assertLe(first + second, nativeN);
        assertLe(nativeN - first - second, 1);
        _solvent();
    }
}
