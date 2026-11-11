import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
const owner=privateKeyToAccount('0x'+'11'.repeat(32)),other=privateKeyToAccount('0x'+'22'.repeat(32))
let stored,queue=Promise.resolve(),now=1000000
const deps={now:()=>now,read:async()=>structuredClone(stored),mutate:fn=>{
 const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)})
 queue=job.catch(()=>{});return job
}}
let repo=createMarketplaceRepository(deps)
const request={projectId:'project_a',sellerId:'seller_a',beneficiaryId:'wallet_v1',asset:'USDC',address:owner.address}
const input={projectId:'project_a',paymentId:'payment_one',network:'base',asset:'USDC',amount:'1.5',allocations:[{id:'share_a',sellerId:'seller_a',role:'seller',amount:'1.5',settlement:'wallet_usdc',beneficiaryId:'wallet_v1'}]}
await assert.rejects(()=>repo.createWithVerifiedWallets(input,'draft_one'),/verified beneficiary/)
await assert.rejects(()=>repo.beginWalletVerification({...request,address:'0x'+'00'.repeat(20)}),/Zero/)
await assert.rejects(()=>repo.beginWalletVerification({...request,asset:'ETH'}),/Unsupported/)
const old=await repo.beginWalletVerification(request)
const challenge=await repo.beginWalletVerification(request)
assert.notEqual(old.nonce,challenge.nonce)
assert.match(challenge.message,/Base \(8453\)/)
assert.match(challenge.message,/Seller: seller_a/)
const signature=await owner.signMessage({message:challenge.message})
await assert.rejects(()=>repo.verifyWallet('project_a','wallet_v1',old.nonce,signature),/not found/)
await assert.rejects(()=>repo.verifyWallet('project_other','wallet_v1',challenge.nonce,signature),/not found/)
await assert.rejects(()=>repo.verifyWallet('project_a','wallet_v1',challenge.nonce,'0x1234'),/signature/)
const wrong=await other.signMessage({message:challenge.message})
await assert.rejects(()=>repo.verifyWallet('project_a','wallet_v1',challenge.nonce,wrong),/verification failed/)
const changedSeller=await owner.signMessage({message:challenge.message.replace('Seller: seller_a','Seller: seller_b')})
await assert.rejects(()=>repo.verifyWallet('project_a','wallet_v1',challenge.nonce,changedSeller),/verification failed/)
const verified=await repo.verifyWallet('project_a','wallet_v1',challenge.nonce,signature)
assert.equal(verified.address,owner.address);assert.equal(verified.status,'active')
await assert.rejects(()=>repo.verifyWallet('project_a','wallet_v1',challenge.nonce,signature),/not found/)
await assert.rejects(()=>repo.beginWalletVerification({...request,address:other.address}),/already exists/)
for(const allocation of [{sellerId:'seller_other'}, {beneficiaryId:'missing_wallet'}, {settlement:'cash_balance'}]) {
 await assert.rejects(()=>repo.createWithVerifiedWallets({...input,allocations:[{...input.allocations[0],...allocation}]},'draft_one'))
}
await assert.rejects(()=>repo.createWithVerifiedWallets({...input,asset:'USDT',allocations:[{...input.allocations[0],settlement:'wallet_usdt'}]},'draft_one'),/matching/)
const book=await repo.createWithVerifiedWallets(input,'draft_one')
assert.equal(book.beneficiarySnapshots[0].address,owner.address)
await repo.revokeWallet('project_a','wallet_v1')
repo=createMarketplaceRepository(deps)
assert.equal((await repo.get('project_a','payment_one')).beneficiarySnapshots[0].status,'active','snapshot is historical, not live eligibility')
assert.equal(stored.walletBeneficiaries[0].status,'revoked')
assert.deepEqual(await repo.createWithVerifiedWallets(input,'draft_one'),book,'retry returns original immutable draft')
await assert.rejects(()=>repo.createWithVerifiedWallets({...input,paymentId:'payment_two'},'draft_two'),/active/)
await assert.rejects(()=>repo.beginWalletVerification(request),/already exists/)
const exp=await repo.beginWalletVerification({...request,beneficiaryId:'wallet_expired'})
const expSignature=await owner.signMessage({message:exp.message})
now=exp.expiresAt
await assert.rejects(()=>repo.verifyWallet('project_a','wallet_expired',exp.nonce,expSignature),/expired/)
const race=await repo.beginWalletVerification({...request,beneficiaryId:'wallet_race'})
const raceSignature=await owner.signMessage({message:race.message})
const results=await Promise.allSettled([1,2].map(()=>repo.verifyWallet('project_a','wallet_race',race.nonce,raceSignature)))
assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
assert.equal(stored.walletBeneficiaries.filter(b=>b.beneficiaryId==='wallet_race').length,1)
assert.equal(JSON.stringify(stored).includes(signature),false,'raw signatures are not persisted')
console.log('PASS wallet beneficiaries: signed project/seller/asset/version binding, wrong signer, expiry/replay/replacement, atomic consumption, immutable draft snapshots, route checks, revocation and restart. Fixture keys only; no chain/provider calls.')
const funded={type:'fund',evidenceId:'fixture:bound_payment',network:'base',asset:'USDC',amountUnits:'1500000'}
await repo.execute('project_a','payment_one','fund_bound',funded)
await repo.execute('project_a','payment_one','release_bound',{type:'release',allocationId:'share_a',amountUnits:'1500000'})
await assert.rejects(()=>repo.execute('project_a','payment_one','reserve_bound',{type:'reserve',operationId:'payout_bound',allocationId:'share_a',kind:'payout',amountUnits:'1500000'}),/no longer eligible/)
assert.equal((await repo.get('project_a','payment_one')).balances[0].reserved,'0')
console.log('PASS revoked beneficiary blocks new payout reservation atomically.')

const {hashMessage}=await import('viem')
let magic='0x1626ba7e',chainId=8453,reads=0
const contractClient={getChainId:async()=>chainId,getCode:async()=> '0x6000',readContract:async args=>{reads++;assert.equal(args.functionName,'isValidSignature');assert.equal(args.args[0],hashMessage(contractChallenge.message));return magic}}
const contractRepo=createMarketplaceRepository({...deps,walletVerificationClient:contractClient})
const contractChallenge=await contractRepo.beginWalletVerification({...request,beneficiaryId:'wallet_contract',address:'0x'+'55'.repeat(20)})
chainId=1;await assert.rejects(()=>contractRepo.verifyWallet('project_a','wallet_contract',contractChallenge.nonce,'0x1234'),/requires Base/)
assert.equal(reads,0)
chainId=8453;magic='0xffffffff';await assert.rejects(()=>contractRepo.verifyWallet('project_a','wallet_contract',contractChallenge.nonce,'0x1234'),/verification failed/)
magic='0x1626ba7e'
await contractRepo.verifyWallet('project_a','wallet_contract',contractChallenge.nonce,'0x1234')
await assert.rejects(()=>contractRepo.verifyWallet('project_a','wallet_contract',contractChallenge.nonce,'0x1234'),/not found/)
console.log('PASS deployed Base contract beneficiary verifies ERC-1271 exact challenge, magic value, chain and consumed nonce. Mock RPC only.')
