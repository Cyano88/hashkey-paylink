// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ArenaRoomEscrow
 * @notice Multiplayer StreamPay Arena escrow for recoverable-risk USDC games.
 *
 * Players fund the room by transferring Arc USDC directly to this contract,
 * then calling join(). This mirrors Hash PayLink's ghost-vault habit of
 * direct USDC funding instead of relying on SafeERC20 wrappers.
 *
 * The contract owns custody and settlement:
 * - deposits are tracked per player;
 * - eliminated players can withdraw their unstreamed balance;
 * - streamed risk stays in the room pot;
 * - a successful room charges Hash PayLink's platform fee;
 * - the winner receives the remaining settled balance.
 *
 * Trivia correctness and timer observation are off-chain signals for now.
 * The trusted relayer/host submits round outcomes. This keeps the first
 * public version auditable while the product proves demand.
 */
contract ArenaRoomEscrow {
    enum RoomStatus {
        Lobby,
        Playing,
        Settled,
        Cancelled
    }

    enum RiskCurve {
        Linear,
        Climb,
        Finale
    }

    struct PlayerState {
        bool joined;
        bool active;
        bool refunded;
        uint256 streamed;
        uint256 refundable;
    }

    address public immutable usdc;
    address public immutable treasury;
    address public immutable host;
    address public immutable relayer;
    bytes32 public immutable roomId;
    uint256 public immutable entryAmount;
    uint16 public immutable maxPlayers;
    uint16 public immutable rounds;
    RiskCurve public immutable riskCurve;
    uint16 public immutable platformFeeBps;

    RoomStatus public status;
    uint16 public playerCount;
    uint16 public activeCount;
    uint16 public currentRound;
    uint256 public accountedDeposits;
    uint256 public reservedRefunds;
    uint256 public totalStreamed;
    bool public platformFeePaid;
    address public winner;

    address[] private playerList;
    mapping(address => PlayerState) public players;

    event PlayerJoined(address indexed player, uint256 entryAmount);
    event RoomStarted(uint16 players, uint16 rounds);
    event PlayerEliminated(address indexed player, uint16 indexed round, uint256 streamed, uint256 refundable);
    event PlayerRefunded(address indexed player, uint256 amount);
    event RoomCancelled(uint256 reservedRefunds);
    event RoomSettled(address indexed winner, uint256 winnerPayout, uint256 platformFee);

    error InvalidParams();
    error InvalidStatus();
    error AlreadyJoined();
    error RoomFull();
    error NotJoined();
    error NotActive();
    error NothingToRefund();
    error OnlyHostOrRelayer();
    error OnlyRelayer();
    error BadWinner();
    error InsufficientFunding();
    error RoomStillContested();

    modifier onlyHostOrRelayer() {
        if (msg.sender != host && msg.sender != relayer) revert OnlyHostOrRelayer();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    constructor(
        bytes32 _roomId,
        address _usdc,
        address _treasury,
        address _host,
        address _relayer,
        uint256 _entryAmount,
        uint16 _maxPlayers,
        uint16 _rounds,
        RiskCurve _riskCurve,
        uint16 _platformFeeBps
    ) {
        if (_roomId == bytes32(0)) revert InvalidParams();
        if (_usdc == address(0) || _treasury == address(0)) revert InvalidParams();
        if (_host == address(0) || _relayer == address(0)) revert InvalidParams();
        if (_entryAmount == 0 || _maxPlayers < 2 || _rounds == 0) revert InvalidParams();
        if (_platformFeeBps > 1_000) revert InvalidParams();

        roomId = _roomId;
        usdc = _usdc;
        treasury = _treasury;
        host = _host;
        relayer = _relayer;
        entryAmount = _entryAmount;
        maxPlayers = _maxPlayers;
        rounds = _rounds;
        riskCurve = _riskCurve;
        platformFeeBps = _platformFeeBps;
        status = RoomStatus.Lobby;
    }

    function join() external {
        if (status != RoomStatus.Lobby) revert InvalidStatus();
        if (players[msg.sender].joined) revert AlreadyJoined();
        if (playerCount >= maxPlayers) revert RoomFull();

        uint256 available = IERC20(usdc).balanceOf(address(this)) - accountedDeposits;
        if (available < entryAmount) revert InsufficientFunding();

        players[msg.sender] = PlayerState({
            joined: true,
            active: true,
            refunded: false,
            streamed: 0,
            refundable: entryAmount
        });
        playerList.push(msg.sender);
        playerCount += 1;
        activeCount += 1;
        accountedDeposits += entryAmount;
        reservedRefunds += entryAmount;

        emit PlayerJoined(msg.sender, entryAmount);
    }

    function startRoom() external onlyHostOrRelayer {
        if (status != RoomStatus.Lobby) revert InvalidStatus();
        if (playerCount < 2) revert InvalidParams();

        status = RoomStatus.Playing;
        currentRound = 1;

        emit RoomStarted(playerCount, rounds);
    }

    function eliminate(address player, uint16 roundNumber) external onlyHostOrRelayer {
        if (status != RoomStatus.Playing) revert InvalidStatus();
        PlayerState storage state = players[player];
        if (!state.joined) revert NotJoined();
        if (!state.active) revert NotActive();
        if (roundNumber == 0 || roundNumber > rounds) revert InvalidParams();

        uint256 shouldStream = streamedThrough(roundNumber);
        uint256 delta = shouldStream > state.streamed ? shouldStream - state.streamed : 0;
        uint256 refundable = entryAmount - shouldStream;

        state.active = false;
        state.streamed = shouldStream;
        state.refundable = refundable;
        activeCount -= 1;
        totalStreamed += delta;
        reservedRefunds -= delta;
        if (roundNumber > currentRound) currentRound = roundNumber;

        emit PlayerEliminated(player, roundNumber, shouldStream, refundable);
    }

    function cancelRoom() external onlyHostOrRelayer {
        if (status != RoomStatus.Lobby && status != RoomStatus.Playing) revert InvalidStatus();
        status = RoomStatus.Cancelled;

        for (uint256 i = 0; i < playerList.length; i++) {
            address player = playerList[i];
            PlayerState storage state = players[player];
            if (state.active) {
                state.active = false;
                state.refundable = entryAmount - state.streamed;
            }
        }

        emit RoomCancelled(reservedRefunds);
    }

    function refund() external {
        PlayerState storage state = players[msg.sender];
        if (!state.joined) revert NotJoined();
        if (state.active && status != RoomStatus.Cancelled) revert InvalidStatus();
        if (state.refunded || state.refundable == 0) revert NothingToRefund();

        uint256 amount = state.refundable;
        state.refunded = true;
        state.refundable = 0;
        reservedRefunds -= amount;

        IERC20(usdc).transfer(msg.sender, amount);
        emit PlayerRefunded(msg.sender, amount);
    }

    function settleWinner(address _winner) external onlyRelayer {
        if (status != RoomStatus.Playing) revert InvalidStatus();
        PlayerState storage state = players[_winner];
        if (!state.joined || !state.active) revert BadWinner();
        if (activeCount != 1) revert RoomStillContested();

        status = RoomStatus.Settled;
        winner = _winner;
        state.active = false;
        activeCount = 0;
        reservedRefunds -= state.refundable;
        state.refundable = 0;

        uint256 balance = IERC20(usdc).balanceOf(address(this));
        uint256 platformFee = (accountedDeposits * platformFeeBps) / 10_000;
        uint256 winnerPayout = balance - reservedRefunds - platformFee;

        platformFeePaid = true;
        if (platformFee > 0) IERC20(usdc).transfer(treasury, platformFee);
        if (winnerPayout > 0) IERC20(usdc).transfer(_winner, winnerPayout);

        emit RoomSettled(_winner, winnerPayout, platformFee);
    }

    /**
     * @notice Amount of the player's entry streamed into the prize pool after roundNumber.
     * Linear: same risk every round.
     * Climb: risk increases steadily each round.
     * Finale: low early risk with heavier final-round exposure.
     */
    function streamedThrough(uint16 roundNumber) public view returns (uint256) {
        if (roundNumber >= rounds) return entryAmount;
        uint256 completed = uint256(roundNumber);
        uint256 totalRounds = uint256(rounds);

        if (riskCurve == RiskCurve.Linear) {
            return (entryAmount * completed) / totalRounds;
        }

        if (riskCurve == RiskCurve.Finale) {
            uint256 numerator = completed * completed;
            uint256 denominator = totalRounds * totalRounds;
            return (entryAmount * numerator) / denominator;
        }

        uint256 climbNumerator = completed * (completed + 1);
        uint256 climbDenominator = totalRounds * (totalRounds + 1);
        return (entryAmount * climbNumerator) / climbDenominator;
    }

    function playersList() external view returns (address[] memory) {
        return playerList;
    }

    function roomInfo() external view returns (
        RoomStatus _status,
        uint16 _playerCount,
        uint16 _activeCount,
        uint16 _currentRound,
        uint256 _accountedDeposits,
        uint256 _reservedRefunds,
        uint256 _totalStreamed,
        address _winner
    ) {
        return (
            status,
            playerCount,
            activeCount,
            currentRound,
            accountedDeposits,
            reservedRefunds,
            totalStreamed,
            winner
        );
    }
}
