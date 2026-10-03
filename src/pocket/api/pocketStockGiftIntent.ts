import type {Address,Hex} from 'viem'
import type {MultiGiftAsset} from '../features/gifts/pocketMultiGift'
export type StockGiftIntent={id:string;attemptId:string;kind:'funding'|'claim'|'refund';owner:Address;sender:Address;escrow:Address;giftId:Hex;asset:MultiGiftAsset;signer:Address;salt:Hex;amountPerRecipient:string;recipients:number;expiresAt:string;claim?:{accountId:Hex;recipient:Address;deadline:string;signature:Hex;accountSignature:Hex}}
