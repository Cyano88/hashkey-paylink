export const intentCandidates=[
 {id:'latest_payment',question:'Read the latest outgoing payment network, recorded status and receipt.'},
 {id:'latest_gift',question:'Read the latest funded outgoing gift and its current recorded state.'},
 {id:'selected_payment',question:'Read details or status of the payment already selected in this conversation.'},
 {id:'name',question:'Read the signed-in customer profile name.'},
 {id:'payments',question:'Show recent outgoing payments so the customer can choose one.'},
]
// Only this small public vocabulary may enter intent inference. Unknown tokens fail closed.
// No records, raw transcript, names, numbers, addresses or identifiers are sent.
const vocabulary=new Set(('i me my mine the a an it its this that those these last latest recent previous most payment payments transfer transfers transaction transactions gift gifts funded funding sent send outgoing receipt receipts status state network chain on which what where how when was is are were did do does has have had been can could would will you please tell show check find look up at about of in for and also or happened happen used use paid successful completed pending failed failure still money profile name full first surname account called am called hey hi hello thanks thank okay ok yes no from already yet why not go through went work worked mean means now want need know see view get let us earlier bank bills bill airtime electricity data tv usdc').split(' '))
export function safeIntentQuestion(value){
 if(typeof value==='string'&&/\b(?:my name is|i am|call me|to|from|for)\b/i.test(value))return null
 if(typeof value!=='string'||value.length>320||/[\d@/:_]|\b(?:pin|otp|password|secret|bvn|nin|passport|refund|reverse|cancel|approve|human|agent|support|stolen|scam|hacked)\b/i.test(value))return null
 const words=value.toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/\bit's\b/g,'its').replace(/\bwhat's\b/g,'what is').replace(/\bcan't\b/g,'can not').replace(/[?!.;,]/g,' ').trim().split(/\s+/)
 if(!words.length||words.some(word=>!vocabulary.has(word)))return null
 return words.join(' ')
}
