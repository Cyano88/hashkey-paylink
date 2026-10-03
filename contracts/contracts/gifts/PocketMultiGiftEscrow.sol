// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Versioned equal-share gift escrow; not enabled in Pocket production.
/// @dev Claim authority attests Pocket account identity; bearer key authorizes destination.
/// No admin withdrawals, upgrades or pre-expiry cancellation. Token allowlist is fixed at deployment.
contract PocketMultiGiftEscrow is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    uint256 public constant PLATFORM_FEE_BPS = 25;
    uint32 public constant MAX_CLAIMS = 1000;
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(bytes32 giftId,bytes32 accountId,address recipient,uint64 deadline)");
    address public immutable treasury;
    address public immutable claimAuthority;
    mapping(address => bool) public supportedToken;
    mapping(address => uint256) public totalLocked;
    enum Status { Empty, Available, Claimed, Refunded }
    struct Gift { address sender; address token; address claimSigner; uint128 amountPerClaim; uint32 maxClaims; uint32 claimed; uint64 expiresAt; Status status; }
    mapping(bytes32 => Gift) public gifts;
    mapping(bytes32 => mapping(bytes32 => bool)) public claimedAccount;
    mapping(bytes32 => mapping(address => bool)) public claimedWallet;
    error InvalidGift(); error GiftExists(); error GiftUnavailable(); error Expired(); error NotExpired(); error AlreadyClaimed(); error Unauthorized(); error IncorrectTransfer();
    event GiftFunded(bytes32 indexed giftId,address indexed sender,address indexed token,address claimSigner,uint128 amountPerClaim,uint32 maxClaims,uint256 platformFee,uint64 expiresAt);
    event GiftClaimed(bytes32 indexed giftId,bytes32 indexed accountId,address indexed recipient,uint256 amount,uint32 claimed);
    event GiftRefunded(bytes32 indexed giftId,address indexed sender,uint256 amount);
    constructor(address[] memory tokens,address feeTreasury,address authority) EIP712("PocketMultiGift","1") {
        if(tokens.length==0 || feeTreasury==address(0) || feeTreasury==address(this) || authority==address(0)) revert InvalidGift();
        treasury=feeTreasury; claimAuthority=authority;
        for(uint256 i;i<tokens.length;i++){if(tokens[i].code.length==0 || supportedToken[tokens[i]])revert InvalidGift();supportedToken[tokens[i]]=true;}
    }
    function giftIdFor(address sender,bytes32 salt) public pure returns(bytes32){return keccak256(abi.encode(sender,salt));}
    function createGift(bytes32 salt,address token,address signer,uint128 amountPerClaim,uint32 maxClaims,uint64 expiresAt) external nonReentrant returns(bytes32 id){
        if(salt==bytes32(0)||!supportedToken[token]||signer==address(0)||amountPerClaim==0||maxClaims==0||maxClaims>MAX_CLAIMS||expiresAt<=block.timestamp||expiresAt>block.timestamp+30 days)revert InvalidGift();
        id=giftIdFor(msg.sender,salt);if(gifts[id].status!=Status.Empty)revert GiftExists();
        uint256 principal=uint256(amountPerClaim)*maxClaims;uint256 fee=principal*PLATFORM_FEE_BPS/10000;
        IERC20 asset=IERC20(token);uint256 beforeBalance=asset.balanceOf(address(this));
        gifts[id]=Gift(msg.sender,token,signer,amountPerClaim,maxClaims,0,expiresAt,Status.Available);totalLocked[token]+=principal;
        asset.safeTransferFrom(msg.sender,address(this),principal+fee);
        if(asset.balanceOf(address(this))!=beforeBalance+principal+fee)revert IncorrectTransfer();
        if(fee!=0)_transferExact(asset,treasury,fee);
        emit GiftFunded(id,msg.sender,token,signer,amountPerClaim,maxClaims,fee,expiresAt);
    }
    function claimDigest(bytes32 id,bytes32 accountId,address recipient,uint64 deadline) public view returns(bytes32){return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH,id,accountId,recipient,deadline)));}
    function claim(bytes32 id,bytes32 accountId,address recipient,uint64 deadline,bytes calldata giftSignature,bytes calldata accountSignature) external nonReentrant {
        Gift storage g=gifts[id];if(g.status!=Status.Available)revert GiftUnavailable();
        if(block.timestamp>=g.expiresAt)revert Expired();
        if(accountId==bytes32(0)||recipient==address(0)||recipient==address(this)||deadline<block.timestamp||deadline>g.expiresAt)revert Unauthorized();
        if(claimedAccount[id][accountId]||claimedWallet[id][recipient])revert AlreadyClaimed();
        bytes32 digest=claimDigest(id,accountId,recipient,deadline);
        if(ECDSA.recover(digest,giftSignature)!=g.claimSigner||ECDSA.recover(digest,accountSignature)!=claimAuthority)revert Unauthorized();
        claimedAccount[id][accountId]=true;claimedWallet[id][recipient]=true;g.claimed++;
        if(g.claimed==g.maxClaims)g.status=Status.Claimed;
        totalLocked[g.token]-=g.amountPerClaim;
        _transferExact(IERC20(g.token),recipient,g.amountPerClaim);
        emit GiftClaimed(id,accountId,recipient,g.amountPerClaim,g.claimed);
    }
    function refundExpired(bytes32 id) external nonReentrant {
        Gift storage g=gifts[id];if(g.status!=Status.Available)revert GiftUnavailable();if(block.timestamp<g.expiresAt)revert NotExpired();
        uint256 remaining=uint256(g.maxClaims-g.claimed)*g.amountPerClaim;g.status=Status.Refunded;totalLocked[g.token]-=remaining;
        _transferExact(IERC20(g.token),g.sender,remaining);emit GiftRefunded(id,g.sender,remaining);
    }
    function _transferExact(IERC20 token,address recipient,uint256 amount) private {
        uint256 beforeEscrow=token.balanceOf(address(this));uint256 beforeRecipient=token.balanceOf(recipient);
        token.safeTransfer(recipient,amount);
        if(token.balanceOf(address(this))!=beforeEscrow-amount||token.balanceOf(recipient)!=beforeRecipient+amount)revert IncorrectTransfer();
    }
}
