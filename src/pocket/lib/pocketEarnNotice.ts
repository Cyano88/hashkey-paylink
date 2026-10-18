import type {PocketActivityRow} from '../models/pocketActivity'
export type PocketEarnMovement={action:'deposit'|'withdraw';symbol:'USDC'|'USDT0'}
export function pocketEarnCompletion(action:PocketEarnMovement['action'],amount:string,symbol:string){
 return action==='deposit'?{title:'Money added to Earn',body:`${amount} ${symbol} is now earning.`}:{title:'Withdrawal complete',body:`${amount} ${symbol} added to your Pocket balance.`}
}
export function pocketEarnNoticeRow(n:{id:string;hash?:string;at:number;earn?:PocketEarnMovement;transfer?:{amount:string;from:string;to:string}}):PocketActivityRow|null{
 if(!n.earn||!n.hash||!n.transfer)return null
 const {action,symbol}=n.earn,t=n.transfer
 return {eventId:n.id,txHash:n.hash,chain:'xlayer',payer:t.from,recipient:t.to,amount:t.amount,assetSymbol:symbol,memo:pocketEarnCompletion(action,t.amount,symbol).body,ts:n.at,source:action==='deposit'?'earn-deposit':'earn-withdraw',direction:action==='deposit'?'out':'in',contextLabel:symbol,activityLabel:action==='deposit'?'Added to Earn':'Withdrawn from Earn',paycrestStatus:'confirmed'}
}
