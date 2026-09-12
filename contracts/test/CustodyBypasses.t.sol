// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FeeStripBase} from "./FeeStrip.t.sol";
import {FeeStrip} from "../src/FeeStrip.sol";
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {ISubscriber} from "@uniswap/v4-periphery/src/interfaces/ISubscriber.sol";
import {PositionInfo} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

contract CountingSubscriber is ISubscriber {
    uint256 public subscriptions;
    uint256 public unsubscriptions;

    function notifySubscribe(uint256, bytes memory) external {
        subscriptions++;
    }

    function notifyUnsubscribe(uint256) external {
        unsubscriptions++;
    }
    function notifyBurn(uint256, address, PositionInfo, uint256, BalanceDelta) external {}
    function notifyModifyLiquidity(uint256, int256, BalanceDelta) external {}
}

/// @dev Exercises the legitimate core-unlocked context, not only a locked-core failure.
contract ExternalUnlockAttacker is IUnlockCallback {
    IPoolManager public manager;
    PositionManager public posm;
    bool public reachedUnlockedContext;
    bool public actionSucceeded;
    bytes public reason;

    constructor(IPoolManager manager_, PositionManager posm_) {
        manager = manager_;
        posm = posm_;
    }

    function attempt(bytes memory actions, bytes[] memory params) external {
        manager.unlock(abi.encode(actions, params));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        reachedUnlockedContext = true;
        (bytes memory actions, bytes[] memory params) = abi.decode(data, (bytes, bytes[]));
        (actionSucceeded, reason) =
            address(posm).call(abi.encodeCall(posm.modifyLiquiditiesWithoutUnlock, (actions, params)));
        return "";
    }
}

