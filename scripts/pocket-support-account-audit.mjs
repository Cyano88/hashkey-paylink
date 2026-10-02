import assert from 'node:assert/strict'
import {localCurrencyProfileRepository} from '../api/local-currency-profile.ts'
import {supportAccountAnswer} from '../api/pocket/support-account-answer.ts'
import {readSupportPayments} from '../api/pocket/support-account-data.ts'
import {createHash} from 'node:crypto'
const id=process.argv[2];if(!id)throw Error('Supply a Pocket ID for the read-only audit.')
try{
 const profile=await localCurrencyProfileRepository.getByPocketId(id);assert(profile?.privyUserId)
 const owner=profile.privyUserId,profileId=createHash('sha256').update(('privy:'+owner).toLowerCase()).digest('hex').slice(0,32)
 const input={identity:{kind:'privy',subject:owner},profileId,question:"What's my name?",requestId:'read-only-account-audit-name',newConversation:true,cases:{}}
 const deps={profile:async()=>profile,payments:readSupportPayments}
 const name=await supportAccountAnswer(input,deps);assert(name?.accountContext.kind==='profile');assert(name.text.startsWith('Your profile name is '))
 const payment=await supportAccountAnswer({...input,question:"What chain was my last payment and what was it's status?",requestId:'read-only-account-audit-payment'},deps)
 assert(payment?.accountContext.transaction&&payment.receipt?.eventId)
 const gift=await supportAccountAnswer({...input,question:'My last funded gift',requestId:'read-only-account-audit-gift'},deps)
 assert(gift?.receipt?.eventId&&gift.text.includes('Gift funding status on record:'))
 console.log(JSON.stringify({giftLookup:true,accountMatched:true,nameLookup:true,paymentLookup:true,receiptBound:payment.receipt.eventId===payment.accountContext.transaction.eventId,network:payment.accountContext.transaction.chain,noConversationCreated:true}))
 process.exit(0)
}catch{console.error('Read-only account audit could not verify every lookup. No conversation or payment was changed.');process.exit(1)}
