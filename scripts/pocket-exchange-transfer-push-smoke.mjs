import assert from 'node:assert/strict'
import {exchangeTransferDisposition as classify} from '../api/pocket/exchange-transfer-notifications.ts'
import {deliverStockNotices,normalizeStockNotices} from '../api/pocket/xstocks-notifications-store.ts'
const hash='0x'+'a'.repeat(64),source='0x'+'b'.repeat(64),now=Date.now()
for(const action of ['wallet.bridge','wallet.usdt-bridge','wallet.xlayer-bridge','wallet.bsc-bridge','bank-withdraw.route']){
 const record={action,status:'completed',createdAt:now-86400000,updatedAt:now-86340000,metadata:{source:'polygon',destination:'base',assetSymbol:'USDC',txHash:source}}
 const row={txHash:hash,chain:'base',assetSymbol:'USDC',direction:'in',ts:now-31000}
 assert.equal(classify(row,[record]),'allow','old completed bridge must not hold new external deposits')
 assert.equal(classify({...row,ts:record.updatedAt},[record]),'defer','late discovery of settlement still waits')
 assert.equal(classify({...row,ts:record.updatedAt+30000},[record]),'defer','completion clock tolerance retained')
 assert.equal(classify({...row,ts:record.updatedAt+30001},[record]),'allow')
 assert.equal(classify(row,[{...record,status:'submitted'}]),'defer','unresolved bridge remains guarded')
 assert.equal(classify(row,[{...record,metadata:{...record.metadata,destinationTxHash:hash}}]),'suppress','known settlement hash wins regardless of time')
}
for(const action of ['wallet.swap','wallet.native-swap','wallet.bsc-swap','wallet.cash-conversion']){
 const record={action,status:'submitted',createdAt:now-60_000,metadata:{network:'base',assetSymbol:'USDT',toAsset:'USDC'}}
 const row={txHash:hash,chain:'base',assetSymbol:'USDC',direction:'in',ts:now-31_000}
 assert.equal(classify(row,[record]),'defer')
 assert.equal(classify(row,[{...record,status:'completed',metadata:{...record.metadata,txHash:hash}}]),'suppress')
 assert.equal(classify(row,[{...record,status:'cancelled'}]),'allow')
 assert.equal(classify({...row,chain:'solana'},[record]),'allow')
 assert.equal(classify({...row,assetSymbol:'ETH'},[record]),'allow')
}
const s=normalizeStockNotices();const n={id:'transfer',owner:'owner',title:'USDC received',body:'1 USDC received on X Layer.',at:now-31_000,hash,transfer:{symbol:'USDC',direction:'in',token:'0x1',amount:'1',from:'router',to:'wallet'}};s.notices[n.id]=n
let records=[{action:'wallet.xlayer-bridge',status:'submitted',createdAt:now-60_000,metadata:{source:'base',destination:'xlayer',txHash:source}}],sent=[]
const deps={readContext:async()=>[],configured:()=>true,listOwners:async()=>['owner'],read:async()=>s,listActions:async()=>records,mutate:async fn=>{fn(s);return s},send:async(...args)=>{sent.push(args);return true}}
await deliverStockNotices(deps);assert.equal(sent.length,0);assert(!n.delivered&&!n.pushSuppressed)
records=[{...records[0],status:'completed',metadata:{...records[0].metadata,destinationTxHash:hash}}]
await deliverStockNotices(deps);assert.equal(sent.length,0);assert(n.pushSuppressed)
s.notices.external={...n,id:'external',hash:'0x'+'c'.repeat(64),pushSuppressed:false}
await deliverStockNotices(deps);assert.equal(sent.length,1)
console.log('PASS swap/cash pending classification, cancellation, network/asset isolation and X Layer durable defer/suppress/external delivery.')

const context={eventId:'cross',source:'wallet-bridge',chain:'base',destination:'arbitrum',assetSymbol:'USDC',destinationAsset:'USDT',amount:'0.2',paycrestStatus:'processing',txHash:source,ts:now-60000};
const arrival={txHash:hash,chain:'arbitrum',assetSymbol:'USDT',direction:'in',ts:now-31000};
assert.equal(classify(arrival,[],[context]),'defer');
assert.equal(classify({...arrival,assetSymbol:'ETH'},[],[context]),'allow');
assert.equal(classify(arrival,[],[{...context,paycrestStatus:'completed',destinationTxHash:hash}]),'suppress');
assert.equal(classify({...arrival,txHash:source,chain:'base',direction:'out',assetSymbol:'USDC'},[],[context]),'suppress');
console.log('PASS cross-asset context binds source debit and destination token before settlement hash is known.')
