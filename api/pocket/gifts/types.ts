import type {Address, Hex} from 'viem'
export type GiftNetwork='base'|'arbitrum'|'arc'|'ethereum'|'polygon'
export type GiftDeployment={network:GiftNetwork;chainId:number;escrow:Address;token:Address;treasury:Address;runtimeHash:Hex;confirmations:number;deploymentBlock?:string}
export type GiftAttempt={id:string;startedAt:number;userId:string;walletAddress:Address;phase:'authorizing'|'awaiting_approval'|'authorization_unknown'|'failed';challengeId?:string;transactionId?:string;signature?:Hex;deadline?:string}
export type GiftRecord={
 version:1;id:string;binding:string;ownerId:string;senderHandle:string;senderAddress:Address;walletId:string;
 deployment:GiftDeployment;giftId:Hex;salt:Hex;claimSigner:Address;amount:string;amountUnits:string;feeUnits:string;expiresAt:string;message:string;
 fundingHash?:Hex;fundingAt?:number;refundHash?:Hex;refundAt?:number;settlementAt?:number;claimRecipient?:Address;settlementHash?:Hex;state:'unfunded'|'available'|'claimed'|'refunded';observedBlock?:string;observedTimestamp?:string;observedBlockHash?:Hex;createdAt:number;updatedAt:number;
 evidenceScanBlock?:string;nextReconcileAt?:number;reconcileComplete?:boolean;
 discardedAt?:number;funding?:GiftAttempt;claim?:GiftAttempt;refund?:GiftAttempt;
}
export type GiftObservation={state:GiftRecord['state'];blockNumber:bigint;blockHash:Hex;timestamp:bigint;evidenceScanBlock?:string;fundingHash?:Hex;fundingAt?:number;refundHash?:Hex;refundAt?:number;settlementAt?:number;claimRecipient?:Address;settlementHash?:Hex}
export type GiftIdentity={userId:string;handle:string}
export class GiftError extends Error {constructor(public status:number,message:string){super(message)}}
export const giftIdValid=(id:string)=>/^g_[A-Za-z0-9_-]{22}$/.test(id)
export function publicGift(record:GiftRecord,now:number){return {id:record.id,sender:record.senderHandle,amount:record.amount,network:record.deployment.network,message:record.message,expiresAt:record.expiresAt,status:record.state==='unfunded'?(BigInt(record.expiresAt)<=BigInt(record.observedTimestamp||'0')?'expired':'funding'):record.state==='available'&&BigInt(record.expiresAt)<=BigInt(Math.floor(now/1000))?'expired':record.state}}
