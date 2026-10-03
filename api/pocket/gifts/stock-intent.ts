import type {GiftRecord,GiftAttempt} from './types.js'
import {GiftError} from './types.js'
import type {StockGiftIntent} from '../../../src/pocket/api/pocketStockGiftIntent.js'
export function stockGiftIntent(record:GiftRecord,kind:StockGiftIntent['kind'],attempt:GiftAttempt):StockGiftIntent{
 if(record.version!==2||record.deployment.network!=='xlayer'||!record.deployment.asset||!record.maxClaims||!record.amountPerClaim)throw new GiftError(503,'Stock gift is not configured.')
 if(kind==='claim'&&(!attempt.accountId||!attempt.signature||!attempt.accountSignature||!attempt.deadline))throw new GiftError(409,'Prepare the gift claim again.')
 return {id:record.id,attemptId:attempt.id,kind,owner:attempt.walletAddress,sender:record.senderAddress,escrow:record.deployment.escrow,giftId:record.giftId,asset:record.deployment.asset,signer:record.claimSigner,salt:record.salt,amountPerRecipient:record.amountPerClaim,recipients:record.maxClaims,expiresAt:record.expiresAt,...(kind==='claim'?{claim:{accountId:attempt.accountId!,recipient:attempt.walletAddress,deadline:attempt.deadline!,signature:attempt.signature!,accountSignature:attempt.accountSignature!}}:{})}
}
