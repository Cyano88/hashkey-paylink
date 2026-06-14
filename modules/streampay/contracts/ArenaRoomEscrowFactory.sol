// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArenaRoomEscrow} from "./ArenaRoomEscrow.sol";

/**
 * @title ArenaRoomEscrowFactory
 * @notice Deploys StreamPay Arena room escrows with deterministic CREATE2 addresses.
 */
contract ArenaRoomEscrowFactory {
    address public immutable usdc;
    address public immutable treasury;
    address public immutable relayer;
    uint16 public constant PLATFORM_FEE_BPS = 50;

    event ArenaRoomCreated(
        bytes32 indexed roomId,
        address indexed escrow,
        address indexed host,
        uint256 entryAmount,
        uint16 maxPlayers,
        uint16 rounds,
        ArenaRoomEscrow.RiskCurve riskCurve,
        uint16 platformFeeBps
    );

    error InvalidParams();
    error RoomAlreadyExists();

    constructor(address _usdc, address _treasury, address _relayer) {
        if (_usdc == address(0) || _treasury == address(0) || _relayer == address(0)) revert InvalidParams();
        usdc = _usdc;
        treasury = _treasury;
        relayer = _relayer;
    }

    function getEscrowAddress(
        bytes32 roomId,
        address host,
        uint256 entryAmount,
        uint16 maxPlayers,
        uint16 rounds,
        ArenaRoomEscrow.RiskCurve riskCurve,
        bytes32 salt
    ) public view returns (address predicted) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(
            type(ArenaRoomEscrow).creationCode,
            abi.encode(
                roomId,
                usdc,
                treasury,
                host,
                relayer,
                entryAmount,
                maxPlayers,
                rounds,
                riskCurve,
                PLATFORM_FEE_BPS
            )
        ));

        predicted = address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            initCodeHash
        )))));
    }

    function createRoom(
        bytes32 roomId,
        uint256 entryAmount,
        uint16 maxPlayers,
        uint16 rounds,
        ArenaRoomEscrow.RiskCurve riskCurve,
        bytes32 salt
    ) external returns (address escrow) {
        if (roomId == bytes32(0)) revert InvalidParams();
        if (entryAmount == 0 || maxPlayers < 2 || rounds == 0) revert InvalidParams();

        address predicted = getEscrowAddress(roomId, msg.sender, entryAmount, maxPlayers, rounds, riskCurve, salt);
        if (predicted.code.length > 0) revert RoomAlreadyExists();

        escrow = address(new ArenaRoomEscrow{salt: salt}(
            roomId,
            usdc,
            treasury,
            msg.sender,
            relayer,
            entryAmount,
            maxPlayers,
            rounds,
            riskCurve,
            PLATFORM_FEE_BPS
        ));

        emit ArenaRoomCreated(roomId, escrow, msg.sender, entryAmount, maxPlayers, rounds, riskCurve, PLATFORM_FEE_BPS);
    }
}