contract CustodyBypassesTest is FeeStripBase {
    uint256 private constant SELLER_KEY = 0xA11CE55;

    function setUp() public override {
        seller = vm.addr(SELLER_KEY);
        super.setUp();
    }

    function _sign(bytes32 structHash) private view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", posm.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SELLER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permitSignature(uint256 nonce, uint256 deadline) private view returns (bytes memory) {
        return _sign(
            keccak256(
                abi.encode(
                    keccak256("Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)"),
                    holder,
                    nft,
                    nonce,
                    deadline
                )
            )
        );
    }

    function _operatorSignature(uint256 nonce, uint256 deadline) private view returns (bytes memory) {
        return _sign(
            keccak256(
                abi.encode(
                    keccak256("PermitForAll(address operator,bool approved,uint256 nonce,uint256 deadline)"),
                    holder,
                    true,
                    nonce,
                    deadline
                )
            )
        );
    }

    function _actions(uint256 liquidity) private view returns (bytes memory actions, bytes[] memory params) {
        actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        params = new bytes[](2);
        params[0] = abi.encode(nft, liquidity, uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, holder);
    }

    function _unchanged() private view {
        assertEq(posm.ownerOf(nft), address(strip));
        assertEq(posm.getPositionLiquidity(nft), L);
        assertEq(posm.getApproved(nft), address(0));
        assertEq(address(posm.subscriber(nft)), address(0));
    }

    function testPreSignedNFTPermitWorksBeforeSaleButCannotApproveEscrowNFT() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _permitSignature(0, deadline);
        uint256 snapshot = vm.snapshotState();
        posm.permit(holder, nft, deadline, 0, sig);
        assertEq(posm.getApproved(nft), holder, "positive control: correct seller signature");
        assertTrue(vm.revertToStateAndDelete(snapshot));
        _activate();
        vm.expectRevert();
        posm.permit(holder, nft, deadline, 0, sig);
        _unchanged();
    }

    function testSellerPermitForAllAfterSaleCannotAuthorizeEscrowOperations() public {
        bytes memory sig = _operatorSignature(0, block.timestamp + 1 days);
        _activate();
        posm.permitForAll(seller, holder, true, block.timestamp + 1 days, 0, sig);
        assertTrue(posm.isApprovedForAll(seller, holder), "seller's own global approval remains valid");
        assertFalse(posm.isApprovedForAll(address(strip), holder));
        vm.prank(holder);
        vm.expectRevert();
        posm.transferFrom(address(strip), holder, nft);
        bytes memory forgedScopeSig = _operatorSignature(1, block.timestamp + 1 days);
        vm.expectRevert();
        posm.permitForAll(address(strip), holder, true, block.timestamp + 1 days, 1, forgedScopeSig);
        _unchanged();
    }

    function testCanonicalSubscriptionWorksBeforeSaleAndIsRejectedAtFundingAndDuringCustody() public {
        CountingSubscriber subscriber = new CountingSubscriber();
        vm.prank(seller);
        posm.subscribe(nft, address(subscriber), "");
        assertEq(subscriber.subscriptions(), 1);
        vm.prank(buyer);
        vm.expectRevert(FeeStrip.InvalidPosition.selector);
        strip.fundOffer(
            seller,
            nft,
            Q,
            Q,
            100e6,
            END,
            uint64(block.timestamp + 1 days),
            keccak256(abi.encode(key, int24(-120), int24(120), L))
        );
        vm.prank(seller);
        posm.unsubscribe(nft);
        assertEq(subscriber.unsubscriptions(), 1);
        _activate();
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(IPositionManager.NotApproved.selector, seller));
        posm.subscribe(nft, address(subscriber), "");
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(IPositionManager.NotApproved.selector, seller));
        posm.unsubscribe(nft);
        assertEq(subscriber.subscriptions(), 1);
        _unchanged();
    }

    function testMulticallCannotLaunderFormerOwnerPermissionsToCollectOrRemoveLiquidity() public {
        _activate();
        donor.donate(key, 100e6, 50e6);
        for (uint256 amount = 0; amount <= 1; amount++) {
            (bytes memory actions, bytes[] memory params) = _actions(amount);
            bytes[] memory calls = new bytes[](2);
            calls[0] = abi.encodeCall(posm.setApprovalForAll, (holder, true));
            calls[1] = abi.encodeCall(posm.modifyLiquidities, (abi.encode(actions, params), block.timestamp));
            vm.prank(seller);
            vm.expectRevert(abi.encodeWithSelector(IPositionManager.NotApproved.selector, seller));
            posm.multicall(calls);
            assertFalse(posm.isApprovedForAll(seller, holder), "earlier multicall mutation rolls back");
        }
        _unchanged();
    }

    function testWithoutUnlockCannotIncreaseBurnOrConsumeDeltasForEscrowNFT() public {
        _activate();
        ExternalUnlockAttacker attacker = new ExternalUnlockAttacker(manager, posm);
        uint256[3] memory opcodes = [
            uint256(Actions.INCREASE_LIQUIDITY),
            uint256(Actions.BURN_POSITION),
            uint256(Actions.INCREASE_LIQUIDITY_FROM_DELTAS)
        ];
        for (uint256 i; i < opcodes.length; i++) {
            bytes[] memory params = new bytes[](1);
            if (opcodes[i] == Actions.INCREASE_LIQUIDITY) {
                params[0] = abi.encode(nft, uint256(1), type(uint128).max, type(uint128).max, bytes(""));
            } else {
                params[0] = abi.encode(nft, uint128(0), uint128(0), bytes(""));
            }
            attacker.attempt(abi.encodePacked(uint8(opcodes[i])), params);
            assertTrue(attacker.reachedUnlockedContext());
            assertFalse(attacker.actionSucceeded());
            assertEq(
                attacker.reason(), abi.encodeWithSelector(IPositionManager.NotApproved.selector, address(attacker))
            );
        }
        _unchanged();
    }

    function testWithoutUnlockRejectsUnauthorizedZeroPokeAndPrincipalRemovalEvenInsideCoreUnlock() public {
        _activate();
        donor.donate(key, 100e6, 50e6);
        ExternalUnlockAttacker attacker = new ExternalUnlockAttacker(manager, posm);
        for (uint256 amount = 0; amount <= 1; amount++) {
            (bytes memory actions, bytes[] memory params) = _actions(amount);
            vm.prank(seller);
            vm.expectRevert(abi.encodeWithSelector(IPositionManager.NotApproved.selector, seller));
            posm.modifyLiquiditiesWithoutUnlock(actions, params);
            attacker.attempt(actions, params);
            assertTrue(attacker.reachedUnlockedContext());
            assertFalse(attacker.actionSucceeded());
            assertEq(
                attacker.reason(),
                abi.encodeWithSelector(IPositionManager.NotApproved.selector, address(attacker)),
                "failure must be authorization, not pool lock"
            );
        }
        _unchanged();
    }
}
