// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcAgreementEscrow
 * @notice Non-upgradeable, pull-funded USDC escrow for one agreement.
 *
 * The factory deploys and funds this contract atomically. No caller should
 * transfer funds to a predicted or undeployed address.
 */
contract ArcAgreementEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TOTAL_AMOUNT = 1_000_000 * 1e6;

    enum Template {
        FixedUnlock,
        ProgressiveRelease,
        Milestone
    }

    enum Status {
        AwaitingFunding,
        Active,
        Completed,
        Cancelled,
        Refunded
    }

    struct AgreementConfig {
        bytes32 agreementId;
        bytes32 clientReference;
        bytes32 termsHash;
        address payer;
        address recipient;
        address operator;
        address usdc;
        Template template;
        uint256 totalAmount;
        uint64 cancelUntil;
        uint64 expiresAt;
        uint16[] cumulativeReleaseBps;
    }

    bytes32 public immutable agreementId;
    bytes32 public immutable clientReference;
    bytes32 public immutable termsHash;
    address public immutable factory;
    address public immutable payer;
    address public immutable recipient;
    address public immutable operator;
    IERC20 public immutable usdc;
    Template public immutable template;
    uint256 public immutable totalAmount;
    uint64 public immutable cancelUntil;
    uint64 public immutable expiresAt;

    Status public status;
    uint8 public nextStep;
    uint256 public releasedAmount;

    uint16[] private cumulativeReleaseBps;

    event AgreementActivated(bytes32 indexed agreementId, uint256 amount);
    event StepReleased(
        bytes32 indexed agreementId,
        uint8 indexed step,
        uint256 amount,
        uint256 totalReleased,
        bytes32 evidenceHash
    );
    event AgreementCancelled(bytes32 indexed agreementId, address indexed actor, uint256 refundedAmount, bytes32 reasonHash);
    event AgreementRefunded(bytes32 indexed agreementId, uint256 refundedAmount);
    event ExcessRecovered(bytes32 indexed agreementId, address indexed payer, uint256 amount);

    error InvalidParameters();
    error InvalidSchedule();
    error InvalidStatus();
    error OnlyFactory();
    error OnlyOperator();
    error OnlyPayer();
    error WrongStep();
    error CancellationUnavailable();
    error NotExpired();
    error AgreementExpired();
    error InvalidEvidence();
    error IncorrectFunding();
    error NothingToRecover();

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    modifier onlyPayer() {
        if (msg.sender != payer) revert OnlyPayer();
        _;
    }

    constructor(AgreementConfig memory config) {
        if (config.agreementId == bytes32(0) || config.clientReference == bytes32(0) || config.termsHash == bytes32(0)) {
            revert InvalidParameters();
        }
        if (config.payer == address(0) || config.recipient == address(0) || config.operator == address(0) || config.usdc == address(0)) {
            revert InvalidParameters();
        }
        if (
            config.payer == config.recipient
                || config.operator == config.payer
                || config.operator == config.recipient
                || config.usdc == config.payer
                || config.usdc == config.recipient
                || config.usdc == config.operator
                || config.totalAmount == 0
                || config.totalAmount > MAX_TOTAL_AMOUNT
        ) {
            revert InvalidParameters();
        }
        if (config.expiresAt <= block.timestamp || config.expiresAt > block.timestamp + 366 days) revert InvalidParameters();
        if (config.cancelUntil != 0 && (config.cancelUntil < block.timestamp || config.cancelUntil >= config.expiresAt)) {
            revert InvalidParameters();
        }

        uint256 scheduleLength = config.cumulativeReleaseBps.length;
        if (scheduleLength == 0 || scheduleLength > 20) revert InvalidSchedule();
        if (config.template == Template.FixedUnlock && scheduleLength != 1) revert InvalidSchedule();
        if (config.template == Template.ProgressiveRelease && scheduleLength < 2) revert InvalidSchedule();
        if (config.template == Template.Milestone && scheduleLength > 10) revert InvalidSchedule();

        uint16 previous;
        uint256 previousCumulativeAmount;
        for (uint256 i = 0; i < scheduleLength; i++) {
            uint16 current = config.cumulativeReleaseBps[i];
            if (current <= previous || current > 10_000) revert InvalidSchedule();
            uint256 cumulativeAmount = i == scheduleLength - 1
                ? config.totalAmount
                : (config.totalAmount * current) / 10_000;
            if (cumulativeAmount <= previousCumulativeAmount) revert InvalidSchedule();
            cumulativeReleaseBps.push(current);
            previous = current;
            previousCumulativeAmount = cumulativeAmount;
        }
        if (previous != 10_000) revert InvalidSchedule();

        agreementId = config.agreementId;
        clientReference = config.clientReference;
        termsHash = config.termsHash;
        factory = msg.sender;
        payer = config.payer;
        recipient = config.recipient;
        operator = config.operator;
        usdc = IERC20(config.usdc);
        template = config.template;
        totalAmount = config.totalAmount;
        cancelUntil = config.cancelUntil;
        expiresAt = config.expiresAt;
        status = Status.AwaitingFunding;
    }

    function activate() external onlyFactory {
        if (status != Status.AwaitingFunding) revert InvalidStatus();
        if (usdc.balanceOf(address(this)) < totalAmount) revert IncorrectFunding();
        status = Status.Active;
        emit AgreementActivated(agreementId, totalAmount);
    }

    function releaseStep(uint8 step, bytes32 evidenceHash) external onlyOperator nonReentrant {
        if (status != Status.Active) revert InvalidStatus();
        if (block.timestamp >= expiresAt) revert AgreementExpired();
        if (evidenceHash == bytes32(0)) revert InvalidEvidence();
        if (step != nextStep || step >= cumulativeReleaseBps.length) revert WrongStep();

        uint256 cumulativeAmount = step == cumulativeReleaseBps.length - 1
            ? totalAmount
            : (totalAmount * cumulativeReleaseBps[step]) / 10_000;
        uint256 payout = cumulativeAmount - releasedAmount;
        if (payout == 0) revert InvalidSchedule();

        releasedAmount = cumulativeAmount;
        nextStep = step + 1;
        if (cumulativeAmount == totalAmount) status = Status.Completed;

        usdc.safeTransfer(recipient, payout);
        emit StepReleased(agreementId, step, payout, cumulativeAmount, evidenceHash);
    }

    function cancelByPayer() external onlyPayer nonReentrant {
        if (status != Status.Active) revert InvalidStatus();
        if (cancelUntil == 0 || block.timestamp > cancelUntil || releasedAmount != 0) {
            revert CancellationUnavailable();
        }
        _cancelAndRefund(Status.Cancelled, bytes32(0));
    }

    function cancelByOperator(bytes32 reasonHash) external onlyOperator nonReentrant {
        if (status != Status.Active) revert InvalidStatus();
        if (reasonHash == bytes32(0)) revert InvalidEvidence();
        _cancelAndRefund(Status.Cancelled, reasonHash);
    }

    function refundExpired() external onlyPayer nonReentrant {
        if (status != Status.Active) revert InvalidStatus();
        if (block.timestamp < expiresAt) revert NotExpired();

        uint256 refundAmount = totalAmount - releasedAmount;
        status = Status.Refunded;
        usdc.safeTransfer(payer, refundAmount);
        emit AgreementRefunded(agreementId, refundAmount);
    }

    function recoverExcess() external onlyPayer nonReentrant {
        uint256 obligation = status == Status.Active ? totalAmount - releasedAmount : 0;
        uint256 balance = usdc.balanceOf(address(this));
        if (balance <= obligation) revert NothingToRecover();
        uint256 excess = balance - obligation;
        usdc.safeTransfer(payer, excess);
        emit ExcessRecovered(agreementId, payer, excess);
    }

    function releaseSchedule() external view returns (uint16[] memory) {
        return cumulativeReleaseBps;
    }

    function remainingAmount() external view returns (uint256) {
        return status == Status.Active ? totalAmount - releasedAmount : 0;
    }

    function _cancelAndRefund(Status terminalStatus, bytes32 reasonHash) private {
        uint256 refundAmount = totalAmount - releasedAmount;
        status = terminalStatus;
        usdc.safeTransfer(payer, refundAmount);
        emit AgreementCancelled(agreementId, msg.sender, refundAmount, reasonHash);
    }
}
