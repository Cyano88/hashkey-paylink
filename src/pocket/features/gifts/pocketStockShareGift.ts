import {parseAbi} from 'viem'
export const STOCK_SHARE_GIFT_ABI=parseAbi([
 'function quote(address token,uint128 requestedPerClaim,uint32 count) view returns(uint256 multiplier,uint256 perShares,uint256 feeShares,uint256 debitUnits)',
 'function createGift((bytes32 salt,address token,address signer,uint128 requestedPerClaim,uint32 count,uint64 expiresAt,uint256 expectedMultiplier,uint256 maxDebitUnits) f) returns(bytes32)',
 'function sharesPerClaim(bytes32 id) view returns(uint256)',
 'function currentAmountPerClaim(bytes32 id) view returns(uint256)',
 'function totalLockedShares(address token) view returns(uint256)',
 'event StockGiftFunded(bytes32 indexed giftId,address indexed sender,address indexed token,address claimSigner,uint128 requestedPerClaim,uint32 maxClaims,uint256 sharesPerClaim,uint256 feeShares,uint256 principalUnits,uint256 feeUnits,uint64 expiresAt)',
 'event StockGiftClaimed(bytes32 indexed giftId,bytes32 indexed accountId,address indexed recipient,uint256 shares,uint256 receivedUnits,uint32 claimed)',
 'event StockGiftRefunded(bytes32 indexed giftId,address indexed sender,uint256 shares,uint256 receivedUnits)',
])
export const STOCK_SHARE_TOKEN_ABI=parseAbi([
 'function sharesOf(address) view returns(uint256)',
 'function getCurrentMultiplier() view returns(uint256,uint256,uint256)',
 'function getSharesByUnderlyingAmount(uint256) view returns(uint256)',
 'function getUnderlyingAmountByShares(uint256) view returns(uint256)',
])
