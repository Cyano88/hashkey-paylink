import assert from 'node:assert/strict'
import {marketplaceBankReceiptActivity,marketplaceReceiptActivity} from '../api/pocket/marketplace-activity.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {isPocketActivityRow} from '../src/pocket/lib/pocketSchemas.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
const receipt={id:'bank-receipt',projectId:'market_a',paymentId:'order_a',sellerId:'seller_a',kind:'payout',settlement:'bank',currency:'NGN',recipient:'Bank account ending 9696',sender:'0x'+'1'.repeat(40),marketplaceName:'Example Market',amount:'1380.61',debitAmount:'1.027148',networkFee:'0.004148',commission:'0.003',providerFee:'0.02',feePayer:'seller',transactionHash:'0x'+'a'.repeat(64),settledAt:1000,bankFees:{quoteId:'quote_a',debitUnits:'1027148',ngnPaidMinor:'138061',chargedCommissionUnits:'3000',chargedProviderFeeUnits:'20000',chargedNetworkFeeUnits:'4148'}}
const link={projectId:'market_a',sellerId:'seller_a',owner:'owner_a',consentedAt:1}
const rows=marketplaceBankReceiptActivity([receipt],'owner_a',[link])
assert.equal(rows.length,1);assert.ok(isPocketActivityRow(rows[0]))
assert.equal(marketplaceReceiptActivity([receipt],receipt.recipient).length,0,'a bank description is never wallet ownership')
for(const links of [[{...link,owner:'other'}],[{...link,projectId:'other'}],[{...link,sellerId:'other'}],[{...link,revokedAt:2}],[link,{...link,owner:'other'}]])assert.equal(marketplaceBankReceiptActivity([receipt],'owner_a',links).length,0)
const view=paymentReceiptView(pocketActivityReceipt(rows[0]))
assert.equal(view.amount,'1380.61 NGN')
for(const [label,value] of [['Amount debited','1.027148 USDC'],['Withdrawal commission','0.003 USDC'],['Provider fee','0.02 USDC'],['Network fee','0.004148 USDC']])assert.equal(view.rows.find(r=>r.label===label).value,value)
assert.equal(isPocketActivityRow({...rows[0],marketplaceBankFees:{...receipt.bankFees,chargedCommissionUnits:'-1'}}),false)
const wallet={...receipt,settlement:undefined,recipient:'0x'+'2'.repeat(40),amount:'1',debitAmount:'1.004148'}
const walletRow=marketplaceReceiptActivity([wallet],wallet.recipient)[0]
assert.equal(paymentReceiptView(pocketActivityReceipt(walletRow)).rows.find(r=>r.label==='Total balance debit').value,'1.004148 USDC')
assert.equal(marketplaceReceiptActivity([wallet],receipt.sender).length,0,'holding address is not the seller')
console.log('PASS seller-scoped bank receipts, revoked/ambiguous/project isolation, wallet ownership, exact debit and fee breakdowns.')
