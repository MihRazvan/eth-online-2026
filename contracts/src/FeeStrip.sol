// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ICanonicalPositionManager} from "./interfaces/ICanonicalPositionManager.sol";
import {PositionInfo} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FeeClaim} from "./FeeClaim.sol";
import {IHistoricalFeeVerifier} from "./interfaces/IHistoricalFeeVerifier.sol";

/// @notice Fixed individual-NFT fee sale. No administrator or discretionary allocation path.
/// @dev Deployment must bind independently verified canonical manager and authentic USDC addresses.
contract FeeStrip {
    using SafeTransferLib for ERC20;
    using StateLibrary for IPoolManager;

    error InvalidTerms();
    error Unauthorized();
    error WrongState();
    error InvalidPosition();
    error InexactPayment();
    error Reentrant();
    error InsufficientReserve();

    struct Offer {
        address buyer;
        address seller;
        uint256 tokenId;
        uint256 quantity;
        uint256 buyerQuantity;
        uint256 proceeds;
        uint64 endBlock;
        uint64 deadline;
        bytes32 positionCommitment;
        bool consumed;
    }

    struct Series {
        uint256 tokenId;
        FeeClaim claim;
        address residualOwner;
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint64 activationBlock;
        uint64 endBlock;
        uint256 baselineX128;
        uint256 quantity;
        uint256 capturedUSDC;
        uint256 otherReserve;
        uint256 soldUSDC;
        uint256 redeemedQuantity;
        uint256 paidClaims;
        uint256 residualUSDC;
        bool captured;
        bool allocated;
        bool nftReturned;
        bool closed;
    }

    ICanonicalPositionManager public immutable positionManager;
    IPoolManager public immutable poolManager;
    ERC20 public immutable usdc;
    IHistoricalFeeVerifier public immutable verifier;
    bytes32 public immutable positionManagerCodehash;
    bytes32 public immutable poolManagerCodehash;
    uint256 public nextOfferId = 1;
    uint256 public nextSeriesId = 1;
    uint256 public fundedOfferUSDC;
    uint256 public reservedUSDC;
    mapping(uint256 => Offer) public offers;
    mapping(uint256 => Series) private _series;
    bool private _entered;

    event OfferFunded(
        uint256 indexed offerId, address indexed buyer, address indexed seller, uint256 tokenId, uint256 proceeds
    );
    event OfferCancelled(uint256 indexed offerId);
    event Activated(
        uint256 indexed seriesId,
        uint256 indexed offerId,
        uint256 indexed tokenId,
        address claim,
        uint64 endBlock,
        uint256 quantity
    );
    event Captured(uint256 indexed seriesId, uint256 usdcAmount, uint256 otherAmount);
    event Allocated(uint256 indexed seriesId, uint256 soldUSDC, uint256 residualUSDC);
    event NFTReturned(uint256 indexed seriesId, address indexed recipient);
    event ResidualTransferred(uint256 indexed seriesId, address indexed previousOwner, address indexed newOwner);
    event Redeemed(
        uint256 indexed seriesId,
        address indexed holder,
        address indexed recipient,
        uint256 quantity,
        uint256 usdcAmount
    );
    event ResidualWithdrawn(
        uint256 indexed seriesId, address indexed recipient, uint256 usdcAmount, uint256 otherAmount
    );
    event Recombined(uint256 indexed seriesId, address indexed recipient);

    modifier nonReentrant() {
        if (_entered) revert Reentrant();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(ICanonicalPositionManager posm, ERC20 usdc_, IHistoricalFeeVerifier verifier_) {
        if (address(posm).code.length == 0 || address(usdc_).code.length == 0 || address(verifier_).code.length == 0) {
            revert InvalidPosition();
        }
        positionManager = posm;
        poolManager = posm.poolManager();
        if (address(poolManager).code.length == 0 || verifier_.poolManager() != address(poolManager)) {
            revert InvalidPosition();
        }
        usdc = usdc_;
        verifier = verifier_;
        positionManagerCodehash = address(posm).codehash;
        poolManagerCodehash = address(poolManager).codehash;
    }

    receive() external payable {
        if (msg.sender != address(poolManager) && msg.sender != address(positionManager)) revert Unauthorized();
    }

    function series(uint256 id) external view returns (Series memory) {
        return _series[id];
    }

    function claimToken(uint256 id) external view returns (address) {
        return address(_series[id].claim);
    }

    function marketState(uint256 id) external view returns (bytes32) {
        Series storage s = _existing(id);
        return keccak256(abi.encode(s.captured, s.allocated, s.closed, s.soldUSDC, s.claim.totalSupply()));
    }

    /// @notice Buyer funds immutable terms. NFT approval is never sale consent.
    function fundOffer(
        address seller,
        uint256 tokenId,
        uint256 quantity,
        uint256 buyerQuantity,
        uint256 proceeds,
        uint64 endBlock,
        uint64 deadline
    ) external nonReentrant returns (uint256 id) {
        if (
            seller == address(0) || quantity == 0 || buyerQuantity == 0 || buyerQuantity > quantity || proceeds == 0
                || endBlock <= block.number || deadline < block.timestamp
        ) revert InvalidTerms();
        (PoolKey memory key, PositionInfo info, uint128 liquidity) = _validatedPosition(tokenId);
        if (positionManager.ownerOf(tokenId) != seller) revert Unauthorized();
        id = nextOfferId++;
        offers[id] = Offer(
            msg.sender,
            seller,
            tokenId,
            quantity,
            buyerQuantity,
            proceeds,
            endBlock,
            deadline,
            _commitment(key, info, liquidity),
            false
        );
        fundedOfferUSDC += proceeds;
        uint256 beforeBalance = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), proceeds);
        if (usdc.balanceOf(address(this)) - beforeBalance != proceeds) revert InexactPayment();
        emit OfferFunded(id, msg.sender, seller, tokenId, proceeds);
    }

    function cancelOffer(uint256 id) external nonReentrant {
        Offer storage o = offers[id];
        if (o.buyer != msg.sender) revert Unauthorized();
        if (o.consumed) revert WrongState();
        o.consumed = true;
        fundedOfferUSDC -= o.proceeds;
        usdc.safeTransfer(o.buyer, o.proceeds);
        emit OfferCancelled(id);
    }

    /// @notice Seller executes exact offer; NFT transfer, old-fee clearing, mint and payment are atomic.
    function acceptOffer(uint256 offerId, uint256 minProceeds) external nonReentrant returns (uint256 id) {
        Offer storage o = offers[offerId];
        if (msg.sender != o.seller || positionManager.ownerOf(o.tokenId) != msg.sender) revert Unauthorized();
        if (o.consumed || o.endBlock <= block.number || o.deadline < block.timestamp || o.proceeds < minProceeds) {
            revert InvalidTerms();
        }
        (PoolKey memory key, PositionInfo info, uint128 liquidity) = _validatedPosition(o.tokenId);
        if (_commitment(key, info, liquidity) != o.positionCommitment) revert InvalidPosition();
        o.consumed = true;
        fundedOfferUSDC -= o.proceeds;
        positionManager.transferFrom(msg.sender, address(this), o.tokenId);
        (uint256 oldUSDC, uint256 oldOther) = _collect(o.tokenId, key);
        id = nextSeriesId++;
        Series storage s = _series[id];
        s.tokenId = o.tokenId;
        s.residualOwner = msg.sender;
        s.key = key;
        s.tickLower = info.tickLower();
        s.tickUpper = info.tickUpper();
        s.liquidity = liquidity;
        s.activationBlock = uint64(block.number);
        s.endBlock = o.endBlock;
        s.baselineX128 = _clearedGrowth(key, s.tickLower, s.tickUpper, o.tokenId);
        s.quantity = o.quantity;
        s.claim = new FeeClaim(o.quantity, o.buyer, o.buyerQuantity, msg.sender);
        usdc.safeTransfer(msg.sender, o.proceeds + oldUSDC);
        _other(key).transfer(msg.sender, oldOther);
        emit Activated(id, offerId, o.tokenId, address(s.claim), s.endBlock, s.quantity);
    }

    /// @notice Anyone can capture strictly after the entire endpoint block. No recipient callback occurs.
    function capture(uint256 id) external nonReentrant {
        Series storage s = _existing(id);
        if (s.captured || s.closed || block.number <= s.endBlock) revert WrongState();
        s.captured = true;
        (s.capturedUSDC, s.otherReserve) = _collect(s.tokenId, s.key);
        reservedUSDC += s.capturedUSDC;
        emit Captured(id, s.capturedUSDC, s.otherReserve);
    }

    function withdrawNFT(uint256 id, address to) external nonReentrant {
        Series storage s = _existing(id);
        if (msg.sender != s.residualOwner || to == address(0)) revert Unauthorized();
        if (!s.captured || s.nftReturned || s.closed) revert WrongState();
        s.nftReturned = true;
        positionManager.safeTransferFrom(address(this), to, s.tokenId);
        emit NFTReturned(id, to);
    }

    function transferResidual(uint256 id, address to) external nonReentrant {
        Series storage s = _existing(id);
        if (msg.sender != s.residualOwner || to == address(0)) revert Unauthorized();
        if (s.closed) revert WrongState();
        emit ResidualTransferred(id, msg.sender, to);
        s.residualOwner = to;
    }

    function settle(uint256 id, bytes calldata witness) external nonReentrant {
        Series storage s = _existing(id);
        if (!s.captured || s.allocated || s.closed) revert WrongState();
        uint256 endpointGrowth = verifier.verify(
            s.endBlock,
            PoolId.unwrap(s.key.toId()),
            s.tickLower,
            s.tickUpper,
            Currency.unwrap(s.key.currency0) == address(usdc),
            witness
        );
        uint256 growthDelta;
        unchecked {
            growthDelta = endpointGrowth - s.baselineX128;
        }
        uint256 sold = FullMath.mulDiv(s.liquidity, growthDelta, 1 << 128);
        if (sold > s.capturedUSDC) revert InsufficientReserve();
        s.allocated = true;
        s.soldUSDC = sold;
        s.residualUSDC = s.capturedUSDC - sold;
        emit Allocated(id, sold, s.residualUSDC);
    }

    /// @dev Each redemption floors amount*soldUSDC/originalQ. Dust remains permanently segregated
    /// in the series after all claims are consumed; neither residual owners nor admins can sweep it.
    function redeem(uint256 id, uint256 amount, address to) external nonReentrant returns (uint256 payout) {
        Series storage s = _existing(id);
        if (!s.allocated || s.closed || amount == 0 || to == address(0)) revert WrongState();
        payout = FullMath.mulDiv(amount, s.soldUSDC, s.quantity);
        s.claim.consume(msg.sender, amount);
        s.redeemedQuantity += amount;
        s.paidClaims += payout;
        reservedUSDC -= payout;
        usdc.safeTransfer(to, payout);
        emit Redeemed(id, msg.sender, to, amount, payout);
    }

    /// @notice Other-currency fees can be withdrawn after capture; USDC requires exact allocation.
    function withdrawResidual(uint256 id, address to) external nonReentrant {
        Series storage s = _existing(id);
        if (msg.sender != s.residualOwner || to == address(0)) revert Unauthorized();
        if (!s.captured || s.closed) revert WrongState();
        uint256 amount = s.residualUSDC;
        uint256 otherAmount = s.otherReserve;
        s.residualUSDC = 0;
        s.otherReserve = 0;
        reservedUSDC -= amount;
        usdc.safeTransfer(to, amount);
        _other(s.key).transfer(to, otherAmount);
        emit ResidualWithdrawn(id, to, amount, otherAmount);
    }

    function recombine(uint256 id, address to) external nonReentrant {
        Series storage s = _existing(id);
        if (msg.sender != s.residualOwner || to == address(0)) revert Unauthorized();
        if (s.closed || s.captured || block.number >= s.endBlock || s.redeemedQuantity != 0) revert WrongState();
        s.claim.consume(msg.sender, s.quantity);
        s.closed = true;
        s.nftReturned = true;
        s.residualOwner = address(0);
        (uint256 amount, uint256 otherAmount) = _collect(s.tokenId, s.key);
        usdc.safeTransfer(to, amount);
        _other(s.key).transfer(to, otherAmount);
        positionManager.safeTransferFrom(address(this), to, s.tokenId);
        emit Recombined(id, to);
    }

    function _existing(uint256 id) private view returns (Series storage s) {
        s = _series[id];
        if (address(s.claim) == address(0)) revert WrongState();
    }

    function _validatedPosition(uint256 tokenId)
        private
        view
        returns (PoolKey memory key, PositionInfo info, uint128 liquidity)
    {
        if (
            address(positionManager).codehash != positionManagerCodehash
                || address(poolManager).codehash != poolManagerCodehash
        ) revert InvalidPosition();
        (key, info) = positionManager.getPoolAndPositionInfo(tokenId);
        liquidity = positionManager.getPositionLiquidity(tokenId);
        if (
            address(key.hooks) != address(0) || liquidity == 0 || info.hasSubscriber()
                || (Currency.unwrap(key.currency0) != address(usdc) && Currency.unwrap(key.currency1) != address(usdc))
        ) revert InvalidPosition();
    }

    function _clearedGrowth(PoolKey memory key, int24 lower, int24 upper, uint256 tokenId)
        private
        view
        returns (uint256)
    {
        (, uint256 growth0, uint256 growth1) =
            poolManager.getPositionInfo(key.toId(), address(positionManager), lower, upper, bytes32(tokenId));
        return Currency.unwrap(key.currency0) == address(usdc) ? growth0 : growth1;
    }

    function _commitment(PoolKey memory key, PositionInfo info, uint128 liquidity) private pure returns (bytes32) {
        return keccak256(abi.encode(key, info.tickLower(), info.tickUpper(), liquidity));
    }

    function _other(PoolKey memory key) private view returns (Currency) {
        return Currency.unwrap(key.currency0) == address(usdc) ? key.currency1 : key.currency0;
    }

    function _collect(uint256 tokenId, PoolKey memory key) private returns (uint256 amount, uint256 otherAmount) {
        uint256 beforeUSDC = usdc.balanceOf(address(this));
        Currency other = _other(key);
        uint256 beforeOther = other.balanceOfSelf();
        bytes memory actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, address(this));
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
        amount = usdc.balanceOf(address(this)) - beforeUSDC;
        otherAmount = other.balanceOfSelf() - beforeOther;
    }
}
