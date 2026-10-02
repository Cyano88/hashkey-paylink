import assert from 'node:assert/strict'
import {localCurrencyProfileRepository} from '../api/local-currency-profile.ts'
import {readSupportPayments} from '../api/pocket/support-account-data.ts'
import {readSupportBalance,readSupportBillStatus} from '../api/pocket/support-diagnostics.ts'
import {checkSupportIncomingUsdc} from '../api/pocket/support-investigation-chain.ts'
const id=process.argv[2];if(!id)throw Error('Pocket ID required')
const results={readOnly:true,noConversationCreated:true,noPaymentCreated:true,noInferenceUsed:true,balances:{},bill:{recordFound:false,status:'not_tested'},solana:{recordFound:false,status:'not_tested'}}
try{
 const profile=await localCurrencyProfileRepository.getByPocketId(id);assert(profile?.privyUserId)
 const owner=profile.privyUserId
 for(const [network,asset] of [['base','USDC'],['solana','USDC'],['xlayer','USDC'],['xlayer','OKB']]){
  try{const result=await readSupportBalance(owner,network,asset);assert(Number.isFinite(Number(result.amount))&&Number(result.amount)>=0);results.balances[network+':'+asset]='verified'}catch{results.balances[network+':'+asset]='unavailable'}
 }
 const rows=await readSupportPayments(owner)
 const bill=rows.filter(r=>r.source==='bills').sort((a,b)=>b.ts-a.ts)[0]
 if(bill){results.bill.recordFound=true;try{results.bill.status=(await readSupportBillStatus(owner,bill)).status}catch{results.bill.status='unavailable'}}
 const solana=rows.filter(r=>r.source==='wallet-deposit'&&r.direction==='in'&&r.chain==='solana').sort((a,b)=>b.ts-a.ts)[0]
 if(solana){results.solana.recordFound=true;results.solana.status=(await checkSupportIncomingUsdc(owner,'solana',solana.txHash)).status}
 console.log(JSON.stringify(results));process.exitCode=Object.values(results.balances).every(v=>v==='verified')&&results.bill.status!=='unavailable'&&results.bill.recordFound?0:1
}catch{console.error('Read-only diagnostics audit could not complete. No payments or support cases were created.');process.exitCode=1}
