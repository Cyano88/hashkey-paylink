// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Local test model for balance/share conversion; not a production token.
contract GiftShareRoundingMock is ERC20 {
    bool public shortShares;
    address public blocked;
    function setShortShares(bool value) external { shortShares=value; }
    function setBlocked(address value) external { blocked=value; }
    uint256 public multiplier = 1001701196801074000;
    constructor() ERC20("Rounding stock", "ROUND") {}
    function setMultiplier(uint256 value) external { require(value > 0); multiplier = value; }
    function mintShares(address to,uint256 shares) external { _mint(to,shares); }
    function getCurrentMultiplier() external view returns(uint256,uint256,uint256) { return(multiplier,0,0); }
    function getSharesByUnderlyingAmount(uint256 amount) external view returns(uint256) { return amount*1e18/multiplier; }
    function getUnderlyingAmountByShares(uint256 shares) external view returns(uint256) { return shares*multiplier/1e18; }
    function transferSharesFrom(address from,address to,uint256 shares) external returns(bool) { _spendAllowance(from,msg.sender,shares*multiplier/1e18);require(to!=blocked,'Blocked');_transfer(from,to,shortShares?shares-1:shares);return true; }
    function sharesOf(address owner) public view returns(uint256) { return super.balanceOf(owner); }
    function balanceOf(address owner) public view override returns(uint256) { return sharesOf(owner)*multiplier/1e18; }
    function totalSupply() public view override returns(uint256) { return super.totalSupply()*multiplier/1e18; }
    function transfer(address to,uint256 amount) public override returns(bool) { _transfer(msg.sender,to,amount*1e18/multiplier);return true; }
    function transferFrom(address from,address to,uint256 amount) public override returns(bool) { _spendAllowance(from,msg.sender,amount);_transfer(from,to,amount*1e18/multiplier);return true; }
    function transferShares(address to,uint256 shares) external returns(bool) { require(to!=blocked,'Blocked');_transfer(msg.sender,to,shortShares?shares-1:shares);return true; }
}
