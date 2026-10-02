import assert from 'node:assert/strict'
import {localCurrencyProfileRepository} from '../api/local-currency-profile.ts'
import {readSupportPayments,readSupportPayoutStatus} from '../api/pocket/support-account-data.ts'
import {checkSupportIncomingUsdc} from '../api/pocket/support-investigation-chain.ts'
import {supportAccountAnswer} from '../api/pocket/support-account-answer.ts'
const id=process.argv[2];if(!id)throw Error('Pocket ID is required for this read-only audit')
try{
 const profile=await localCurrencyProfileRepository.getByPocketId(id);assert(profile?.privyUserId)
 const owner=profile.privyUserId,rows=await readSupportPayments(owner)
 const result={accountMatched:true,noConversationCreated:true,noPaymentCreated:true,noInferenceUsed:true,NGN:{recordFound:false,providerChecked:false},UGX:{recordFound:false,providerChecked:false},incoming:{recordFound:false,liveCheck:'not_tested'}}
 for(const currency of ['NGN','UGX']){
  const row=rows.filter(r=>r.fiatCurrency===currency&&r.source?.replace(/_/g,'-').startsWith('bank-')&&r.bankOrderId).sort((a,b)=>b.ts-a.ts)[0]
  if(!row)continue
  result[currency].recordFound=true
  const response=await readSupportPayoutStatus(row);assert(response?.status)
  result[currency].providerChecked=true;result[currency].providerStatus=response.status
  const answer=await supportAccountAnswer({identity:{kind:'privy',subject:owner},profileId:'audit-profile',caseId:'synthetic',cases:{synthetic:{profileId:'audit-profile',status:'waiting_user',humanSupport:false,updatedAt:Date.now(),messages:[{author:'agent',options:[{id:'payment_details',eventId:row.eventId}]}]}},question:'Check this payment',requestId:'read-only-investigation-'+currency,selectedEventId:row.eventId},{profile:async()=>undefined,payments:async()=>rows,payoutStatus:async()=>response})
  assert(answer.receipt?.eventId===row.eventId);assert(answer.text.includes(currency==='NGN'?'₦':'UGX'));assert(answer.text.includes('Live bank payout status'))
 }
 const incoming=rows.filter(r=>r.direction==='in'&&r.source==='wallet-deposit'&&/^0x[a-f0-9]{64}$/i.test(r.txHash)).sort((a,b)=>b.ts-a.ts)[0]
 if(incoming){result.incoming.recordFound=true;const finding=await checkSupportIncomingUsdc(owner,incoming.chain,incoming.txHash);result.incoming.liveCheck=finding.status}
 console.log(JSON.stringify(result));process.exit(result.NGN.providerChecked&&result.UGX.providerChecked?0:1)
}catch{console.error('Read-only investigation audit could not verify every required provider check. No conversation or payment was created.');process.exit(1)}
