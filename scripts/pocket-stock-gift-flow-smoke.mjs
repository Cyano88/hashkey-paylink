import assert from 'node:assert/strict'
import {randomUUID,webcrypto} from 'node:crypto'
import {createGiftService} from '../api/pocket/gifts/service.ts'
import {giftCircleChallenge} from '../api/pocket/gifts/circle.ts'
import {privateKeyToAccount} from 'viem/accounts'
import {multiGiftAccountId} from '../api/pocket/gifts/multi-authorization.ts'
import {preparePocketGiftFunding,approvePocketGift,createPocketGift,readPocketGift,preparePocketGiftRefund} from '../src/pocket/api/pocketGiftsClient.ts'
import {runStockSubmission,readStockAttempts,settleStockGiftProof,hasStockSubmission} from '../src/pocket/lib/pocketStockSubmission.ts'
import catalogue from '../src/pocket/lib/pocketXStocksCatalog.json' with {type:'json'}
const addr=n=>'0x'+String(n).repeat(40),hash=n=>'0x'+String(n).repeat(64),signer=privateKeyToAccount(hash(1)),authority=privateKeyToAccount(hash(2)),now=1000
const asset={chainId:196,rail:'xstocks',token:catalogue.assets[0].address,symbol:catalogue.assets[0].symbol,decimals:18}
const deployment={protocol:2,network:'xlayer',chainId:196,escrow:addr(3),token:asset.token,treasury:addr(4),claimAuthority:authority.address,runtimeHash:hash(5),deploymentBlock:'1',confirmations:2,asset}
const records=new Map(),store={read:async id=>records.get(id),update:async(id,fn)=>{const next=fn(records.get(id));records.set(id,next);return next}}
const service=createGiftService({store,now:()=>now*1000,stockAssets:()=>[asset],deployment:()=>deployment,accountId:(id,user)=>multiGiftAccountId('a'.repeat(64),id,user),signAccountClaim:d=>authority.signTypedData(d),wallet:async()=>({id:'stock-wallet',address:addr(6)}),observe:async()=>({state:'unfunded',blockNumber:10n,blockHash:hash(7),timestamp:BigInt(now),claimedCount:0,settlements:{}}),challenge:giftCircleChallenge})
const identity={userId:'sender',handle:'sender'}
const created=await service.create(identity,{requestId:randomUUID(),network:'xlayer',token:asset.token,amount:'1',claims:'1000',claimSigner:signer.address,expiresAt:'2000'})
assert.equal(created.funding.totalDebit,'1002500000000000000');assert.equal(created.gift.amount,'0.001')
const authorized=await service.authorize(identity,created.gift.id,'funding','xstocks')
assert.equal(authorized.approval.execution.kind,'funding');assert.equal(authorized.approval.execution.recipients,1000)
assert.equal((await service.authorize(identity,created.gift.id,'funding','xstocks')).approval.id,authorized.approval.id)
let signed=0
const session={chain:'xlayer',wallet:{address:addr(6)},userToken:'xstocks',signGift:async intent=>{signed++;assert.equal(intent.id,created.gift.id);return hash(8)}}
const approval=await preparePocketGiftFunding({id:created.gift.id,session,accessToken:'fixture',fetcher:async()=>new Response(JSON.stringify({ok:true,...authorized}),{status:200})})
assert.equal((await approvePocketGift({approval,session})).transactionHash,hash(8));assert.equal(signed,1)
await assert.rejects(()=>preparePocketGiftFunding({id:created.gift.id,session,accessToken:'fixture',fetcher:async()=>new Response(JSON.stringify({ok:true,...authorized,approval:{...authorized.approval,execution:{...authorized.approval.execution,kind:'claim'}}}),{status:200})}))
const saved=new Map();globalThis.localStorage={get length(){return saved.size},key:i=>[...saved.keys()][i],getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)}
globalThis.crypto??=webcrypto
const key='owner:wallet',gift={id:'gift-a',attemptId:'attempt-a',operation:'funding'}
await assert.rejects(()=>runStockSubmission({key,kind:'gift',gift,send:async()=>{throw Error('connection lost')},onPending:()=>{},onUncertain:()=>{}}))
assert.equal(hasStockSubmission(key),true);assert.equal(readStockAttempts(key)[0].gift.id,'gift-a')
settleStockGiftProof(key,'other-gift','funding',hash(8));assert.equal(hasStockSubmission(key),true)
settleStockGiftProof(key,'gift-a','claim',hash(8));assert.equal(hasStockSubmission(key),true)
settleStockGiftProof(key,'gift-a','funding',hash(8));assert.equal(hasStockSubmission(key),false);assert.equal(readStockAttempts(key)[0].status,'confirmed')
const draft={version:2,requestId:randomUUID(),network:'xlayer',asset,amount:'1',claims:1000,signer:signer.address,expiresAt:'2000',message:''}
await createPocketGift({draft,accessToken:'fixture',fetcher:async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.network,'xlayer');assert.equal(body.token,asset.token);assert.equal(body.claims,'1000');return new Response(JSON.stringify({ok:true,...created}),{status:200})}})
const fractional={...created.gift,status:'available',amount:'0.0000001'}
assert.equal((await readPocketGift(created.gift.id,async()=>new Response(JSON.stringify({ok:true,gift:fractional})))).amount,'0.0000001')
await assert.rejects(()=>readPocketGift(created.gift.id,async()=>new Response(JSON.stringify({ok:true,gift:{...fractional,asset:undefined}}))))
await assert.rejects(()=>preparePocketGiftRefund({id:created.gift.id,session,accessToken:'fixture',fetcher:async()=>new Response(JSON.stringify({ok:true,...authorized}))}))
console.log('PASS stock creation request, sub-six-decimal public gift, asset binding and wrong refund operation rejection.')
console.log('PASS stock service/client routing, exact fee and 1,000 shares, idempotent approval, wrong operation rejection, durable unknown-broadcast recovery only by matching canonical proof.')
