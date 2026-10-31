export type DeveloperSupportOption={id:string;label:string}
const option=(id:string,label:string):DeveloperSupportOption=>({id,label})
export const talkToUs=option('human','Talk to us')
export const developerSupportTopics=[option('payments','Payments & settlements'),option('integration','API & integrations'),option('account','Account & verification'),option('receipts','Receipts & refunds'),option('other','Something else'),talkToUs]
const back=option('topics','Choose another topic')
const done=[option('resolved','Yes, resolved'),back,talkToUs]
export const developerSupportSteps:Record<string,{text:string;options:DeveloperSupportOption[];category?:string}>={
 topics:{text:'What can we help you with?',options:developerSupportTopics},
 payments:{text:'What happened with the payment?',category:'checkout',options:[option('processing','Payment still processing'),option('settlement','Settlement not received'),back,talkToUs]},
 processing:{text:'Open the payment and check its latest status. If it is still processing or under review, do not pay again. Keep the checkout or order reference ready for our team. Did this help?',options:done},
 settlement:{text:'Check the payment status and the receiving wallet configured for your app. If the payment is confirmed but the funds are missing, share its checkout reference with our team. Did this help?',category:'settlement',options:done},
 integration:{text:'Where are you having trouble?',category:'integration',options:[option('api','API request or error'),option('webhook','Webhook or payment confirmation'),option('sandbox','Sandbox setup'),back,talkToUs]},
 api:{text:'Check the response status and error message. Make sure you are using the correct Sandbox or Production endpoint and key. Keep secret keys on your server. Share the request ID and redacted error with our team if you need help. Did this help?',options:done},
 webhook:{text:'Verify the webhook signature on your server and confirm the payment status before fulfilling the order. A return URL alone does not prove payment. Share the checkout reference and redacted webhook error if you need help. Did this help?',options:done},
 sandbox:{text:'Open Sandbox in the developer portal to create a test payment and get a signed webhook fixture. Sandbox uses simulated payments. Follow your app’s integration guide before moving to Production. Did this help?',options:done},
 account:{text:'What do you need help with?',category:'account',options:[option('signin','Signing in or account access'),option('verification','Personal or business verification'),back,talkToUs]},
 signin:{text:'Use the email associated with your account and the latest sign-in code. Never share the code in chat. If sign-in still fails, tell our team what you see and which step fails. Did this help?',options:done},
 verification:{text:'Open payment access in your profile to view your verification status. Individuals use personal KYC; businesses use KYB. If verification is blocked, tell our team which step failed. Do not upload identity documents in chat. Did this help?',options:done},
 receipts:{text:'What do you need help with?',category:'purchase_complaint',options:[option('receipt','Receipt or purchase email'),option('refund','Refund or purchase complaint'),back,talkToUs]},
 receipt:{text:'Open the confirmed payment to view or download its receipt. Check your app’s receipt email settings if an email is missing. Keep the checkout reference ready for our team. Did this help?',options:done},
 refund:{text:'For a purchase issue, use the merchant contact on the receipt. For a payment or refund-status issue, share the checkout reference with our team. A failed payment does not mean a refund has arrived. Did this help?',options:done},
 other:{text:'Tell us what happened, then tap Talk to us. Your message will stay in this conversation.',category:'other',options:[back,talkToUs]},
 human:{text:'Your request has been sent to our team. You can add any useful details here.',options:[]},
 resolved:{text:'This conversation has been resolved.',options:[]},
}
export function developerSupportOption(id:string){return [...developerSupportTopics,...Object.values(developerSupportSteps).flatMap(step=>step.options)].find(item=>item.id===id)}
