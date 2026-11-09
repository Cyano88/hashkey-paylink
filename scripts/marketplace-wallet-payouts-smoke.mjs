import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {decodeFunctionData,parseAbi,getAddress} from 'viem'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceInstructions} from '../api/marketplace/instructions.ts'
const wallet=privateKeyToAccount('0x'+'33'.repeat(32))
let stored,queue=Promise.resolve()
const deps={read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
let repo=createMarketplaceRepository(deps),scopes=['marketplace:payout']
const auth={credentialId:'credential_a',businessReference:'delivery_one'}
let service=createMarketplaceInstructions({enabled:true,repository:repo,resolvePrincipal:async()=>({projectId:'project_a',credentialId:auth.credentialId,active:true,capabilities:['marketplace_payments'],scopes})})
const abi=parseAbi(['function transfer(address to,uint256 amount) returns(bool)'])
for(const asset of ['USDC','USDT']){
 const beneficiaryId='wallet_'+asset,paymentId='payment_'+asset,operationId='operation_'+asset
 const challenge=await repo.beginWalletVerification({projectId:'project_a',sellerId:'seller_a',beneficiaryId,asset,address:wallet.address})
 await repo.verifyWallet('project_a',beneficiaryId,challenge.nonce,await wallet.signMessage({message:challenge.message}))
 await repo.createWithVerifiedWallets({projectId:'project_a',paymentId,network:'base',asset,amount:'1.500001',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId,role:'seller',amount:'1.500001',settlement:asset==='USDC'?'wallet_usdc':'wallet_usdt'}]},'draft_'+asset)
 const body={paymentId,operationId,allocationId:'share_a',amount:'1.5',businessReference:auth.businessReference}
 await assert.rejects(()=>service.reserveWalletPayout('credential','early_'+asset,body),/funding/)
 await repo.execute('project_a',paymentId,'fund_'+asset,{type:'fund',evidenceId:'fixture:'+asset,network:'base',asset,amountUnits:'1500001'})
 await assert.rejects(()=>service.reserveWalletPayout('credential','early_'+asset,body),/Insufficient/)
 await repo.execute('project_a',paymentId,'release_'+asset,{type:'release',allocationId:'share_a',amountUnits:'1500001'})
 for(const extra of [{projectId:'project_other'},{asset:'USDT'},{recipient:wallet.address},{settlement:'cash_balance'},{status:'settled'}])await assert.rejects(()=>service.reserveWalletPayout('credential','bad_'+asset,{...body,...extra}),/fields/)
 scopes=['marketplace:read']
 await assert.rejects(()=>service.reserveWalletPayout('credential','bad_'+asset,body),/denied/)
 scopes=['marketplace:payout']
 await assert.rejects(()=>service.reserveWalletPayout('credential','bad_'+asset,{...body,amount:'1.5000001'}),/decimal/)
 await assert.rejects(()=>repo.walletPayouts.reserve('project_other',paymentId,'bad_'+asset,{operationId,allocationId:'share_a',amount:'1.5'},auth),/not found/)
 const results=await Promise.allSettled(['one','two'].map(id=>service.reserveWalletPayout('credential','reserve_'+asset+'_'+id,{...body,operationId:operationId+'_'+id})))
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 const response=results.find(r=>r.status==='fulfilled').value
 assert.equal(response.asset,asset);assert.equal(response.amountUnits,'1500000');assert.equal(response.recipient,undefined)
 let book=await repo.get('project_a',paymentId)
 assert.equal(book.balances[0].reserved,'1500000');assert.equal(book.balances[0].available,'1')
 const record=book.walletReservations[0]
 repo=createMarketplaceRepository(deps)
 const prepared=await repo.walletPayouts.prepareTransfer('project_a',paymentId,record.operationId)
 assert.equal(prepared.chainId,8453);assert.equal(prepared.to,getAddress(BASE_STABLECOINS[asset].address));assert.equal(prepared.value,'0')
 assert.equal(prepared.requiresExecutionAuthorization,true)
 const decoded=decodeFunctionData({abi,data:prepared.data})
 assert.equal(decoded.functionName,'transfer');assert.equal(decoded.args[0],wallet.address);assert.equal(decoded.args[1],1500000n)
 const replay=await repo.walletPayouts.reserve('project_a',paymentId,record.key,{operationId:record.operationId,allocationId:'share_a',amount:'1.500000'},auth)
 assert.equal(replay.operation.units,'1500000')
 await assert.rejects(()=>repo.walletPayouts.reserve('project_a',paymentId,record.key,{operationId:record.operationId,allocationId:'share_a',amount:'1.4'},auth),/Idempotency/)
 await assert.rejects(()=>repo.execute('project_a',paymentId,'generic_'+asset,{type:'reserve',operationId:'generic_op_'+asset,allocationId:'share_a',kind:'payout',amountUnits:'1'}),/bound reservation/)
 await assert.rejects(()=>repo.execute('project_a',paymentId,'fake_final_'+asset,{type:'result',operationId:record.operationId,status:'settled',evidenceId:'fixture:fake_final_'+asset}),/verified outcome/)
 await repo.revokeWallet('project_a',beneficiaryId)
 await assert.rejects(()=>repo.walletPayouts.prepareTransfer('project_a',paymentId,record.operationId),/no longer eligible/)
 assert.equal((await repo.walletPayouts.reserve('project_a',paymentId,record.key,{operationId:record.operationId,allocationId:'share_a',amount:'1.5'},auth)).operation.status,'reserved')
 await assert.rejects(()=>repo.walletPayouts.reserve('project_a',paymentId,'revoked_'+asset,{operationId:'revoked_op_'+asset,allocationId:'share_a',amount:'0.000001'},auth),/no longer eligible/)
 await repo.execute('project_a',paymentId,'unknown_'+asset,{type:'result',operationId:record.operationId,status:'unknown',evidenceId:'fixture:unknown_'+asset})
 await assert.rejects(()=>repo.walletPayouts.prepareTransfer('project_a',paymentId,record.operationId),/reconciliation/)
 book=await repo.get('project_a',paymentId)
 assert.equal(book.balances[0].reserved,'1500000');assert.equal(book.balances[0].paid,'0')
}
const balances=await repo.sellerBalances('project_a','seller_a')
assert.equal(balances[0].units.reserved,'1500000');assert.equal(balances[1].units.reserved,'1500000')
console.log('PASS wallet payouts: separate USDC/USDT, signed immutable destinations, released-funds gate, precise units/calldata, atomic competing reservations, scoped strict requests, restart/idempotency, revocation and unknown-state protection. No transaction signing, transfer or provider call.')
await repo.create({projectId:'project_a',paymentId:'payment_cash',network:'base',asset:'USDC',amount:'1',allocations:[{id:'cash_share',sellerId:'seller_a',beneficiaryId:'bank_a',role:'seller',amount:'1',settlement:'cash_balance'}]},'draft_cash')
await assert.rejects(()=>repo.walletPayouts.reserve('project_a','payment_cash','reserve_cash',{operationId:'operation_cash',allocationId:'cash_share',amount:'1'},auth),/same-asset Base wallet/)
console.log('PASS Cash balance cannot enter wallet payout reservation.')
