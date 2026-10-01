import type {Address, Hex} from 'viem'
export type GiftNetwork='base'|'arbitrum'|'arc'|'ethereum'|'polygon'
export type GiftDeployment={network:GiftNetwork;chainId:number;escrow:Address;token:Address;treasury:Address;runtimeHash:Hex;confirmations:number}
export type GiftAttempt={id:string;startedAt:number;userId:string;walletAddress:Address;phase:'authorizing'|'awaiting_approval'|'authorization_unknown';challengeId?:string;transactionId?:string;signature?:Hex;deadline?:string}
export type GiftRecord={
 version:1;id:string;binding:string;ownerId:string;senderHandle:string;senderAddress:Address;walletId:string;
 deployment:GiftDeployment;giftId:Hex;salt:Hex;claimSigner:Address;amount:string;amountUnits:string;feeUnits:string;expiresAt:string;message:string;
 claimRecipient?:Address;settlementHash?:Hex;state:'unfunded'|'available'|'claimed'|'refunded';observedBlock?:string;observedTimestamp?:string;observedBlockHash?:Hex;createdAt:number;updatedAt:number;
 funding?:GiftAttempt;claim?:GiftAttempt;refund?:GiftAttempt;
}
export type GiftObservation={state:GiftRecord['state'];blockNumber:bigint;blockHash:Hex;timestamp:bigint;claimRecipient?:Address;settlementHash?:Hex}
export type GiftIdentity={userId:string;handle:string}
export class GiftError extends Error {constructor(public status:number,message:string){super(message)}}
export const giftIdValid=(id:string)=>/^g_[A-Za-z0-9_-]{22}$/.test(id)
export function publicGift(record:GiftRecord,now:number){return {id:record.id,sender:record.senderHandle,amount:record.amount,network:record.deployment.network,message:record.message,expiresAt:record.expiresAt,status:record.state==='unfunded'?'funding':record.state==='available'&&BigInt(record.expiresAt)<=BigInt(Math.floor(now/1000))?'expired':record.state}}
