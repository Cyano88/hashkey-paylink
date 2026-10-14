import assert from 'node:assert/strict'
import {createPaymentFeeQuote} from '../api/payment-fee-quotes.ts'
import {verifyEsimFee} from '../api/pocket/esim-fees.ts'
import {esimActivityRow} from '../api/pocket/esim-activity.ts'
import {isPocketActivityRow,isPocketActivityReadData} from '../src/pocket/lib/pocketSchemas.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {pocketActivityAction,currentPocketActivityRow} from '../src/pocket/lib/pocketActivityPresentation.ts'
const now=Date.now(),secret='s'.repeat(32)
const item={id:'esim_fixture',payer:'0x1111111111111111111111111111111111111111',treasury:'0x2222222222222222222222222222222222222222',asset:'USDT',network:'base',packageCode:'NG_1',price:{subtotal:'5',platformFee:'0.0125',total:'5.0125'},createdAt:now,state:'quoted',txHash:''}
const binding={purpose:'wallet-send',asset:'USDT',chain:'base',walletId:'wallet',walletAddress:item.payer,recipient:item.treasury,amountUnits:'5012500',mode:'gross'}
const fee=createPaymentFeeQuote(binding,2500n,false,now,secret)
const verified=verifyEsimFee(item,'wallet',fee.token,now,secret)
assert.equal(verified.totalDebit,'5.015');assert.equal(verified.networkFee,'0.0025')
assert.equal(fee.quote.platformFeeUnits,'0');assert.equal(fee.quote.recipientUnits,'5012500')
assert.throws(()=>verifyEsimFee({...item,asset:'USDC'},'wallet',fee.token,now,secret))
assert.throws(()=>verifyEsimFee(item,'other-wallet',fee.token,now,secret))
assert.throws(()=>verifyEsimFee(item,'wallet',fee.token,now+120001,secret))
assert.throws(()=>verifyEsimFee({...item,treasury:item.payer},'wallet',fee.token,now,secret))
assert.equal(esimActivityRow(item),null)
assert.equal(esimActivityRow({...item,state:'awaiting_payment',...verified}),null)
const pending=esimActivityRow({...item,state:'provisioning',...verified,txHash:'0x'+'a'.repeat(64)})
const complete=esimActivityRow({...item,state:'ready',...verified,txHash:'0x'+'a'.repeat(64)})
assert.equal(isPocketActivityRow(complete),true)
assert.equal(isPocketActivityReadData({payments:[pending,complete],merchants:[],collections:[]}),true)
assert.equal(pocketActivityAction(complete),'eSIM')
assert.equal(complete.amount,'5.015');assert.equal(complete.feeAmount,'0.015')
const receipt=pocketActivityReceipt(complete)
assert.equal(receipt.title,'eSIM purchase');assert.equal(receipt.asset,'USDT');assert.equal(receipt.amount,'5.015')
assert.equal(currentPocketActivityRow(pending,[complete]),complete)
assert.equal(mergePocketActivityRows([pending],[complete]).length,1)
const raw={...complete,source:'wallet-withdrawal',eventId:'raw-transfer'}
assert.equal(mergePocketActivityRows([raw],[complete]).length,1)
const refunded=esimActivityRow({...item,...verified,state:'refunded',txHash:complete.txHash,refundTxHash:'0x'+'b'.repeat(64)})
assert.equal(isPocketActivityRow(refunded),true)
assert.equal(refunded.amount,'5.0125')
const deposit={...raw,source:'wallet-deposit',direction:'in',txHash:refunded.refundTxHash,amount:'5.0125'}
assert.equal(mergePocketActivityRows([deposit],[refunded]).length,1)
assert.equal(mergePocketActivityRows([{...deposit,assetSymbol:'USDC'}],[refunded]).length,2)
console.log('PASS eSIM signed network fee binding, no duplicate platform fee, expiry, Activity/receipt identity and asset-specific refund deduplication')
