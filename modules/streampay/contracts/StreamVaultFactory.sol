// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}      from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}   from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StreamVault} from "./StreamVault.sol";

/**
 * @title  StreamVaultFactory
 * @notice Deploys individual StreamVault contracts via CREATE2 and funds them
 *         atomically. The deterministic address means the recipient can be shown
 *         a funding address before the vault is deployed — identical to the
 *         InstantPay ghost-vault pattern.
 *
 * Arc Testnet deployment addresses
 * ─────────────────────────────────
 *   USDC  (native precompile)  0x3600000000000000000000000000000000000000
 *   Deploy with the Arc relayer wallet as `_relayer`.
 */
contract StreamVaultFactory {
    using SafeERC20 for IERC20;

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
     *         Call this off-chain to show the sender where to send funds,
     *         or on-chain to check whether a vault already exists.
     *
     * @param sender      Stream creator (funds provider).
     * @param recipient   Stream beneficiary.
     * @param totalAmount Total USDC locked in the stream (6 decimals on Arc).
     * @param startTime   Unix timestamp — streaming begins.
     * @param endTime     Unix timestamp — fully vested.
     * @param salt        Unique bytes32 stream ID (e.g. keccak256 of UUID).
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
            abi.encode(
                sender,
                recipient,
                usdc,
                totalAmount,
                startTime,
                endTime,
                relayer
            )
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
     * @notice Deploy a StreamVault and fund it atomically.
     *         Sender must `approve(factory, totalAmount)` before calling.
     *
     *   Gas breakdown (Arc USDC gas):
     *   • CREATE2 deployment   ~180k gas
     *   • USDC transferFrom    ~40k  gas
     *   • Event emission       ~5k   gas
     *
     * @param recipient   Address that will receive the streamed USDC.
     * @param totalAmount Amount of USDC to lock (arc native USDC, 6 decimals).
     * @param startTime   Unix timestamp for stream start.
     * @param endTime     Unix timestamp for full vesting.
     * @param salt        Unique bytes32 stream ID — determines the vault address.
     * @return vault      Address of the deployed StreamVault.
     */
    function createStream(
        address recipient,
        uint256 totalAmount,
        uint64  startTime,
        uint64  endTime,
        bytes32 salt
    ) external returns (address vault) {
        if (endTime <= startTime)   revert InvalidParams();
        if (totalAmount == 0)       revert InvalidParams();
        if (recipient == address(0)) revert InvalidParams();

        // Revert if this salt has already been used
        address predicted = getVaultAddress(
            msg.sender, recipient, totalAmount, startTime, endTime, salt
        );
        if (predicted.code.length > 0) revert StreamAlreadyExists();

        // Deploy vault — all stream params become immutables in the bytecode
        vault = address(new StreamVault{salt: salt}(
            msg.sender,
            recipient,
            usdc,
            totalAmount,
            startTime,
            endTime,
            relayer
        ));

        // Pull USDC from sender directly into the vault (one approval, one tx)
        IERC20(usdc).safeTransferFrom(msg.sender, vault, totalAmount);

        emit StreamCreated(salt, vault, msg.sender, recipient, totalAmount, startTime, endTime);
    }
}
