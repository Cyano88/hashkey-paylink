// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CheckpointVault {
    address public immutable sender;
    address public immutable recipient;
    address public immutable token;
    address public immutable relayer;
    bytes32 public immutable contentId;
    uint256 public immutable totalAmount;

    uint256 public releasedAmount;
    bool public refunded;

    event Released(address indexed recipient, uint256 amount, uint256 totalReleased);
    event Refunded(address indexed sender, uint256 amount);

    error OnlyRelayer();
    error OnlySender();
    error AlreadyRefunded();
    error InvalidParams();
    error NothingToRelease();
    error ReleaseTooHigh();
    error NothingToRefund();

    constructor(
        address _sender,
        address _recipient,
        address _token,
        address _relayer,
        bytes32 _contentId,
        uint256 _totalAmount
    ) {
        if (_sender == address(0) || _recipient == address(0) || _token == address(0) || _relayer == address(0)) {
            revert InvalidParams();
        }
        if (_contentId == bytes32(0) || _totalAmount == 0) revert InvalidParams();

        sender = _sender;
        recipient = _recipient;
        token = _token;
        relayer = _relayer;
        contentId = _contentId;
        totalAmount = _totalAmount;
    }

    function isFunded() public view returns (bool) {
        return IERC20(token).balanceOf(address(this)) + releasedAmount >= totalAmount;
    }

    function release(uint256 cumulativeAmount) external {
        if (msg.sender != relayer) revert OnlyRelayer();
        if (refunded) revert AlreadyRefunded();
        if (cumulativeAmount > totalAmount) revert ReleaseTooHigh();
        if (cumulativeAmount <= releasedAmount) revert NothingToRelease();

        uint256 payout = cumulativeAmount - releasedAmount;
        releasedAmount = cumulativeAmount;
        IERC20(token).transfer(recipient, payout);
        emit Released(recipient, payout, cumulativeAmount);
    }

    function refund() external {
        if (msg.sender != sender) revert OnlySender();
        if (refunded) revert AlreadyRefunded();
        refunded = true;

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert NothingToRefund();
        IERC20(token).transfer(sender, balance);
        emit Refunded(sender, balance);
    }

    function vaultInfo() external view returns (
        address _sender,
        address _recipient,
        address _token,
        address _relayer,
        bytes32 _contentId,
        uint256 _totalAmount,
        uint256 _releasedAmount,
        uint256 _refundableAmount,
        bool _refunded,
        bool _funded
    ) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        return (
            sender,
            recipient,
            token,
            relayer,
            contentId,
            totalAmount,
            releasedAmount,
            balance,
            refunded,
            balance + releasedAmount >= totalAmount
        );
    }
}
