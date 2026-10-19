import {createHmac} from 'node:crypto'
import {decodeEventLog,parseAbiItem,type Address} from 'viem'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {okxCredentials} from './xstocks-swap-provider.js'
import {stockAssets,stockUsdc,stockUsdt} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {stockNoticeClient as client,stockNoticeAsset,recordStockTransfer,mutateStockNotices,type StockNoticeStore,type ConfirmedStockTransfer} from './xstocks-notifications-store.js'
import {stockTradeProof,nativeTradeLegs,recordStockTradeNotices} from './stock-trade-notifications.js'
import {archiveStockInvestments,investmentScope} from './stock-investment-ledger.js'

type Recovery={end:number;cursor:string;pending:string[];seen:Record<string,true>;complete:boolean}
const key='pocket:stock-investment-recovery:v1',stocks=new Set(stockAssets.map(a=>a.address.toLowerCase()))
const allowed=new Set([...stocks,stockUsdc.address.toLowerCase(),stockUsdt.address.toLowerCase()])
export async function recoverStockInvestmentTransaction(owner:string,wallet:string,hash:string){
 const [tx,receipt]=await Promise.all([client.getTransaction({hash:hash as Address}),client.getTransactionReceipt({hash:hash as Address})])
 if(receipt.status!=='success')throw Error('Investment is not confirmed')
 const block=await client.getBlock({blockNumber:receipt.blockNumber})
 if(block.hash!==receipt.blockHash||tx.blockHash!==receipt.blockHash)throw Error('Investment block changed')
 const at=Number(block.timestamp)*1000,transfers:ConfirmedStockTransfer[]=[]
 for(const log of receipt.logs){
  if(!allowed.has(log.address.toLowerCase()))continue
  let args:{from:Address;to:Address;value:bigint}
  try{args=decodeEventLog({abi:[parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')],topics:log.topics,data:log.data}).args}catch{continue}
  const asset=await stockNoticeAsset(log.address)
  transfers.push({id:hash+':'+log.logIndex,hash,from:args.from,to:args.to,token:log.address.toLowerCase(),symbol:asset.symbol,units:String(args.value),decimals:asset.decimals,at})
 }
 const proof=stockTradeProof(tx,receipt)
 if(proof)transfers.push(...nativeTradeLegs(proof,receipt.logs,at))
 const history:StockNoticeStore={wallets:{[owner]:{address:wallet,since:0}},notices:{},requests:{},reads:{}}
 transfers.forEach(t=>recordStockTransfer(history,t));recordStockTradeNotices(history,transfers,proof?[proof]:[])
 archiveStockInvestments(history)
 const scope=investmentScope(owner,wallet),entries=history.investments?.[scope]||{}
 await mutateStockNotices(s=>{
  if(s.wallets[owner]?.address.toLowerCase()!==wallet.toLowerCase())throw Error('Investment wallet changed')
  s.investments ||= {};s.investments[scope]={...s.investments[scope],...entries}
 }) // Historical repair never creates activity or push notifications.
}

// One index page and at most four receipts per job. Persist progress so idle
// views do not repeatedly fetch the same history. Index rows only discover hashes;
// quantities and trade identity come from canonical receipts above.
export async function recoverStockInvestments(owner:string,wallet:string){
 const scope=investmentScope(owner,wallet)
 const all=await readDurableJson<Record<string,Recovery>>(key)||{}
 const state=all[scope]||{end:Date.now()-60000,cursor:'',pending:[],seen:{},complete:false}
 if(state.complete&&!state.pending.length)return
 if(await client.getChainId()!==196)throw Error('Wrong investment chain')
 if(!state.pending.length&&!state.complete){
  const c=okxCredentials();if(!c.key||!c.secret||!c.passphrase)throw Error('History unavailable')
  const path='/api/v6/dex/post-transaction/transactions-by-address?'+new URLSearchParams({address:wallet,chains:'196',end:String(state.end),limit:'20',...(state.cursor?{cursor:state.cursor}:{})})
  const timestamp=new Date().toISOString()
  const response=await fetch('https://web3.okx.com'+path,{headers:{'OK-ACCESS-KEY':c.key,'OK-ACCESS-SIGN':createHmac('sha256',c.secret).update(timestamp+'GET'+path).digest('base64'),'OK-ACCESS-PASSPHRASE':c.passphrase,'OK-ACCESS-TIMESTAMP':timestamp},signal:AbortSignal.timeout(10000),redirect:'error'})
  const data=await response.json() as any,page=data.data?.[0]
  if(!response.ok||String(data.code)!=='0'||!Array.isArray(page?.transactions))throw Error('History unavailable')
  for(const row of page.transactions){const hash=String(row.txHash||'').toLowerCase();if(row.chainIndex==='196'&&row.txStatus==='success'&&stocks.has(String(row.tokenContractAddress).toLowerCase())&&/^0x[0-9a-f]{64}$/.test(hash)&&!state.seen[hash]){state.seen[hash]=true;state.pending.push(hash)}}
  const next=String(page.cursor||'');if(next&&next===state.cursor)throw Error('History cursor did not advance')
  state.cursor=next;state.complete=!next
 }
 for(let i=0;i<4&&state.pending.length;i++){
  await recoverStockInvestmentTransaction(owner,wallet,state.pending[0]);state.pending.shift()
 }
 await mutateDurableJson<Record<string,Recovery>>(key,old=>({...old,[scope]:state}))
}
