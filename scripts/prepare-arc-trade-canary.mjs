import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {createPublicClient,http} from 'viem'
import {parseArcTradeCheckout,bindArcTradeTerms} from '../api/trade-agreement/arc.ts'
import {planArcTradeCandidate} from '../api/trade-agreement/arc-planner.ts'
import {inspectArcTradeRelease} from '../api/trade-agreement/arc-preflight.ts'
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''))
const output='.codex-temp/arc-trade-canary.json'
const wallets=read('.codex-temp/arc-circle-canary-wallets.json').wallets
const release=read('docs/audits/arc-trade-factory-deployment-2026-10-03.json').releaseCandidate
const policy=read('.codex-temp/arc-circle-seller-activation-verified.json').policyCandidate
assert.equal(policy.entryPointVersion,'0.7')
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
const preflight=await inspectArcTradeRelease({manifest:{release,executionPolicy:policy},wallets:wallets.map(w=>w.address),reader:()=>client})
assert(preflight.checksPassed,preflight.blockers.join(' '))
let record
if(existsSync(output))record=read(output)
else{
 const offerId=randomUUID(),digest=createHash('sha256').update('Arc Trade canary '+offerId).digest('hex')
 const terms=parseArcTradeCheckout({kind:'trade',paymentRail:'arc',chainId:5042,paymentToken:'0x3600000000000000000000000000000000000000',title:'Arc Trade 0.10 USDC canary',description:'Controlled mainnet test between the selected buyer and seller. No goods are being purchased.',amount:'0.10',trade:{offerId,listingRevision:1,snapshotHash:digest,price:'0.10',deliveryFee:'0.00',handover:'Pickup',location:'Controlled test',carrier:'',returns:'Test only. Return the 0.10 USDC principal to the buyer after lifecycle verification.',dispatchDays:1,deliveryDays:1,inspectionHours:24}})
 const binding=bindArcTradeTerms('tag_'+digest,terms,wallets.find(w=>w.role==='buyer').address,wallets.find(w=>w.role==='seller').address,Math.floor(Date.now()/1000),release)
 record={createdAt:new Date().toISOString(),terms,binding,release,policy,wallets}
 assert.equal(binding.contractTerms.amount,'100000')
 writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'})
}
const plan=await planArcTradeCandidate({binding:record.binding,account:record.wallets.find(w=>w.role==='seller').address,fundingEnabled:true,action:'create'},client,record.release)
assert(plan.transaction)
console.log(JSON.stringify({prepared:true,principalUsdc:'0.10',next:'Seller creates unfunded escrow',chainId:5042,termsHash:record.binding.termsHash,fundBy:record.binding.contractTerms.fundBy,noChallengeRequested:true}))
