import {formatUnits,parseUnits} from 'viem'
import {checkCheckoutBuyerAllowance} from './checkout-buyer-allowance.js'
import type {CheckoutAllowanceOrder} from './checkout-buyer-allowance.js'

export type CheckoutWalletSpend={id:string;network:string;asset:string;amount:string;recipient:string;payer:string}
/** Called only after the rail verifies the signed checkout and payer ownership.
 * Wallet and bank checkouts deliberately use the same owner-keyed ledger. */
export function checkoutWalletAllowanceOrder(spend:CheckoutWalletSpend){
 if(!/^chk(?:b|x)?_[a-zA-Z0-9]{8,40}$/.test(spend.id)||!['base','arc','arbitrum','polygon','ethereum','solana','bsc','xlayer'].includes(spend.network)||!['USDC','USDT','USDe','USDG'].includes(spend.asset))throw Object.assign(Error('Checkout allowance binding is invalid.'),{status:409,code:'CHECKOUT_LIMIT_BINDING'})
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(spend.amount))throw Object.assign(Error('Checkout amount is invalid.'),{status:409,code:'CHECKOUT_LIMIT_BINDING'})
 const raw=parseUnits(spend.amount,18)
 if(raw<=0n)throw Object.assign(Error('Checkout amount is invalid.'),{status:409,code:'CHECKOUT_LIMIT_BINDING'})
 // Round up sub-micro amounts, so 18-decimal BNB payments cannot undercount.
 const amount=formatUnits((raw+999999999999n)/1000000000000n,6)
 const order:CheckoutAllowanceOrder={allowanceRail:'wallet',walletNetwork:spend.network,source:'hosted-checkout',intent_id:'wallet:'+spend.id,paycrest_order_id:'wallet:'+spend.network+':'+spend.asset,merchant_id:spend.id,amount_usdc:amount,amount_ngn:'0',fiat_currency:'NGN',receive_address:spend.recipient,refund_address:spend.payer}
 return order
}

export async function checkCheckoutWalletAllowance(owner:string,spend:CheckoutWalletSpend,checkOnly=true){await checkCheckoutBuyerAllowance(owner,checkoutWalletAllowanceOrder(spend),checkOnly)}
