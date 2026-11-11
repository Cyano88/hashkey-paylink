import assert from 'node:assert/strict'
import {createMarketplacePaycrestQuoteVerifier} from '../api/marketplace/paycrest-quotes.ts'
import {createMarketplaceBankVerifier} from '../api/marketplace/bank-beneficiaries.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
const holding='0x'+'11'.repeat(20),funding='0x'+'22'.repeat(20),bills='0x'+'33'.repeat(20)
const banks=createMarketplaceBankVerifier({key:Buffer.alloc(32,7),keyId:'key_fixture',now:()=>1000,verifyAccount:async()=> 'Fixture Seller',verifyOwnership:async r=>({...r,verified:true,evidenceId:'ownership_fixture'})})
const bank=await banks.verify({projectId:'project_a',sellerId:'seller_a',beneficiaryId:'bank_a',bankCode:'TESTBANK',accountNumber:'0123456789'})
const quote={quoteId:'quote_one',projectId:'project_a',paymentId:'payment_one',allocationId:'share_a',operationId:'operation_one',beneficiaryId:'bank_a',destinationDigest:bank.destinationDigest,provider:'paycrest',providerOrderId:'provider_one',intentId:'intent_one',network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,currency:'NGN',debitUnits:'10000000',fundingUnits:'10000000',netUnits:'9900000',feeUnits:'100000',maximumFeeUnits:'200000',feePayer:'allocation',ngnMinor:'1485000',requestedNgnMinor:'1485000',holdingId:'holding_a',holdingRevision:'revision_one',refundAddress:holding,fundingAddress:funding,issuedAt:1000000,expiresAt:1300000,status:'initiated',submitted:false}
const base={id:'provider_one',status:'initiated',amount:'9.9',senderFee:'0',senderFeePercent:'0',transactionFee:'0.1',rate:'1500',source:{type:'crypto',currency:'USDC',network:'base',refundAddress:holding},destination:{type:'fiat',currency:'NGN',recipient:{institution:'TESTBANK',accountIdentifier:'0123456789',accountName:'Fixture Seller'}},providerAccount:{network:'base',currency:'USDC',receiveAddress:funding,amountToTransfer:'10',validUntil:new Date(1300000).toISOString()},amountPaid:'0',amountReturned:'0',percentSettled:'0'}
let data,current,now,reads,stale,changeBank
function reset(){data=structuredClone(base);current=structuredClone(bank);now=1000000;reads=0;stale=false;changeBank=false}
const verify=createMarketplacePaycrestQuoteVerifier({holding:{id:'holding_a',revision:'revision_one',address:holding,billsAddress:bills},now:()=>now,readOrder:async id=>{assert.equal(id,'provider_one');if(stale)now+=5001;return structuredClone(data)},readBank:async()=>{reads++;return changeBank&&reads>1?{...current,status:'revoked'}:structuredClone(current)},decrypt:banks.decrypt})
reset();assert.deepEqual(await verify(quote),quote)
for(const change of [()=>data.id='different_id',()=>data.status='settled',()=>data.statusDetail='under_review',()=>data.source.currency='USDT',()=>data.source.network='arc',()=>data.source.refundAddress=bills,()=>data.destination.currency='UGX',()=>data.destination.recipient.accountIdentifier='9999999999',()=>data.destination.recipient.institution='OTHER',()=>data.destination.recipient.accountName='Other Seller',()=>data.providerAccount.currency='USDT',()=>data.providerAccount.receiveAddress=bills,()=>data.providerAccount.validUntil=new Date(1300001).toISOString(),()=>data.providerAccount.amountToTransfer='10.000001',()=>data.amount='9.8',()=>data.transactionFee='0.2',()=>data.senderFee='0.025',()=>data.senderFeePercent='0.25',()=>data.rate='1499',()=>data.amountPaid='0.01',()=>data.amountReturned='0.01',()=>data.percentSettled='1',()=>data.txHash='provider_reference',()=>data.amount=9.9,()=>current.status='revoked',()=>current.destinationDigest='a'.repeat(64),()=>current.encryptedDetails+='bad',()=>stale=true,()=>changeBank=true]){
 reset();change();await assert.rejects(()=>verify(quote))
}
reset();await assert.rejects(()=>verify({...quote,holdingRevision:'old_revision'}))
assert.equal(JSON.stringify(await verify(quote)).includes('0123456789'),false)
console.log('PASS fresh Paycrest quote: verified encrypted bank binding, Base USDC/NGN route, holding refund address, exact expiry/funding/fees/rate, zero duplicate platform fee, payment-activity denial, stale-read and beneficiary-change rejection. Read-only fixtures; no order creation or funding.')

reset()
const withGas={...quote,debitUnits:'10010000',networkFeeUnits:'10000',feePolicy:'fixed_success_only',exchangeRate:'1500'}
assert.deepEqual(await verify(withGas),withGas)
data.rate='1500.000001' // Same rounded NGN total must not conceal a changed accepted rate.
await assert.rejects(()=>verify(withGas),/exchange rate changed/)
console.log('PASS Paycrest funding excludes retained network fee; exact accepted rate is immutable even when NGN rounding is unchanged.')

reset()
const commissioned={...withGas,commissionUnits:'29700',commissionRateBps:30,feeUnits:'129700',fundingUnits:'10029700',debitUnits:'10039700'}
data.senderFee='0.0297';data.senderFeePercent='0.3';data.providerAccount.amountToTransfer='10.0297'
assert.deepEqual(await verify(commissioned),commissioned)
for(const patch of [{senderFee:'0.029701'},{senderFeePercent:'0.31'},{senderFee:'0'},{transactionFee:'0.100001'}]){
 const previous=structuredClone(data);Object.assign(data,patch);await assert.rejects(()=>verify(commissioned));data=previous
}
await assert.rejects(()=>verify({...commissioned,commissionUnits:'29699'}))
await assert.rejects(()=>verify({...commissioned,commissionRateBps:31}))
console.log('PASS accepted 0.3% commission is preserved; changed rate, fee, provider fee and disclosure rejected; legacy zero-fee terms unchanged.')

const fixed={...commissioned,commissionMode:'fixed_units'}
for(const percent of ['', '0.3', undefined]){data.senderFeePercent=percent;assert.deepEqual(await verify(fixed),fixed)}
data.senderFee='0.029701';await assert.rejects(()=>verify(fixed),/commission/)
data.senderFee='0.0297';data.senderFeePercent=''
await assert.rejects(()=>verify(commissioned),/commission/)
await assert.rejects(()=>verify({...fixed,commissionMode:'unknown'}),/mode/)
await assert.rejects(()=>verify({...quote,commissionMode:'fixed_units'}),/mode/)
console.log('PASS explicit fixed-fee quote mode preserves exact commission, rejects unknown modes and leaves historical percentage validation strict.')
