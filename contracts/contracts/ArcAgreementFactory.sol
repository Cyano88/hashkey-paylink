// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ArcAgreementEscrow} from "./ArcAgreementEscrow.sol";

/**
 * @title ArcAgreementFactory
 * @notice Atomically deploys and funds non-upgradeable Arc USDC agreements.
 */
contract ArcAgreementFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct CreateAgreementParams {
        bytes32 clientReference;
        bytes32 termsHash;
        address recipient;
        ArcAgreementEscrow.Template template;
        uint256 totalAmount;
        uint64 cancelUntil;
        uint64 expiresAt;
        uint16[] cumulativeReleaseBps;
    }

    IERC20 public immutable usdc;
    address public immutable operator;

    mapping(bytes32 => address) public agreementEscrow;

    event AgreementCreated(
        bytes32 indexed agreementId,
        bytes32 indexed clientReference,
        bytes32 termsHash,
        address indexed escrow,
        address payer,
        address recipient,
        ArcAgreementEscrow.Template template,
        uint256 totalAmount,
        uint64 cancelUntil,
        uint64 expiresAt
    );

    error InvalidParameters();
    error AgreementAlreadyExists();
    error IncorrectFunding();

    constructor(address _usdc, address _operator) {
        if (_usdc == address(0) || _operator == address(0) || _usdc == _operator) revert InvalidParameters();
        usdc = IERC20(_usdc);
        operator = _operator;
    }

    function agreementIdFor(address payer, bytes32 clientReference) public pure returns (bytes32) {
        if (payer == address(0) || clientReference == bytes32(0)) revert InvalidParameters();
        return keccak256(abi.encode(payer, clientReference));
    }

    function createAndFund(CreateAgreementParams calldata params) external nonReentrant returns (address escrowAddress) {
        bytes32 agreementId = agreementIdFor(msg.sender, params.clientReference);
        if (agreementEscrow[agreementId] != address(0)) revert AgreementAlreadyExists();

        ArcAgreementEscrow escrow = new ArcAgreementEscrow(ArcAgreementEscrow.AgreementConfig({
            agreementId: agreementId,
            clientReference: params.clientReference,
            termsHash: params.termsHash,
            payer: msg.sender,
            recipient: params.recipient,
            operator: operator,
            usdc: address(usdc),
            template: params.template,
            totalAmount: params.totalAmount,
            cancelUntil: params.cancelUntil,
            expiresAt: params.expiresAt,
            cumulativeReleaseBps: params.cumulativeReleaseBps
        }));
        escrowAddress = address(escrow);
        agreementEscrow[agreementId] = escrowAddress;

        uint256 beforeBalance = usdc.balanceOf(escrowAddress);
        usdc.safeTransferFrom(msg.sender, escrowAddress, params.totalAmount);
        uint256 received = usdc.balanceOf(escrowAddress) - beforeBalance;
        if (received != params.totalAmount) revert IncorrectFunding();
        escrow.activate();

        emit AgreementCreated(
            agreementId,
            params.clientReference,
            params.termsHash,
            escrowAddress,
            msg.sender,
            params.recipient,
            params.template,
            params.totalAmount,
            params.cancelUntil,
            params.expiresAt
        );
    }
}
