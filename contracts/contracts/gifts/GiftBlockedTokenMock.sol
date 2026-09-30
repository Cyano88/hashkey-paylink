// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract GiftBlockedTokenMock is ERC20 {
    mapping(address => bool) public blocked;
    constructor() ERC20("Test USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setBlocked(address account, bool value) external { blocked[account] = value; }
    function _update(address from, address to, uint256 amount) internal override {
        require(!blocked[from] && !blocked[to], "Blocked token account");
        super._update(from, to, amount);
    }
}
