// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CheckpointVault} from "./CheckpointVault.sol";

contract CheckpointVaultFactory {
    address public immutable token;
    address public immutable relayer;

    event CheckpointVaultCreated(
        address indexed vault,
        address indexed sender,
        address indexed recipient,
        bytes32 contentId,
        uint256 totalAmount,
        bytes32 salt
    );

    error InvalidParams();
    error AlreadyDeployed();

    constructor(address _token, address _relayer) {
        if (_token == address(0) || _relayer == address(0)) revert InvalidParams();
        token = _token;
        relayer = _relayer;
    }

    function getVaultAddress(
        address sender,
        address recipient,
        bytes32 contentId,
        uint256 totalAmount,
        bytes32 salt
    ) public view returns (address) {
        bytes32 finalSalt = keccak256(abi.encode(sender, recipient, contentId, totalAmount, salt));
        bytes memory bytecode = abi.encodePacked(
            type(CheckpointVault).creationCode,
            abi.encode(sender, recipient, token, relayer, contentId, totalAmount)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), finalSalt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }

    function createCheckpointVault(
        address recipient,
        bytes32 contentId,
        uint256 totalAmount,
        bytes32 salt
    ) external returns (address vault) {
        if (recipient == address(0) || contentId == bytes32(0) || totalAmount == 0) revert InvalidParams();

        vault = getVaultAddress(msg.sender, recipient, contentId, totalAmount, salt);
        if (vault.code.length != 0) revert AlreadyDeployed();

        bytes32 finalSalt = keccak256(abi.encode(msg.sender, recipient, contentId, totalAmount, salt));
        vault = address(new CheckpointVault{salt: finalSalt}(
            msg.sender,
            recipient,
            token,
            relayer,
            contentId,
            totalAmount
        ));

        emit CheckpointVaultCreated(vault, msg.sender, recipient, contentId, totalAmount, salt);
    }
}
