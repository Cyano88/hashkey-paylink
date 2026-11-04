import assert from 'node:assert/strict'
import {pocketBridgeRecoveryRoute as route,pocketBridgeOperationAssets as assets,pocketBridgeReceived as received} from '../src/pocket/lib/pocketBridgeOperation.ts'
import {trackPocketOperation,readPocketOperations,mergePocketOperations} from '../src/pocket/lib/pocketOperationRecovery.ts'
import {CROSS_BRIDGE_ROLLOUT_NETWORKS,crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {crossBridgeSelectionKey} from '../src/pocket/lib/pocketCrossBridgeSelection.ts'
class Storage {getItem(k){return this[k]??null}setItem(k,v){this[k]=v}removeItem(k){delete this[k]}}
assert.deepEqual(route({source:'base'}),{kind:'api',path:'/api/pocket/usdt-bridge'})
assert.deepEqual(route({rail:'bsc',source:'bsc',execution:'privy',asset:'USDC'}),{kind:'api',path:'/api/pocket/bsc-outbound-bridge'})
assert.deepEqual(route({rail:'bsc',source:'solana',asset:'USDT'}),{kind:'api',path:'/api/pocket/bsc-inbound-bridge'})
assert.deepEqual(route({rail:'xlayer',source:'base',asset:'USDC'}),{kind:'api',path:'/api/pocket/xlayer-bridge'})
assert.deepEqual(route({rail:'xlayer',source:'xlayer',execution:'privy',asset:'USDT'}),{kind:'sponsored'})
for(const q of [{rail:'bsc',asset:'BNB'},{source:'arc'}, {rail:'future'},{asset:'ETH'},{execution:'privy'},{selectionKey:'base:ETH:bsc:USDT'},{asset:'USDC',destinationAsset:'USDT'},{tokenIn:{symbol:'ETH'}}])assert.throws(()=>route(q),/route|adapter/)
assert.throws(()=>assets({rail:'cross'}),/identity/)
assert.deepEqual(assets({}),{source:'USDT',destination:'USDT'})
assert.deepEqual(assets({rail:'bsc',asset:'USDC'}),{source:'USDC',destination:'USDC'})
assert.throws(()=>assets({asset:'ETH',tokenIn:{symbol:'USDC'}}),/identity/)
assert.equal(received({amountOut:'2',quote:{receive:'99'}},'processing'),undefined)
assert.equal(received({quote:{receive:'99'}},'completed'),undefined)
for(const value of ['NaN','Infinity','-2','2e5','0','0.000',2])assert.equal(received({amountOut:value},'completed'),undefined)
assert.equal(received({amountOut:'0.000000000000000001'},'completed'),'0.000000000000000001')
assert.equal(CROSS_BRIDGE_ROLLOUT_NETWORKS.includes('arc'),false)
assert.deepEqual(crossBridgeAssets('arc').map(a=>a.symbol),['USDC','EURC'])
assert.throws(()=>crossBridgeSelectionKey({source:'arc',destination:'base',from:'USDC',to:'USDC'}),/rollout/)
const storage=new Storage();let count=0
for(const source of CROSS_BRIDGE_ROLLOUT_NETWORKS)for(const destination of CROSS_BRIDGE_ROLLOUT_NETWORKS)if(source!==destination)for(const from of crossBridgeAssets(source))for(const to of crossBridgeAssets(destination)){
 const id=String(count++),selectionKey=crossBridgeSelectionKey({source,destination,from:from.symbol,to:to.symbol})
 const quote={id,rail:'cross',selectionKey,source,destination,asset:from.symbol,destinationAsset:to.symbol,tokenIn:from,tokenOut:to,amount:'1',receive:'999'}
 const pending={quote,quoteToken:'saved-'+id,txHash:'source-'+id,amountOut:'0.123456',destinationTxHash:'destination-'+id}
 trackPocketOperation('owner','bridge',pending,'completed',storage)
 assert.throws(()=>route(quote),/adapter/,'Unmounted routes cannot leak to legacy endpoints')
}
const rows=mergePocketOperations([],readPocketOperations('owner',storage));assert.equal(rows.length,count)
for(const row of rows){const q=readPocketOperations('owner',storage).find(r=>r.pending.quote.id===row.providerReference).pending.quote;assert.equal(row.assetSymbol,q.asset);assert.equal(row.destinationAsset,q.destinationAsset);assert.equal(row.receivedAmount,'0.123456');assert.notEqual(row.receivedAmount,q.receive)}
assert.equal(readPocketOperations('another-owner',storage).length,0)
const guardStore=new Storage(),original={quoteToken:'sealed',quote:{id:'bound',source:'base',destination:'solana',amount:'1',asset:'USDT'}}
trackPocketOperation('owner','bridge',original,'processing',guardStore)
trackPocketOperation('owner','bridge',{...original,quote:{...original.quote,destination:'ethereum'}},'completed',guardStore)
assert.equal(readPocketOperations('owner',guardStore)[0].state,'processing','Changed route cannot settle the saved operation')
trackPocketOperation('owner','bridge',{...original,amountOut:'0.99',destinationTxHash:'destination'},'completed',guardStore)
const completed=readPocketOperations('owner',guardStore),server=mergePocketOperations([],completed)[0]
const enriched=mergePocketOperations([{...server,receivedAmount:undefined,destinationAsset:undefined}],completed)[0]
assert.equal(enriched.receivedAmount,'0.99','An existing completed server row gets the saved actual receipt amount')
assert.equal(enriched.destinationAsset,'USDT')
console.log('PASS unified bridge route selection, fail-closed unknown adapters, exact receipt assets across '+count+' pairs, no quoted-output receipt, legacy defaults and Arc history preserved. Fixture only.')
