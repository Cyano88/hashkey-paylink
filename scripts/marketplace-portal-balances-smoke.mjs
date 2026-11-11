import assert from 'node:assert/strict'
import {marketplacePortalBalances} from '../api/marketplace/portal-balances.ts'
import {createDeveloperProjectsHandler} from '../api/developer-projects.ts'
const book=(projectId,sellerId,pending)=>({plan:{projectId,paymentId:projectId+'_order',asset:'USDC',network:'base',allocations:[{id:'share',sellerId,role:'seller',beneficiaryId:'bank_a',settlement:'cash_balance',amountUnits:pending}]},balances:[{allocationId:'share',pending,available:'0',reserved:'0',paid:'0',refunded:'0'}],operations:[],journal:[],collectionProof:{private:'SECRET'},beneficiarySnapshots:[{encryptedDetails:'SECRET'}]})
const store={books:[book('dev_owned123','seller_a','1500000'),book('dev_foreign123','seller_b','900000000')],drafts:[]}
const view=marketplacePortalBalances(store,'dev_owned123')
assert.equal(view.totals[0].units.pending,'1500000');assert.equal(view.sellers.length,1);assert.equal(JSON.stringify(view).includes('SECRET'),false);assert.equal(JSON.stringify(view).includes('seller_b'),false)
assert.equal(marketplacePortalBalances(store,'dev_owned123','missing').sellers.length,0)
assert.equal(marketplacePortalBalances(undefined,'dev_owned123').totals[0].units.pending,'0')
let owner='owner',reads=0
const handler=createDeveloperProjectsHandler({hasStore:()=>true,portalSecret:()=> 'x'.repeat(32),verify:async()=>({userId:owner,email:'test@example.test'}),read:async()=>({projects:{dev_owned123:{id:'dev_owned123',ownerId:'owner'}}}),marketplaceQuoteRead:async()=>({requests:[]}),marketplaceRead:async()=>{reads++;return store}})
async function call(query,method='GET'){const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}};await handler({method,query,headers:{}},res);return res}
const q={resource:'marketplace-balances',projectId:'dev_owned123'}
assert.equal((await call(q)).body.totals[0].units.pending,'1500000');assert.equal(reads,1)
owner='other';assert.equal((await call(q)).code,404);assert.equal(reads,1)
owner='owner';assert.equal((await call({...q,environment:'test'})).code,400);assert.equal((await call({...q,sellerId:['seller_a']})).code,400);assert.equal(reads,1)
assert.equal((await call(q)).headers['Cache-Control'],'no-store')
console.log('PASS portal balances: owner authorization before ledger read, project isolation, no sensitive fields, exact integer totals, empty/filter states and live-only boundary.')

const failure={code:'MARKETPLACE_BANK_COMMISSION_NOT_ZERO',message:'Zero commission required.',details:{commissionUnits:'3000'},httpStatus:503}
const quoteView=marketplacePortalBalances(store,'dev_owned123','seller_a',{requests:[{id:'a',projectId:'dev_owned123',sellerId:'seller_a',operationId:'op_a',state:'failed',failedAt:1,failure,providerOrderIds:['private_provider'],fingerprint:'private_hash'},{id:'b',projectId:'dev_foreign123',sellerId:'seller_a',operationId:'op_b',state:'failed',failedAt:2,failure,providerOrderIds:[],fingerprint:'private_hash'}]})
assert.equal(quoteView.quoteFailures.length,1);assert.equal(quoteView.quoteFailures[0].operationId,'op_a');assert.equal(JSON.stringify(quoteView).includes('private_'),false)
