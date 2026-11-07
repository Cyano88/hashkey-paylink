import type {DeveloperCheckoutPolicy} from './developer-projects.js'
import {acceptedCheckoutAssets} from '../src/lib/checkoutAcceptance.js'

/** Legacy children retain same-asset Circle choices. Switchable orders use
 * the parent selector exclusively, so each cached child keeps its network. */
export function checkoutSelectionChildPolicy(policy:DeveloperCheckoutPolicy,record:{cashPayer?:{owner:string;address:string};switchable?:true;merchantName:string;brandImageUrl?:string;options:Array<{network:string;asset:string;recipient:string;unavailableReason?:string}>;choice?:{network:string;asset:string}}):DeveloperCheckoutPolicy{
 const choice=record.choice
 if(!choice)throw Error('Choose a payment option.')
 const movable=!record.switchable&&policy.settlementMode==='usdc'&&choice.network!=='bsc'&&choice.network!=='xlayer'
 const paymentOptions=policy.paymentOptions.filter(option=>movable
  ?acceptedCheckoutAssets(option.network,policy.acceptedAssets).includes(choice.asset)&&record.options.some(saved=>!saved.unavailableReason&&saved.network===option.network&&saved.asset===choice.asset&&saved.recipient===option.recipient)
  :option.network===choice.network)
 return {...policy,...(record.cashPayer&&policy.nairaSettlement?{nairaSettlement:{...policy.nairaSettlement,refundAddress:record.cashPayer.address}}:{}),merchantName:record.merchantName,brandImageUrl:record.brandImageUrl,checkoutDefaultNetwork:undefined,paymentOptions,defaultNetwork:choice.network as DeveloperCheckoutPolicy['defaultNetwork']}
}
