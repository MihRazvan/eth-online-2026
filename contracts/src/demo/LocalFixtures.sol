// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";

/// @notice Unrestricted local demo faucet. NEVER authentic public-chain USDC.
contract LocalToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_, 6) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @notice Local-only native Uniswap activity source; users fund swaps/donations through approvals.
/// The router never has approval to any FeeStrip reserve. Donation events must be labeled as donations.
contract LocalActivityRouter is IUnlockCallback {
    using SafeTransferLib for ERC20;
    IPoolManager public immutable manager;
    PoolKey public key;
    event FundedDonation(address indexed payer, uint256 amount0, uint256 amount1);
    event NativeSwap(address indexed payer, bool zeroForOne, uint256 amountIn);

    constructor(IPoolManager manager_, PoolKey memory key_) { manager = manager_; key = key_; }

    function donate(uint256 amount0, uint256 amount1) external {
        manager.unlock(abi.encode(uint8(0), msg.sender, amount0, amount1, false));
        emit FundedDonation(msg.sender, amount0, amount1);
    }

    function swap(bool zeroForOne, uint256 amountIn) external {
        require(amountIn <= uint256(type(int256).max), "INPUT_OVERFLOW");
        manager.unlock(abi.encode(uint8(1), msg.sender, amountIn, uint256(0), zeroForOne));
        emit NativeSwap(msg.sender, zeroForOne, amountIn);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), "ONLY_MANAGER");
        (uint8 action, address payer, uint256 amount0, uint256 amount1, bool zeroForOne) = abi.decode(data, (uint8,address,uint256,uint256,bool));
        BalanceDelta delta;
        PoolKey memory pool = key;
        if (action == 0) {
            delta = manager.donate(pool, amount0, amount1, "");
        } else {
            delta = manager.swap(pool, SwapParams(zeroForOne, -int256(amount0), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1), "");
        }
        _settle(pool.currency0, delta.amount0(), payer);
        _settle(pool.currency1, delta.amount1(), payer);
        return "";
    }

    function _settle(Currency currency, int128 delta, address payer) private {
        if (delta < 0) {
            manager.sync(currency);
            ERC20(Currency.unwrap(currency)).safeTransferFrom(payer, address(manager), uint256(-int256(delta)));
            manager.settle();
        } else if (delta > 0) {
            manager.take(currency, payer, uint256(int256(delta)));
        }
    }
}
