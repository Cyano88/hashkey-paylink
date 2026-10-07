import {parseUnits} from 'viem'
export function assertHostedLocalSettlementOrder(order:{intent_id:string;receive_address:string;amount_usdc:string;fiat_currency?:string}, expected:{id:string;recipient:string;amount:string;currency:string}) {
 if(order.intent_id!==expected.id||order.receive_address.toLowerCase()!==expected.recipient.toLowerCase()||(order.fiat_currency||'NGN')!==expected.currency||parseUnits(order.amount_usdc,6)!==parseUnits(expected.amount,6))throw Error('The payout order does not match this checkout. Reload and try again.')
}
