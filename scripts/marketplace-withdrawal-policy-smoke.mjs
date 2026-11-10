import assert from 'node:assert/strict'
import {assertMarketplaceWithdrawalMinimum as minimum,marketplaceWithdrawalEligibility as eligibility} from '../src/lib/marketplaceWithdrawalPolicy.ts'
import {createMarketplacePlan,createMarketplaceBook,applyMarketplaceCommand,marketplaceSellerBalances} from '../api/marketplace/accounting.ts'
for(const [route,units] of [['wallet',500000n],['bank',1000000n]]){
 assert.throws(()=>minimum(route,(units-1n).toString()),e=>e.code==='MARKETPLACE_WITHDRAWAL_BELOW_MINIMUM')
 minimum(route,units.toString());minimum(route,(units+1n).toString())
 assert.equal(eligibility(units.toString(),route).status,'quote_required')
 assert.equal(eligibility(units.toString(),route,'1').shortfallUnits,'1')
 assert.equal(eligibility((units+1n).toString(),route,'1').status,'amount_eligible')
 for(const invalid of ['-1','1.0','01','1e6','',null])assert.throws(()=>minimum(route,invalid))
}
function book(id,project='project_one'){
 const plan=createMarketplacePlan({projectId:project,paymentId:id,network:'base',asset:'USDC',amount:'0.4',allocations:[
  {id:'seller_share',sellerId:'recipient_one',role:'seller',amount:'0.3',settlement:'wallet_usdc',beneficiaryId:'wallet_one'},
  {id:'commission',sellerId:'recipient_one',role:'platform',amount:'0.1',settlement:'wallet_usdc',beneficiaryId:'wallet_one'}]})
 return applyMarketplaceCommand(createMarketplaceBook(plan),project,'fund_order',{type:'fund',evidenceId:'proof_'+id,network:'base',asset:'USDC',amountUnits:plan.amountUnits})
}
let a=book('order_one'),b=book('order_two'),foreign=book('order_other','project_other')
const release=x=>applyMarketplaceCommand(x,'project_one','release_order',{type:'release_batch',releases:[{allocationId:'seller_share',amountUnits:'300000'},{allocationId:'commission',amountUnits:'100000'}],authorization:{credentialId:'key_one',businessReference:'delivery_one'}})
a=release(a);b=release(b)
let summary=marketplaceSellerBalances([a,b,foreign],'project_one','recipient_one')[0]
assert.equal(summary.units.available,'800000')
const seller=summary.withdrawalAccounts.find(x=>x.role==='seller'),platform=summary.withdrawalAccounts.find(x=>x.role==='platform')
assert.equal(seller.availableUnits,'600000');assert.equal(seller.largestSingleAllocationUnits,'300000')
assert.equal(seller.crossOrderWithdrawalEnabled,true)
assert.equal(platform.availableUnits,'200000');assert.equal(platform.withdrawal.status,'below_minimum')
assert.equal(platform.withdrawal.shortfallUnits,'300000')
// A tiny buyer refund remains valid and a reservation stops those funds from being counted as available.
a=applyMarketplaceCommand(a,'project_one','refund_one',{type:'reserve',kind:'refund',operationId:'refund_operation',allocationId:'seller_share',amountUnits:'1'})
summary=marketplaceSellerBalances([a,b],'project_one','recipient_one')[0]
assert.equal(summary.units.available,'799999');assert.equal(summary.units.reserved,'1')
console.log('PASS withdrawal boundaries, fees, no purchase minimum, project and role isolation, accumulated balance disclosure, single-order limit and tiny refunds.')
