import type {DeveloperCheckoutPolicy} from './developer-projects.js'
import {acceptedCheckoutAssets} from '../src/lib/checkoutAcceptance.js'

/** Keep one signed checkout/attempt while allowing the same stablecoin on
 * the merchant's other Circle networks before the payment network is locked. */
export function checkoutSelectionChildPolicy(policy:DeveloperCheckoutPolicy,record:{merchantName:string;brandImageUrl?:string;options:Array<{network:string;asset:string;recipient:string;unavailableReason?:string}>;choice?:{network:string;asset:string}}):DeveloperCheckoutPolicy{
 const choice=record.choice
 if(!choice)throw Error('Choose a payment option.')
 const movable=policy.settlementMode==='usdc'&&choice.network!=='bsc'&&choice.network!=='xlayer'
 const paymentOptions=policy.paymentOptions.filter(option=>movable
  ?acceptedCheckoutAssets(option.network,policy.acceptedAssets).includes(choice.asset)&&record.options.some(saved=>!saved.unavailableReason&&saved.network===option.network&&saved.asset===choice.asset&&saved.recipient===option.recipient)
  :option.network===choice.network)
 return {...policy,merchantName:record.merchantName,brandImageUrl:record.brandImageUrl,checkoutDefaultNetwork:undefined,paymentOptions,defaultNetwork:choice.network as DeveloperCheckoutPolicy['defaultNetwork']}
}
