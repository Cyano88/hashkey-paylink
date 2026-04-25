// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StreamVault} from "./StreamVault.sol";

/**
 * @title  StreamVaultFactory
 * @notice Deploys StreamVault contracts via CREATE2 with deterministic addresses.
 *
 * Arc Testnet ghost-vault flow (mirrors InstantPay pattern — no SafeERC20 needed):
 *   1. Off-chain: call getVaultAddress() to pre-compute the vault address.
 *   2. Sender transfers USDC directly to that address via IERC20.transfer().
 *      No approve() required — direct transfer works with Arc's USDC precompile.
 *   3. Call createStream() — deploys the vault (funds are already there).
 *
 * Steps 2 and 3 can happen in either order because the address is deterministic.
 *
 * Arc Testnet:
 *   USDC native precompile  0x3600000000000000000000000000000000000000
 */
contract StreamVaultFactory {
    address public immutable usdc;
    address public immutable treasury;
    address public immutable relayer;

    event StreamCreated(
        bytes32 indexed streamId,
        address indexed vault,
        address indexed sender,
        address         recipient,
        uint256         totalAmount,
        uint64          startTime,
        uint64          endTime
    );

    error InvalidParams();
    error StreamAlreadyExists();

    constructor(address _usdc, address _treasury, address _relayer) {
        if (_usdc == address(0) || _relayer == address(0)) revert InvalidParams();
        usdc     = _usdc;
        treasury = _treasury;
        relayer  = _relayer;
    }

    // ── Address pre-computation ───────────────────────────────────────────────

    /**
     * @notice Compute the deterministic vault address before deployment.
     *         Send USDC here first, then call createStream() to deploy.
     */
    function getVaultAddress(
        address sender,
        address recipient,
        uint256 totalAmount,
        uint64  startTime,
        uint64  endTime,
        bytes32 salt
    ) public view returns (address predicted) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(
            type(StreamVault).creationCode,
            abi.encode(sender, recipient, usdc, totalAmount, startTime, endTime, relayer)
        ));
        predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            initCodeHash
        )))));
    }

    // ── Stream creation ───────────────────────────────────────────────────────

    /**
     * @notice Deploy a StreamVault via CREATE2.
     *         Send USDC to getVaultAddress() BEFORE calling this.
     *         No approve() or transferFrom() — direct USDC.transfer() only.
     *
     * @param recipient   Stream beneficiary.
     * @param totalAmount USDC amount in 6-decimal units.
     * @param startTime   Streaming start timestamp (Unix seconds).
     * @param endTime     Full-vesting timestamp (Unix seconds).
     * @param salt        Unique bytes32 stream ID (use a random value).
     * @return vault      Deployed StreamVault address (matches getVaultAddress()).
     */
    function createStream(
        address recipient,
        uint256 totalAmount,
        uint64  startTime,
        uint64  endTime,
        bytes32 salt
    ) external returns (address vault) {
        if (endTime <= startTime)     revert InvalidParams();
        if (totalAmount == 0)         revert InvalidParams();
        if (recipient == address(0))  revert InvalidParams();

        // Guard against duplicate deployment with the same salt
        address predicted = getVaultAddress(msg.sender, recipient, totalAmount, startTime, endTime, salt);
        if (predicted.code.length > 0) revert StreamAlreadyExists();

        // Deploy vault — all stream parameters are embedded as immutables
        vault = address(new StreamVault{salt: salt}(
            msg.sender,
            recipient,
            usdc,
            totalAmount,
            startTime,
            endTime,
            relayer
        ));

        // No transferFrom — caller already sent USDC to vault address directly
        emit StreamCreated(salt, vault, msg.sender, recipient, totalAmount, startTime, endTime);
    }
}
