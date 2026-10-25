import assert from 'node:assert/strict'
import {exchangeTransferDisposition as classify} from '../api/pocket/exchange-transfer-notifications.ts'
import {deliverStockNotices,normalizeStockNotices} from '../api/pocket/xstocks-notifications-store.ts'
const hash='0x'+'a'.repeat(64),source='0x'+'b'.repeat(64),now=Date.now()
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
const deps={configured:()=>true,listOwners:async()=>['owner'],read:async()=>s,listActions:async()=>records,mutate:async fn=>{fn(s);return s},send:async(...args)=>{sent.push(args);return true}}
await deliverStockNotices(deps);assert.equal(sent.length,0);assert(!n.delivered&&!n.pushSuppressed)
records=[{...records[0],status:'completed',metadata:{...records[0].metadata,destinationTxHash:hash}}]
await deliverStockNotices(deps);assert.equal(sent.length,0);assert(n.pushSuppressed)
s.notices.external={...n,id:'external',hash:'0x'+'c'.repeat(64),pushSuppressed:false}
await deliverStockNotices(deps);assert.equal(sent.length,1)
console.log('PASS swap/cash pending classification, cancellation, network/asset isolation and X Layer durable defer/suppress/external delivery.')
