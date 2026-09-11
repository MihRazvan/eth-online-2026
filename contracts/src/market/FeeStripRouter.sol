// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
// Powered by SwapVM — © Degensoft Ltd 2025.
// FeeStrip extension, 2026-09-11: dispatch two upstream fixed-price instructions.
import {AquaSwapVMRouter} from "swap-vm/contracts/routers/AquaSwapVMRouter.sol";
import {Context} from "swap-vm/contracts/libs/VM.sol";
import {StaticBalances} from "swap-vm/contracts/instructions/Balances.sol";
import {LimitSwap} from "swap-vm/contracts/instructions/LimitSwap.sol";

/// @notice Official Aqua runtime extended with official fixed-price instructions.
/// @dev Default Aqua router omits these opcodes; source-matched encoding alone is insufficient.
contract FeeStripRouter is AquaSwapVMRouter {
    constructor(address aqua, address weth, address owner)
        AquaSwapVMRouter(aqua, weth, owner, "FeeStrip SwapVM", "1") {}
    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        if (opcode == StaticBalances.opcode.asU8()) StaticBalances.exec(ctx,args);
        else if (opcode == LimitSwap.opcode.asU8()) LimitSwap.exec(ctx,args);
        else super._runOpcode(ctx,opcode,args);
    }
}
