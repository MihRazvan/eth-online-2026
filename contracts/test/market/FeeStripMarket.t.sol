// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
// Powered by SwapVM — © Degensoft Ltd 2025. FeeStrip integration tests, 2026-09-11.
import {FeeClaim} from "../../src/FeeClaim.sol";
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {FeeStripRouter} from "../../src/market/FeeStripRouter.sol";
import {TakerTraitsLib} from "swap-vm/contracts/libs/TakerTraits.sol";
import {ISwapVM} from "swap-vm/contracts/interfaces/ISwapVM.sol";
import {FeeStripMarket, IFeeStripMarketState} from "../../src/market/FeeStripMarket.sol";

contract MarketToken is ERC20 {
    constructor(string memory symbol_, address owner, uint256 supply) ERC20(symbol_, symbol_) { _mint(owner,supply); }
}
contract MarketStateFixture is IFeeStripMarketState {
    address public usdc;
    address public claim;
    bytes32 public state = keccak256("active");
    constructor(address cash, address claim_) { usdc=cash; claim=claim_; }
    function marketState(uint256) external view returns(bytes32) { return state; }
    function claimToken(uint256) external view returns(address) { return claim; }
    function settle() external { state=keccak256("settled"); }
}
contract FeeStripMarketTest is Test {
    Aqua aqua;
    FeeStripRouter router;
    FeeStripMarket market;
    MarketStateFixture state;
    MarketToken cash;
    FeeClaim claim;
    address maker=makeAddr("maker");
    address buyer=makeAddr("buyer");
    ISwapVM.Order order;
    bytes32 strategyHash;
    function setUp() public {
        aqua=new Aqua();
        router=new FeeStripRouter(address(aqua),address(0),address(this));
        cash=new MarketToken("USDC fixture",buyer,1000e6);
        claim=new FeeClaim(1000e18,maker,1000e18,maker);
        state=new MarketStateFixture(address(cash),address(claim));
        market=new FeeStripMarket(state,address(router));
        order=market.buildOrder(1,maker,false,1000e18,100e6,uint40(block.timestamp+3600),bytes32(uint256(1)));
        strategyHash=ship(order);
        vm.prank(buyer); cash.approve(address(router),type(uint256).max);
    }
    function ship(ISwapVM.Order memory o) internal returns(bytes32 h) {
        address[] memory tokens=new address[](2); tokens[0]=address(cash);tokens[1]=address(claim);
        uint256[] memory amounts=new uint256[](2); amounts[0]=100e6;amounts[1]=1000e18;
        vm.startPrank(maker);
        claim.approve(address(aqua),type(uint256).max);
        cash.approve(address(aqua),type(uint256).max);
        h=aqua.ship(address(router),abi.encode(o),tokens,amounts);
        vm.stopPrank();
        assertEq(h,router.hash(o));
    }
    function buy(uint256 amount,uint256 minimum) internal returns(uint256 out) {
        bytes memory data=market.takerData(buyer,address(cash),address(claim),minimum,uint40(block.timestamp+30));
        vm.prank(buyer);
        (,out,)=router.swap(order,amount,data);
    }
    function buyReverts(uint256 amount,uint256 minimum,bytes4 selector) internal {
        bytes memory data=market.takerData(buyer,address(cash),address(claim),minimum,uint40(block.timestamp+30));
        vm.prank(buyer);
        if(selector==bytes4(0)) vm.expectRevert(); else vm.expectRevert(selector);
        router.swap(order,amount,data);
    }
    function testOfficialRuntimeMovesBothAssets() public {
        assertEq(buy(10e6,100e18),100e18);
        assertEq(cash.balanceOf(maker),10e6); assertEq(cash.balanceOf(buyer),990e6);
        assertEq(claim.balanceOf(buyer),100e18); assertEq(claim.balanceOf(maker),900e18);
        assertEq(cash.balanceOf(address(aqua)),0);assertEq(claim.balanceOf(address(market)),0);
    }
    function testSellIssuedClaimsForUSDC() public {
        buy(10e6,100e18);
        vm.prank(buyer);cash.transfer(maker,100e6);
        ISwapVM.Order memory bid=market.buildOrder(1,maker,true,1000e18,100e6,uint40(block.timestamp+3600),bytes32(uint256(3)));
        ship(bid);
        vm.prank(buyer);claim.approve(address(router),100e18);
        bytes memory data=market.takerData(buyer,address(claim),address(cash),10e6,uint40(block.timestamp+30));
        uint256 beforeCash=cash.balanceOf(buyer);
        vm.prank(buyer);router.swap(bid,100e18,data);
        assertEq(cash.balanceOf(buyer)-beforeCash,10e6);
        assertEq(claim.balanceOf(buyer),0);
        assertEq(claim.totalSupply(),1000e18);
    }
    function testSlippageAtomicRollback() public {
        buyReverts(10e6,101e18,bytes4(0));
        assertEq(cash.balanceOf(buyer),1000e6);assertEq(claim.balanceOf(maker),1000e18);
    }
    function testRevokedMakerApproval() public {
        vm.prank(maker);claim.approve(address(aqua),0);
        buyReverts(10e6,100e18,bytes4(0));
        assertEq(cash.balanceOf(maker),0);
    }
    function testSharedAllocationIsNotLockedCapital() public {
        ISwapVM.Order memory second=market.buildOrder(1,maker,false,1000e18,100e6,uint40(block.timestamp+3600),bytes32(uint256(2)));
        ship(second);
        buy(100e6,1000e18);
        order=second;
        buyReverts(1e6,10e18,bytes4(0));
        assertEq(cash.balanceOf(maker),100e6);
    }
    function testSettlementInvalidatesProgram() public {
        state.settle();buyReverts(10e6,100e18,FeeStripMarket.StaleSeries.selector);
        assertEq(cash.balanceOf(maker),0);
    }
    function testExpiredProgramRejected() public {
        vm.warp(block.timestamp+3601);buyReverts(10e6,100e18,bytes4(0));
    }
    function testDockedProgramRejected() public {
        address[] memory tokens=new address[](2);tokens[0]=address(cash);tokens[1]=address(claim);
        vm.prank(maker);aqua.dock(address(router),strategyHash,tokens);
        buyReverts(10e6,100e18,bytes4(0));
    }
    function testForgedHookCallRejected() public {
        bytes memory hookData=abi.encode(1,state.state());
        vm.expectRevert(FeeStripMarket.OnlyRouter.selector);
        market.preTransferIn(maker,buyer,address(cash),address(claim),1,1,strategyHash,hookData,"");
    }
    function testCallbackStateChangesRollbackBothTransferOrders() public {
        StateChangingTaker taker=new StateChangingTaker(state,cash,router);
        vm.prank(buyer);cash.transfer(address(taker),20e6);
        for(uint256 i; i<4; ++i){
            TakerTraitsLib.Args memory a;
            a.taker=address(taker);a.isExactIn=true;a.isAToB=address(cash)<address(claim);
            a.useTransferFromAndAquaPush=true;a.isFirstTransferFromTaker=i<2;
            a.hasPreTransferInCallback=i%2==0;a.hasPreTransferOutCallback=i%2==1;
            a.threshold=abi.encode(100e18);a.deadline=uint40(block.timestamp+30);
            bytes memory data=TakerTraitsLib.build(a);
            vm.expectRevert(FeeStripMarket.StaleSeries.selector);
            taker.run(order,10e6,data);
            assertEq(cash.balanceOf(address(taker)),20e6);
            assertEq(claim.balanceOf(maker),1000e18);
            assertEq(state.state(),keccak256("active"));
        }
    }
    function testFuzzPriceRatio(uint96 amount) public {
        amount=uint96(bound(amount,1,100e6));
        uint256 expected=uint256(amount)*1000e18/100e6;
        assertEq(buy(amount,expected),expected);
        assertEq(cash.balanceOf(maker),amount);
    }
}

/// @dev Local regression: a caller changes the quoted lifecycle state in a supported runtime callback.
contract StateChangingTaker {
    MarketStateFixture immutable state;
    MarketToken immutable cash;
    FeeStripRouter immutable router;
    constructor(MarketStateFixture s,MarketToken c,FeeStripRouter r){state=s;cash=c;router=r;}
    function run(ISwapVM.Order calldata o,uint256 amount,bytes calldata data) external {
        cash.approve(address(router),amount);router.swap(o,amount,data);
    }
    function preTransferInCallback(address,address,address,address,uint256,uint256,bytes32,bytes calldata) external {
        require(msg.sender==address(router));state.settle();
    }
    function preTransferOutCallback(address,address,address,address,uint256,uint256,bytes32,bytes calldata) external {
        require(msg.sender==address(router));state.settle();
    }
}
