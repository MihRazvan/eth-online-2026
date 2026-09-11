// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26 <=0.8.30;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @notice Each unit carries its original-Q share of all unpaid sold-window USDC.
/// No holder checkpoints, late mint, owner burn, or reserve approvals exist.
contract FeeClaim is ERC20 {
    address public immutable escrow;
    uint256 public immutable originalSupply;

    constructor(uint256 quantity, address buyer, uint256 buyerQuantity, address seller)
        ERC20("FeeStrip USDC Fee Claim", "FEE", 18)
    {
        escrow = msg.sender;
        originalSupply = quantity;
        _mint(buyer, buyerQuantity);
        _mint(seller, quantity - buyerQuantity);
    }

    function consume(address holder, uint256 amount) external {
        require(msg.sender == escrow, "ONLY_ESCROW");
        _burn(holder, amount);
    }
}
