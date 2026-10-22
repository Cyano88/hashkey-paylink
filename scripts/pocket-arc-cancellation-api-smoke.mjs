import assert from 'node:assert/strict'
import {createArcSwapHandler} from '../api/pocket/arc-swap.ts'
import {sealArcSwapQuote} from '../api/pocket/arc-swap-provider.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='fixture-preview-secret-thirty-two-characters'
const address='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64)
const tokenIn={address:'0x3600000000000000000000000000000000000000',symbol:'USDC',name:'USDC',decimals:6,chainId:5042},tokenOut={...tokenIn,address:'0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',symbol:'EURC'}
const quote={id:'fixture',ownerId:'owner',walletId:'wallet',walletAddress:address,chainId:5042,tokenIn,tokenOut,amount:'0.5',amountUnits:'500000',expectedOut:'0.45',minimumOut:'0.44',minimumOutUnits:'440000',expiresAt:Date.now()+60000,callData:'0x',provider:'fixture',gasUsdc:'0',fees:[]}
const quoteToken=sealArcSwapQuote(quote)
let record,provider,writes=0
const reset=(status='submitted')=>{record={ownerId:'owner',idempotencyKey:'pocket:arc-swap:fixture',action:'wallet.swap',status,resourceId:'fixture',metadata:{challengeId:'challenge',quoteToken,walletAddress:address},createdAt:1,updatedAt:1};writes=0}
const handler=createArcSwapHandler({identity:async()=>({userId:'owner'}),readLink:async()=>({circleBlockchain:'ARC',circleWalletId:'wallet',circleWalletAddress:address}),client:{getChainId:async()=>5042,getTransactionReceipt:async()=>{throw Object.assign(Error('pending'),{name:'TransactionReceiptNotFoundError'})}},findAction:async()=>record,recordAction:async value=>{writes++;record={...record,...value};return record},listActions:async()=>[record],readChallenge:async()=>{if(provider instanceof Error)throw provider;return provider}})
async function call(action='status',extra={}){let code=200,body;await handler({method:'POST',body:{action,quoteToken,circleUserToken:'fixture',...extra}},{setHeader(){},status(c){code=c;return this},json(v){body=v;return this}});return{code,...body}}
for(const [outcome,expected] of [['cancelled','cancelled'],['expired','not_submitted'],['rejected','not_submitted']]){reset('failed');provider={status:'failed',notSubmitted:true,approvalOutcome:outcome};assert.equal((await call()).status,expected);assert.equal(record.status,expected)}
reset();provider={status:'awaiting_approval'};assert.equal((await call('cancel')).status,'cancelled');assert.equal(record.status,'cancelled');assert.equal((await call('execute')).code,409,'closed quote cannot be signed again');assert.equal((await call()).status,'cancelled','stale provider approval cannot resurrect cancellation')
for(const p of [{status:'pending'},{status:'pending',txHash:hash},new Error('offline')]){reset();provider=p;const result=await call('cancel');assert.notEqual(result.status,'cancelled');assert.notEqual(record.status,'cancelled');if(p.txHash)assert.equal(record.metadata.txHash,hash)}
reset('cancelled');provider={status:'pending',txHash:hash};const late=await call();assert.equal(late.status,'pending');assert.equal(late.txHash,hash);assert.equal(record.status,'submitted','late transaction evidence restores tracking');
reset();provider={status:'failed',txHash:hash};assert.equal((await call()).status,'failed');assert.equal(record.metadata.txHash,hash)
reset();provider={status:'awaiting_approval'};assert.equal((await call('cancel',{quoteToken:sealArcSwapQuote({...quote,ownerId:'other'})})).code,403);assert.equal(writes,0)
console.log('PASS Arc provider cancellation/expiry classification, legacy repair, submission uncertainty, late hash recovery, closed quote replay and ownership')
