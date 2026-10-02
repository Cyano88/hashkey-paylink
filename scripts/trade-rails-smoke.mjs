import assert from 'node:assert/strict'
import {parseArcTradeCheckout,bindArcTradeTerms,prepareArcTradeBinding,arcTradeAvailability,ARC_TRADE_POLICY} from '../api/trade-agreement/arc.ts'
import {parseTradeCheckout,prepareTradeCheckoutBinding} from '../api/xstocks-agreement/trade.ts'
import {readFileSync} from 'node:fs'
const trade={offerId:'11111111-1111-4111-8111-111111111111',listingRevision:1,snapshotHash:'a'.repeat(64),price:'1.00',deliveryFee:'0.25',handover:'Delivery',location:'Lagos',carrier:'Agreed courier',returns:'Return if materially different from listing.',dispatchDays:3,deliveryDays:12,inspectionHours:48}
const body={kind:'trade',paymentRail:'arc',chainId:5042,paymentToken:'0x3600000000000000000000000000000000000000',title:'Synthetic item',description:'Preserved item description',amount:'1.25',trade}
const terms=parseArcTradeCheckout(body),id='tag_'+'1'.repeat(64),buyer='0x'+'11'.repeat(20),seller='0x'+'22'.repeat(20)
const release={policy:ARC_TRADE_POLICY,chainId:5042,factory:'0x'+'33'.repeat(20),arbiter:'0x'+'44'.repeat(20),factoryRuntimeHash:'0x'+'ab'.repeat(32)}
assert.equal(terms.payment.amountUnits,'1250000')
assert.equal(parseArcTradeCheckout({...body,amount:'0.000001',trade:{...trade,price:'0.000001',deliveryFee:'0',handover:'Pickup'}}).payment.amountUnits,'1')
for(const patch of [{network:'xlayer'},{chainId:'5042'},{chainId:5042002},{chainId:196},{paymentRail:'xlayer'},{paymentToken:'0x'+'55'.repeat(20)},{stockCustody:'xstocks-shares-v2'},{amount:'1.26'},{trade:{...trade,price:'0.0000001'}},{trade:{...trade,inspectionHours:0}},{trade:{...trade,deliveryDays:61}},{trade:{...trade,handover:'Pickup'}}])assert.throws(()=>parseArcTradeCheckout({...body,...patch}))
const binding=bindArcTradeTerms(id,terms,buyer,seller,100,release)
assert.equal(binding.chainId,5042);assert.equal(binding.contractTerms.amount,'1250000')
assert.equal(binding.contractTerms.dispatchWindow,259200);assert.equal(binding.contractTerms.deliveryWindow,1036800);assert.equal(binding.contractTerms.inspectionWindow,172800)
for(const replacement of [buyer,release.arbiter,release.factory,body.paymentToken,'0x'+'00'.repeat(20)])assert.throws(()=>bindArcTradeTerms(id,terms,buyer,replacement,100,release))
assert.throws(()=>bindArcTradeTerms(id,{...terms,payment:{...terms.payment,amountUnits:'1'}},buyer,seller,100,release))
assert.throws(()=>bindArcTradeTerms(id,terms,buyer,seller,100,{...release,chainId:196}))
assert.throws(()=>bindArcTradeTerms('xag_'+'1'.repeat(64),terms,buyer,seller,100,release))
assert.notEqual(binding.termsHash,bindArcTradeTerms(id,terms,buyer,seller,101,release).termsHash)
assert.notEqual(binding.termsHash,bindArcTradeTerms(id,terms,buyer,seller,100,{...release,factory:'0x'+'66'.repeat(20)}).termsHash)
assert.equal(arcTradeAvailability({HASHPAYLINK_TRADE_ARC_ENABLED:'true',HASHPAYLINK_TRADE_ARC_PROJECTS:'dev_1234567890'},'dev_1234567890').enabled,false)
assert.throws(()=>prepareArcTradeBinding(id,terms,buyer,seller,100),/pending verification/)
const stock=JSON.parse(readFileSync('src/lib/xstocksAgreement/xStocksCatalog.json','utf8')).assets[0]
const env={HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'true',HASHPAYLINK_XSTOCKS_SHARE_FACTORY:'0x'+'55'.repeat(20),HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED:'true',HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON:JSON.stringify([{address:stock.address,decimals:18}])}
const stockBody={kind:'trade',stockCustody:'xstocks-shares-v2',title:body.title,description:body.description,amount:body.amount,paymentToken:stock.address,trade}
assert.throws(()=>parseTradeCheckout({...stockBody,paymentRail:'arc'},env))
assert.throws(()=>parseTradeCheckout({...stockBody,chainId:5042},env))
const stockTerms=parseTradeCheckout(stockBody,env)
assert.equal(stockTerms.xlayerPayment.chainId,196);assert.equal(stockTerms.xlayerPayment.amountUnits,'1250000000000000000')
assert.notEqual(binding.termsHash,prepareTradeCheckoutBinding(id,stockTerms,buyer,seller,100).termsHash)
console.log('Trade rails passed: shared delivery terms, Arc six-decimal units, chain/custody isolation, identity and deployment-bound hashes, and default-closed activation.')
