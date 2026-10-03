import {createHmac} from 'node:crypto'
import {multiGiftClaimTypedData} from '../../../src/pocket/features/gifts/pocketMultiGift.js'
import type {Address,Hex} from 'viem'
// Only an authenticated service may supply ownerId and a verified linked wallet.
// No HTTP route or signing key is enabled until the v2 deployment is reviewed.
export function multiGiftAccountId(secret:string,giftId:Hex,ownerId:string):Hex{
 if(!/^[a-f0-9]{64}$/i.test(secret)||!ownerId||!/^0x[0-9a-fA-F]{64}$/.test(giftId))throw Error('Gift identity configuration unavailable.')
 return ('0x'+createHmac('sha256',Buffer.from(secret,'hex')).update(JSON.stringify(['pocket-multi-gift-account-v1',giftId.toLowerCase(),ownerId])).digest('hex')) as Hex
}
export async function authorizeMultiGiftClaim(input:{ownerId:string;giftId:Hex;chainId:number;escrow:Address;expiresAt:bigint},deps:{identityKey:string;now():bigint;wallet(ownerId:string,chainId:number):Promise<Address>;eligible(giftId:Hex,accountId:Hex,wallet:Address):Promise<boolean>;sign(data:ReturnType<typeof multiGiftClaimTypedData>):Promise<Hex>}){
 const accountId=multiGiftAccountId(deps.identityKey,input.giftId,input.ownerId),recipient=await deps.wallet(input.ownerId,input.chainId),now=deps.now(),deadline=now+300n<input.expiresAt?now+300n:input.expiresAt
 if(now>=deadline||!await deps.eligible(input.giftId,accountId,recipient))throw Error('This gift is not available to claim.')
 const data=multiGiftClaimTypedData({...input,accountId,recipient,deadline})
 return {...data.message,chainId:input.chainId,escrow:input.escrow,accountSignature:await deps.sign(data)}
}
