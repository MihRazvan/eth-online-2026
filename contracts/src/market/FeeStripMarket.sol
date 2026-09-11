// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

// Powered by SwapVM — © Degensoft Ltd 2025.
// FeeStrip integration authored 2026-09-11. Runtime and encoder share one source pin.
import {ISwapVM} from "swap-vm/contracts/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "swap-vm/contracts/libs/MakerTraits.sol";
import {TakerTraitsLib} from "swap-vm/contracts/libs/TakerTraits.sol";
import {StaticBalances} from "swap-vm/contracts/instructions/Balances.sol";
import {LimitSwap} from "swap-vm/contracts/instructions/LimitSwap.sol";
import {Deadline, Salt} from "swap-vm/contracts/instructions/Controls.sol";

interface IFeeStripMarketState {
    function marketState(uint256 id) external view returns (bytes32);
    function claimToken(uint256 id) external view returns (address);
    function usdc() external view returns (address);
}

/// @notice Noncustodial order builder and execution guard for the official Aqua runtime.
/// @dev Maker ships the returned order to Aqua themselves. No access to escrow reserves.
contract FeeStripMarket {
    IFeeStripMarketState public immutable feeStrip;
    address public immutable router;
    error InvalidOrder();
    error OnlyRouter();
    error StaleSeries();

    constructor(IFeeStripMarketState feeStrip_, address router_) {
        require(address(feeStrip_).code.length > 0 && router_.code.length > 0, InvalidOrder());
        feeStrip = feeStrip_;
        router = router_;
    }

    /// @param claimsIn True: taker sells claims; false: taker buys claims with USDC.
    /// @param claimUnits Claim base units for the advertised price ratio.
    /// @param usdcUnits USDC base units for that same ratio. Not an income estimate.
    function buildOrder(uint256 id, address maker, bool claimsIn, uint256 claimUnits,
        uint256 usdcUnits, uint40 deadline, bytes32 salt) external view returns (ISwapVM.Order memory)
    {
        address claim = feeStrip.claimToken(id);
        address cash = feeStrip.usdc();
        require(maker != address(0) && claim != address(0) && claim != cash &&
            claimUnits > 0 && usdcUnits > 0 && deadline > block.timestamp, InvalidOrder());
        // Bound multiplication in upstream LimitSwap (amount * balance); exact input is capped at balanceIn.
        require(claimUnits <= type(uint128).max && usdcUnits <= type(uint128).max, InvalidOrder());
        MakerTraitsLib.Args memory a;
        a.maker = maker;
        (a.tokenA, a.tokenB) = claim < cash ? (claim, cash) : (cash, claim);
        a.useAquaInsteadOfSignature = true;
        a.hasPreTransferInHook = true;
        a.preTransferInTarget = address(this);
        a.preTransferInData = abi.encode(id, feeStrip.marketState(id));
        // Takers may supply their own callback flags and transfer order to SwapVM.
        // Check after BOTH transfers so the last callback cannot leave an obsolete quote filled.
        a.hasPostTransferInHook = true;
        a.postTransferInTarget = address(this);
        a.postTransferInData = a.preTransferInData;
        a.hasPostTransferOutHook = true;
        a.postTransferOutTarget = address(this);
        a.postTransferOutData = a.preTransferInData;
        a.program = bytes.concat(
            Deadline.build(deadline),
            claim < cash ? StaticBalances.build(claimUnits, usdcUnits) : StaticBalances.build(usdcUnits, claimUnits),
            LimitSwap.build(claimsIn ? claim : cash, claimsIn ? cash : claim),
            Salt.build(abi.encode(salt))
        );
        return MakerTraitsLib.build(a);
    }

    /// @notice Encode an exact-input wallet trade with mandatory minimum output and expiry.
    /// @dev Wallet approves official router. Router pushes payment into Aqua; no custom taker callback.
    function takerData(address taker, address tokenIn, address tokenOut, uint256 minOut, uint40 deadline)
        external pure returns (bytes memory)
    {
        require(taker != address(0) && tokenIn != tokenOut && minOut > 0 && deadline > 0, InvalidOrder());
        TakerTraitsLib.Args memory a;
        a.taker = taker;
        a.isExactIn = true;
        a.isAToB = tokenIn < tokenOut;
        a.useTransferFromAndAquaPush = true;
        a.isFirstTransferFromTaker = true;
        a.threshold = abi.encode(minOut);
        a.deadline = deadline;
        a.to = taker;
        return TakerTraitsLib.build(a);
    }

    function preTransferIn(address, address, address tokenIn, address tokenOut,
        uint256, uint256, bytes32, bytes calldata makerData, bytes calldata) external view
    { _guard(tokenIn, tokenOut, makerData); }

    function postTransferIn(address, address, address tokenIn, address tokenOut,
        uint256, uint256, uint256, bytes32, bytes calldata makerData, bytes calldata) external view
    { _guard(tokenIn, tokenOut, makerData); }

    function postTransferOut(address, address, address tokenIn, address tokenOut,
        uint256, uint256, uint256, bytes32, bytes calldata makerData, bytes calldata) external view
    { _guard(tokenIn, tokenOut, makerData); }

    function _guard(address tokenIn, address tokenOut, bytes calldata makerData) private view {
        require(msg.sender == router, OnlyRouter());
        (uint256 id, bytes32 expected) = abi.decode(makerData, (uint256, bytes32));
        require(feeStrip.marketState(id) == expected, StaleSeries());
        address claim = feeStrip.claimToken(id);
        address cash = feeStrip.usdc();
        require((tokenIn == claim && tokenOut == cash) || (tokenOut == claim && tokenIn == cash), InvalidOrder());
    }
}
