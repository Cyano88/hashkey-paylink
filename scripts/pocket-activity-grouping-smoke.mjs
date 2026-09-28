import assert from 'node:assert/strict'
import {mergePocketActivityRows,mergePocketActivitySnapshot} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {bankPayoutActivityRow} from '../src/pocket/lib/pocketBankActivity.ts'
import {pocketActivityShortDate} from '../src/pocket/components/pocketActivityIcon.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const hash='0x'+'a'.repeat(64), other='0x'+'b'.repeat(64)
const main={eventId:'base:'+hash+':1',txHash:hash,chain:'base',payer:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),memo:'USDC sent',amount:'1',ts:1000,source:'wallet-withdrawal',direction:'out',paycrestStatus:'confirmed'}
const fee={...main,eventId:'base:'+hash+':2',recipient:EVM_PLATFORM_TREASURY,amount:'0.0089'}
for(const rows of [[main,fee],[fee,main]]){
 const result=mergePocketActivityRows([],rows);assert.equal(result.length,1);assert.equal(result[0].amount,'1');assert.equal(result[0].feeAmount,'0.0089');assert.equal(pocketActivityReceipt(result[0]).feeAmount,'0.0089')
 assert.equal(mergePocketActivityRows(result,[fee,main]).length,1,'refresh cannot restore fee row')
}
assert.equal(mergePocketActivityRows([],[fee]).length,1,'direct treasury payment stays visible')
assert.equal(mergePocketActivityRows([],[fee,{...main,txHash:other}]).length,2)
assert.equal(mergePocketActivityRows([],[fee,{...main,chain:'polygon'}]).length,2)
assert.equal(mergePocketActivityRows([],[fee,{...main,payer:'someone-else'}]).length,2)
assert.equal(mergePocketActivityRows([],[fee,main,{...main,eventId:'another',recipient:'third'}]).length,3)
const bank=bankPayoutActivityRow({txHash:hash,merchantId:'merchant',intentId:'intent',orderId:'order',amountUsdc:'1',amountNgn:'1000',accountName:'TEST RECIPIENT',bankName:'Test Bank',bankLast4:'1234',handoffVerified:true,providerStatus:'deposited',fiatCurrency:'NGN'},main.payer,1000)
assert(bank)
const merged=mergePocketActivityRows([main,fee],[bank]);assert.equal(merged.length,1);assert.equal(merged[0].accountName,'TEST RECIPIENT');assert.equal(merged[0].feeAmount,'0.0089');assert.equal(merged[0].bankSettlementStatus,'deposited')
assert.equal(mergePocketActivityRows(merged,[main,fee])[0].source,'bank-withdraw')
assert.equal(mergePocketActivityRows(merged,[{...bank,accountName:undefined,recipient:undefined,bankName:undefined}])[0].accountName,'TEST RECIPIENT')
const snapshot=mergePocketActivitySnapshot({payments:[main,fee],merchants:[],collections:[]},{payments:[bank],merchants:[],collections:[]});assert.equal(snapshot.payments.length,1)
assert.equal(bankPayoutActivityRow({...bank,txHash:''},main.payer),null)
assert.equal(pocketActivityShortDate(new Date(2026,8,28).getTime()),'28:09:26')
console.log('PASS: fee grouping, ordinary sends preserved, cached bank labels, receipt fees and date format')
