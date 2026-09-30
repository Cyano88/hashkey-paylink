// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Draft single-recipient USDC gift escrow. Not deployed or approved for production.
/// @dev No upgrade, admin withdrawal, cancellation before expiry, or manual-deposit activation.
/// The bearer gift key signs a recipient-bound EIP712 authorization; it is never published onchain.
contract PocketGiftEscrow is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    uint256 public constant PLATFORM_FEE_BPS = 25;
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(bytes32 giftId,address recipient,uint64 deadline)");
    IERC20 public immutable usdc;
    address public immutable treasury;
    uint256 public totalLocked;
    enum Status { Empty, Available, Claimed, Refunded }
    struct Gift {
        address sender;
        address claimSigner;
        uint128 amount;
        uint64 expiresAt;
        Status status;
    }
    mapping(bytes32 => Gift) public gifts;
    error InvalidGift();
    error GiftExists();
    error GiftNotAvailable();
    error GiftExpired();
    error NotExpired();
    error InvalidRecipient();
    error InvalidAuthorization();
    error IncorrectFunding();
    event GiftFunded(bytes32 indexed giftId, address indexed sender, address claimSigner, uint256 amount, uint256 platformFee, uint64 expiresAt);
    event GiftClaimed(bytes32 indexed giftId, address indexed recipient, uint256 amount);
    event GiftRefunded(bytes32 indexed giftId, address indexed sender, uint256 amount);

    constructor(address token, address feeTreasury) EIP712("PocketGift", "1") {
        if (token.code.length == 0 || feeTreasury == address(0) || feeTreasury == address(this)) revert InvalidGift();
        if (IERC20Metadata(token).decimals() != 6) revert InvalidGift();
        usdc = IERC20(token);
        treasury = feeTreasury;
    }
    function giftIdFor(address sender, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(sender, salt));
    }
    function platformFee(uint128 amount) public pure returns (uint256) {
        // Match Pocket paymentFeeBreakdown: floor in USDC base units.
        return uint256(amount) * PLATFORM_FEE_BPS / 10000;
    }
    function createGift(bytes32 salt, address claimSigner, uint128 amount, uint64 expiresAt) external nonReentrant returns (bytes32 giftId) {
        if (salt == bytes32(0) || claimSigner == address(0) || amount == 0 || expiresAt <= block.timestamp) revert InvalidGift();
        giftId = giftIdFor(msg.sender, salt);
        if (gifts[giftId].status != Status.Empty) revert GiftExists();
        uint256 fee = platformFee(amount);
        uint256 beforeBalance = usdc.balanceOf(address(this));
        gifts[giftId] = Gift(msg.sender, claimSigner, amount, expiresAt, Status.Available);
        totalLocked += amount;
        usdc.safeTransferFrom(msg.sender, address(this), uint256(amount) + fee);
        if (usdc.balanceOf(address(this)) != beforeBalance + uint256(amount) + fee) revert IncorrectFunding();
        if (fee != 0) usdc.safeTransfer(treasury, fee);
        if (usdc.balanceOf(address(this)) != beforeBalance + amount) revert IncorrectFunding();
        emit GiftFunded(giftId, msg.sender, claimSigner, amount, fee, expiresAt);
    }
    function claimDigest(bytes32 giftId, address recipient, uint64 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, giftId, recipient, deadline)));
    }
    /// Anyone may relay, but only to the recipient authorized by the gift key.
    function claim(bytes32 giftId, address recipient, uint64 deadline, bytes calldata signature) external nonReentrant {
        Gift storage gift = gifts[giftId];
        if (gift.status != Status.Available) revert GiftNotAvailable();
        if (block.timestamp >= gift.expiresAt) revert GiftExpired();
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (deadline < block.timestamp || deadline > gift.expiresAt) revert InvalidAuthorization();
        if (ECDSA.recover(claimDigest(giftId, recipient, deadline), signature) != gift.claimSigner) revert InvalidAuthorization();
        gift.status = Status.Claimed;
        totalLocked -= gift.amount;
        usdc.safeTransfer(recipient, gift.amount);
        emit GiftClaimed(giftId, recipient, gift.amount);
    }
    /// Permissionless refund execution enables sponsorship; funds only return to the original sender.
    function refundExpired(bytes32 giftId) external nonReentrant {
        Gift storage gift = gifts[giftId];
        if (gift.status != Status.Available) revert GiftNotAvailable();
        if (block.timestamp < gift.expiresAt) revert NotExpired();
        gift.status = Status.Refunded;
        totalLocked -= gift.amount;
        usdc.safeTransfer(gift.sender, gift.amount);
        emit GiftRefunded(giftId, gift.sender, gift.amount);
    }
}
