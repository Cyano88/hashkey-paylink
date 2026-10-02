import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const owner='owner-a',foreign='owner-b',now=Date.now(),gift='g_'+'a'.repeat(22)
globalThis.fx={owner,request:{id:'request-a',senderId:owner,recipientId:'recipient',title:'Request',amount:'2',network:'base',status:'accepted',updatedAt:now},gift:{id:gift,ownerId:owner,state:'available',amount:'2',deployment:{network:'base'},fundingHash:'hash',expiresAt:String(Math.floor(now/1000)+1000),updatedAt:now,claimSigner:'SECRET',salt:'SECRET',signature:'SECRET'},terminals:[{id:'terminal-a',owner,name:'Own shop',destinationIds:['destination'],createdAt:now},{id:'terminal-b',owner:foreign,name:'FOREIGN',destinationIds:[],createdAt:now}],links:[{eventId:'collection-a',ownerId:owner,title:'Own collection',updatedAt:now},{eventId:'collection-b',ownerId:foreign,title:'FOREIGN',updatedAt:now}]}
const mocks={
 'request-store.js':'export const createPocketRequestRepository=()=>({listFor:async()=>[globalThis.fx.request],getFor:async()=>globalThis.fx.request})',
 'circle-pocket-action-journal.js':'export const listCirclePocketActions=async(owner,limit,action)=>action==="gift.sent"?[{ownerId:owner,resourceId:globalThis.fx.gift.id,action,updatedAt:Date.now(),metadata:{amount:"2"}}]:[]',
 'store.js':'export const durableGiftStore={read:async()=>globalThis.fx.gift}',
 'unified-xpay-store.js':'export const readUnifiedXPayStore=async()=>({checkouts:globalThis.fx.terminals})',
 'ng-pos.js':'export const listPocketBankCollections=async()=>[];export const listPocketUnifiedXPayPosPayments=async(owner,id)=>{if(owner!==globalThis.fx.owner||id!=="terminal-a")throw Error("scope");return [{amount:"1000",asset:"NGN",state:"pending",createdAt:Date.now(),network:"base"}]}',
 'xpay.js':'export const listPocketUnifiedXPayStockPayments=async()=>[]',
 'paylink-store.js':'export const pocketPaylinkRepository={listOwned:async()=>globalThis.fx.links}',
 'event-registry.js':'export const listRegisteredPaymentsForEventIds=async ids=>{if(ids.length!==1||ids[0]!=="collection-a")throw Error("scope");return [{eventId:"collection-a",amount:"1",chain:"base",ts:Date.now()},{eventId:"collection-b",amount:"999",chain:"base",ts:Date.now()}]}',
 'paycrest-pos.js':'export const listPaycrestPosOrdersForMerchants=async()=>[]'
}
const b=await build({entryPoints:['api/pocket/support-feature-records.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'storage-only',setup(b){b.onResolve({filter:/.*/},a=>{const name=a.path.split('/').at(-1);if(mocks[name])return{path:name,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const m={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports)
const read=m.exports.readSupportFeatureRecords;let network=0;globalThis.fetch=async()=>{network++;throw Error('No outbound requests allowed')}
assert.equal((await read(owner,'requests','request-a'))[0].status,'accepted');globalThis.fx.request.senderId=foreign;assert.equal((await read(owner,'requests','request-a')).length,0)
assert.equal((await read(owner,'gifts',gift))[0].status,'available');assert.ok(!JSON.stringify(await read(owner,'gifts',gift)).includes('SECRET'));globalThis.fx.gift.ownerId=foreign;assert.equal((await read(owner,'gifts',gift)).length,0)
assert.equal((await read(owner,'xpay')).length,1);assert.equal((await read(owner,'xpay','terminal-b')).length,0);assert.match((await read(owner,'xpay','terminal-a'))[0].details.join(' '),/₦1,000/)
assert.equal((await read(owner,'collections')).length,1);assert.equal((await read(owner,'collections','usdc:collection-b')).length,0);const collection=await read(owner,'collections','usdc:collection-a');assert.ok(!JSON.stringify(collection).includes('999'));assert.equal(network,0)
console.log('PASS real feature adapters with storage fixtures: owner/recipient/terminal/collection binding, no bearer secrets, scoped contributions and zero outbound requests')
