import {encodeFunctionData,parseAbi,type Address,type Hex,isAddress} from 'viem'
import {paymentFeeBreakdown} from '../../../lib/platformFees'
import {giftUnits} from './pocketGift'
import {giftContractId} from './pocketGiftSigning'
export const GIFT_ESCROW_ABI=parseAbi([
 'function createGift(bytes32 salt,address claimSigner,uint128 amount,uint64 expiresAt) returns (bytes32)',
 'function claim(bytes32 giftId,address recipient,uint64 deadline,bytes signature)',
 'function refundExpired(bytes32 giftId)',
 'function gifts(bytes32) view returns (address sender,address claimSigner,uint128 amount,uint64 expiresAt,uint8 status)',
 'event GiftFunded(bytes32 indexed giftId,address indexed sender,address claimSigner,uint256 amount,uint256 platformFee,uint64 expiresAt)',
 'event GiftClaimed(bytes32 indexed giftId,address indexed recipient,uint256 amount)',
 'event GiftRefunded(bytes32 indexed giftId,address indexed sender,uint256 amount)',
])
const erc20=parseAbi(['function approve(address spender,uint256 amount) returns (bool)'])
const ZERO='0x0000000000000000000000000000000000000000'
export function prepareGiftFunding(input:{sender:Address;escrow:Address;token:Address;claimSigner:Address;salt:Hex;amount:string;expiresAt:bigint;now:bigint}) {
 if (![input.sender,input.escrow,input.token,input.claimSigner].every(a=>isAddress(a)&&a.toLowerCase()!==ZERO)) throw Error('Invalid gift funding address.')
 if (input.escrow.toLowerCase()===input.token.toLowerCase() || !/^0x[0-9a-fA-F]{64}$/.test(input.salt)||/^0x0{64}$/.test(input.salt)) throw Error('Invalid gift funding configuration.')
 if(input.now<0n||input.expiresAt<=input.now||input.expiresAt>(1n<<64n)-1n)throw Error('Choose a future expiry for this gift.')
 const principal=giftUnits(input.amount)
 if(principal>(1n<<128n)-1n)throw Error('Gift amount is too large.')
 const pricing=paymentFeeBreakdown(principal)
 return {
  giftId:giftContractId(input.sender,input.salt),principal,platformFee:pricing.platformFee,fundingDebit:pricing.total,
  // Wallet execution must additionally quote sponsored/network costs. This is not a final payment quote.
  approval:{to:input.token,data:encodeFunctionData({abi:erc20,functionName:'approve',args:[input.escrow,pricing.total]})},
  funding:{to:input.escrow,data:encodeFunctionData({abi:GIFT_ESCROW_ABI,functionName:'createGift',args:[input.salt,input.claimSigner,principal,input.expiresAt]})},
 }
}
