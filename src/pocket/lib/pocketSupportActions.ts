export const supportActions = {
 incoming: {label:'Incoming',message:'Show my incoming payments'},
 outgoing: {label:'Outgoing',message:'Show my outgoing payments'},
 missing_payment: {label:'Missing payment',message:'My payment has not arrived'},
 balance_issue: {label:'Balance mismatch',message:'My balance does not tally'},
 investigate_usdc: {label:'USDC',message:'USDC'},
 investigate_bank: {label:'Bank payment',message:'Bank payment'},
 investigate_stocks: {label:'Stocks',message:'Stocks'},
 investigate_bills: {label:'Bill purchase',message:'Bill purchase'},
 investigate_no_reference: {label:'No reference',message:'I do not have a payment reference'},
 payments: {label:'Check a payment',message:'Show my recent payments'},
 gifts: {label:'Gifts & requests',message:'Gifts & requests'},
 account: {label:'Account help',message:'Account help'},
 human: {label:'Talk to an agent',message:'Talk to an agent'},
 latest_payment: {label:'Latest payment',message:'What is the status of my last payment?'},
 latest_gift: {label:'Gift funding',message:'My last funded gift'},
 gift_claim: {label:'Claiming a gift',message:'How do I claim a gift?'},
 gift_refund: {label:'Gift refund',message:'How do gift refunds work?'},
 requests: {label:'Payment requests',message:'How do payment requests work?'},
 name: {label:'My profile name',message:"What's my name?"},
 security: {label:'Account security',message:'How do I keep my account safe?'},
 payment_details: {label:'Payment details',message:'Check this payment'},
} as const
export type SupportActionId=keyof typeof supportActions
export type SupportOption={id:SupportActionId;label:string;eventId?:string}
export function supportOptions(ids:SupportActionId[]):SupportOption[]{return ids.map(id=>({id,label:supportActions[id].label}))}
export function recoveryOptions(question:string):SupportOption[]{return supportOptions(/gift|claim/i.test(question)?['latest_gift','gift_claim','gift_refund','human']:/request/i.test(question)?['requests','payments','human']:/payment|transfer|bill|money|deposit/i.test(question)?['payments','latest_payment','human']:['payments','gifts','account','human'])}
export function supportMenu(id:SupportActionId){
 if(id==='payments')return {text:'Which payments would you like to check?',handoff:false,options:supportOptions(['incoming','outgoing','missing_payment','human'])}
 if(id==='gifts')return {text:'What would you like help with?',handoff:false,options:supportOptions(['latest_gift','gift_claim','gift_refund','requests','human'])}
 if(id==='account')return {text:'What would you like to check?',handoff:false,options:supportOptions(['name','security','balance_issue','human'])}
 if(id==='gift_claim')return {text:'Open Receive, choose Claim a gift, and enter the gift code or link. Pocket shows whether it can be claimed. Only confirm a claim inside Pocket; never share your PIN or OTP.',handoff:false,options:supportOptions(['latest_gift','human'])}
 if(id==='gift_refund')return {text:'Check the original gift record for its current state and available actions. A funded, claimed or refunded gift has a different outcome; funding alone does not mean a refund is available. I can check your latest funded gift or connect you to an agent.',handoff:false,options:supportOptions(['latest_gift','human'])}
 if(id==='requests')return {text:'Use Receive to request USDC. Incoming requests appear in Notifications, where you can review the request before paying or declining. A request is only paid once its payment is confirmed.',handoff:false,options:supportOptions(['payments','human'])}
}
