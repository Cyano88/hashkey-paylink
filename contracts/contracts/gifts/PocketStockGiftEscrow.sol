// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IPocketShareToken {
    function sharesOf(address account) external view returns(uint256);
    function balanceOf(address account) external view returns(uint256);
    function getCurrentMultiplier() external view returns(uint256,uint256,uint256);
    function getSharesByUnderlyingAmount(uint256 amount) external view returns(uint256);
    function getUnderlyingAmountByShares(uint256 shares) external view returns(uint256);
    function transferShares(address to,uint256 shares) external returns(bool);
    function transferSharesFrom(address from,address to,uint256 shares) external returns(bool);
}

/// @notice Equal-share gifts for explicitly reviewed share-accounting stock tokens.
/// @dev Stock quantities float with the token multiplier; liabilities never do.
/// No owner, upgrade, rescue, or pre-expiry withdrawal capability.
contract PocketStockGiftEscrow is ReentrancyGuard, EIP712 {
    uint256 public constant PLATFORM_FEE_BPS=25;
    uint32 public constant MAX_CLAIMS=1000;
    bytes32 public constant CLAIM_TYPEHASH=keccak256("Claim(bytes32 giftId,bytes32 accountId,address recipient,uint64 deadline)");
    address public immutable treasury;
    address public immutable claimAuthority;
    mapping(address=>bool) public supportedToken;
    mapping(address=>uint256) public totalLockedShares;
    enum Status { Empty, Available, Claimed, Refunded }
    struct Gift { address sender; address token; address claimSigner; uint128 amountPerClaim; uint32 maxClaims; uint32 claimed; uint64 expiresAt; Status status; }
    mapping(bytes32=>Gift) public gifts;
    mapping(bytes32=>uint256) public sharesPerClaim;
    mapping(bytes32=>mapping(bytes32=>bool)) public claimedAccount;
    mapping(bytes32=>mapping(address=>bool)) public claimedWallet;
    error InvalidGift(); error GiftExists(); error GiftUnavailable(); error Expired(); error NotExpired(); error AlreadyClaimed(); error Unauthorized(); error IncorrectTransfer(); error QuoteChanged();
    event StockGiftFunded(bytes32 indexed giftId,address indexed sender,address indexed token,address claimSigner,uint128 requestedPerClaim,uint32 maxClaims,uint256 sharesPerClaim,uint256 feeShares,uint256 principalUnits,uint256 feeUnits,uint64 expiresAt);
    event StockGiftClaimed(bytes32 indexed giftId,bytes32 indexed accountId,address indexed recipient,uint256 shares,uint256 receivedUnits,uint32 claimed);
    event StockGiftRefunded(bytes32 indexed giftId,address indexed sender,uint256 shares,uint256 receivedUnits);
    constructor(address[] memory tokens,address feeTreasury,address authority) EIP712("PocketMultiGift","1") {
        if(tokens.length==0||feeTreasury==address(0)||feeTreasury==address(this)||authority==address(0))revert InvalidGift();
        treasury=feeTreasury;claimAuthority=authority;
        for(uint256 i;i<tokens.length;i++){if(tokens[i].code.length==0||supportedToken[tokens[i]])revert InvalidGift();supportedToken[tokens[i]]=true;}
    }
    function giftIdFor(address sender,bytes32 salt) public pure returns(bytes32){return keccak256(abi.encode(sender,salt));}
    /// @dev Floor the requested quantity to whole internal shares. No pooled remainder:
    /// the sender retains the untransferred fraction; every recipient owns identical shares.
    function quote(address token,uint128 requestedPerClaim,uint32 count) public view returns(uint256 multiplier,uint256 perShares,uint256 feeShares,uint256 debitUnits){
        if(!supportedToken[token]||requestedPerClaim==0||count==0||count>MAX_CLAIMS)revert InvalidGift();
        IPocketShareToken t=IPocketShareToken(token);(multiplier,,)=t.getCurrentMultiplier();
        if(multiplier==0)revert InvalidGift();
        perShares=t.getSharesByUnderlyingAmount(requestedPerClaim);
        if(perShares==0||perShares>type(uint256).max/count/2)revert InvalidGift();
        uint256 principal=perShares*count;feeShares=Math.mulDiv(principal,PLATFORM_FEE_BPS,10000);
        debitUnits=t.getUnderlyingAmountByShares(principal+feeShares);
        // Bound both conversions, including tokens whose API differs from the reviewed model.
        if(t.getUnderlyingAmountByShares(perShares)>requestedPerClaim||debitUnits>uint256(requestedPerClaim)*count*(10000+PLATFORM_FEE_BPS)/10000)revert InvalidGift();
    }
    struct Funding { bytes32 salt; address token; address signer; uint128 requestedPerClaim; uint32 count; uint64 expiresAt; uint256 expectedMultiplier; uint256 maxDebitUnits; }
    function createGift(Funding calldata f) external nonReentrant returns(bytes32 id){
        if(f.salt==bytes32(0)||f.signer==address(0)||f.expiresAt<=block.timestamp||f.expiresAt>block.timestamp+30 days)revert InvalidGift();
        id=giftIdFor(msg.sender,f.salt);if(gifts[id].status!=Status.Empty)revert GiftExists();
        (uint256 multiplier,uint256 perShares,uint256 feeShares,uint256 debitUnits)=quote(f.token,f.requestedPerClaim,f.count);
        if(multiplier!=f.expectedMultiplier||debitUnits>f.maxDebitUnits)revert QuoteChanged();
        IPocketShareToken t=IPocketShareToken(f.token);uint256 principal=perShares*f.count;
        gifts[id]=Gift(msg.sender,f.token,f.signer,f.requestedPerClaim,f.count,0,f.expiresAt,Status.Available);sharesPerClaim[id]=perShares;totalLockedShares[f.token]+=principal;
        uint256 beforeSender=t.balanceOf(msg.sender);
        _moveShares(t,msg.sender,address(this),principal+feeShares,true);
        uint256 afterSender=t.balanceOf(msg.sender);
        // balanceOf rounding may differ from allowance units by one atom. The user's
        // reviewed maximum is still a strict upper bound on their actual balance debit.
        if(afterSender>beforeSender||beforeSender-afterSender>f.maxDebitUnits)revert QuoteChanged();
        uint256 paidFee=feeShares==0?0:_moveShares(t,address(this),treasury,feeShares,false);
        (uint256 afterMultiplier,,)=t.getCurrentMultiplier();if(afterMultiplier!=multiplier)revert QuoteChanged();
        _emitFunding(id,feeShares,t.getUnderlyingAmountByShares(principal),paidFee);
    }
    function _emitFunding(bytes32 id,uint256 feeShares,uint256 deposited,uint256 paidFee) private {
        Gift storage g=gifts[id];
        emit StockGiftFunded(id,g.sender,g.token,g.claimSigner,g.amountPerClaim,g.maxClaims,sharesPerClaim[id],feeShares,deposited,paidFee,g.expiresAt);
    }
    function claimDigest(bytes32 id,bytes32 accountId,address recipient,uint64 deadline) public view returns(bytes32){return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH,id,accountId,recipient,deadline)));}
    function claim(bytes32 id,bytes32 accountId,address recipient,uint64 deadline,bytes calldata giftSignature,bytes calldata accountSignature) external nonReentrant {
        Gift storage g=gifts[id];if(g.status!=Status.Available)revert GiftUnavailable();if(block.timestamp>=g.expiresAt)revert Expired();
        if(accountId==bytes32(0)||recipient==address(0)||recipient==address(this)||deadline<block.timestamp||deadline>g.expiresAt)revert Unauthorized();
        if(claimedAccount[id][accountId]||claimedWallet[id][recipient])revert AlreadyClaimed();
        bytes32 digest=claimDigest(id,accountId,recipient,deadline);
        if(ECDSA.recover(digest,giftSignature)!=g.claimSigner||ECDSA.recover(digest,accountSignature)!=claimAuthority)revert Unauthorized();
        claimedAccount[id][accountId]=true;claimedWallet[id][recipient]=true;g.claimed++;if(g.claimed==g.maxClaims)g.status=Status.Claimed;
        uint256 shares=sharesPerClaim[id];totalLockedShares[g.token]-=shares;
        uint256 received=_moveShares(IPocketShareToken(g.token),address(this),recipient,shares,false);
        emit StockGiftClaimed(id,accountId,recipient,shares,received,g.claimed);
    }
    function refundExpired(bytes32 id) external nonReentrant {
        Gift storage g=gifts[id];if(g.status!=Status.Available)revert GiftUnavailable();if(block.timestamp<g.expiresAt)revert NotExpired();
        uint256 shares=uint256(g.maxClaims-g.claimed)*sharesPerClaim[id];g.status=Status.Refunded;totalLockedShares[g.token]-=shares;
        uint256 received=_moveShares(IPocketShareToken(g.token),address(this),g.sender,shares,false);
        emit StockGiftRefunded(id,g.sender,shares,received);
    }
    function currentAmountPerClaim(bytes32 id) external view returns(uint256){Gift storage g=gifts[id];if(g.status==Status.Empty)return 0;return IPocketShareToken(g.token).getUnderlyingAmountByShares(sharesPerClaim[id]);}
    function _moveShares(IPocketShareToken token,address from,address to,uint256 shares,bool pull) private returns(uint256 received){
        uint256 beforeFrom=token.sharesOf(from);uint256 beforeTo=token.sharesOf(to);uint256 beforeUnits=token.balanceOf(to);
        if(from==to||shares==0||beforeFrom<shares)revert IncorrectTransfer();
        bool ok=pull?token.transferSharesFrom(from,to,shares):token.transferShares(to,shares);
        if(!ok||token.sharesOf(from)!=beforeFrom-shares||token.sharesOf(to)!=beforeTo+shares)revert IncorrectTransfer();
        uint256 afterUnits=token.balanceOf(to);if(afterUnits<beforeUnits)revert IncorrectTransfer();received=afterUnits-beforeUnits;
    }
}
