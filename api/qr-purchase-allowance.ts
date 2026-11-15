import {formatUnits} from 'viem'
import {checkCheckoutBuyerAllowance,type CheckoutAllowanceOrder} from './checkout-buyer-allowance.js'
import type {PaymentFeeQuote} from './payment-fee-quotes.js'

/** Internal adapters only. Call after verifying merchant, signed quote and payer ownership. */
export function qrWalletAllowanceOrder(input:{id:string;merchantId:string;network:string;asset:string;amount:string;usdAmount?:string;recipient:string;payer:string}):CheckoutAllowanceOrder {
 if(!input.id||!input.merchantId||!input.network||!input.asset||!input.recipient||!input.payer)throw Error('Purchase binding is incomplete.')
 return {source:'ngpos',allowanceRail:'wallet',walletNetwork:input.network,
  intent_id:'qr:'+input.id,paycrest_order_id:'wallet:'+input.network+':'+input.asset,
  merchant_id:input.merchantId,receive_address:input.recipient,refund_address:input.payer,
  amount_usdc:input.usdAmount??input.amount,amount_ngn:'0',fiat_currency:'NGN',
  purchaseBinding:JSON.stringify([input.asset,input.amount])}
}
export function qrFeeAllowanceOrder(quote:PaymentFeeQuote){
 if(!quote.checkoutId?.startsWith('pos_')||quote.purpose!=='payment'||quote.mode!=='net'||quote.exemption!=='none')throw Error('A verified QR purchase quote is required.')
 return qrWalletAllowanceOrder({id:quote.id,merchantId:quote.checkoutId,network:quote.chain,asset:quote.asset||'USDC',amount:formatUnits(BigInt(quote.amountUnits),6),recipient:quote.recipient,payer:quote.walletAddress})
}
export async function reserveQrFeeAllowance(owner:string,quote:PaymentFeeQuote){await checkCheckoutBuyerAllowance(owner,qrFeeAllowanceOrder(quote),false)}
export async function reserveQrWalletAllowance(owner:string,input:Parameters<typeof qrWalletAllowanceOrder>[0]){await checkCheckoutBuyerAllowance(owner,qrWalletAllowanceOrder(input),false)}
