// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract GiftWalletMock {
    address public immutable owner;
    struct Call {address target;uint256 value;bytes data;}
    constructor(address account){owner=account;}
    function executeBatch(Call[] calldata calls) external {
        require(msg.sender==owner,"Wallet owner only");
        for(uint256 i;i<calls.length;i++){
            (bool ok,bytes memory result)=calls[i].target.call{value:calls[i].value}(calls[i].data);
            if(!ok)assembly("memory-safe"){revert(add(result,32),mload(result))}
        }
    }
}
