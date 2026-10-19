import {getAddress,type Address} from 'viem'
import {stockTokenAbi,type StockHolding} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {stockNoticeClient} from './xstocks-notifications-store.js'

// Indexers may report immutable shares for rebasing stocks. The screen and its
// P&L must both value the spendable token balance. Verify only discovered holdings
// in one batch, not the entire catalogue; the caller retains its 24-second cache.
export async function canonicalStockHoldings(owner:Address,holdings:StockHolding[],client=stockNoticeClient){
 if(!holdings.length)return holdings
 const rows=await client.multicall({contracts:holdings.map(h=>({address:getAddress(h.asset.address),abi:stockTokenAbi,functionName:'balanceOf' as const,args:[owner] as const}))})
 if(rows.length!==holdings.length||rows.some(r=>r.status!=='success'))throw Error('Stock balance verification unavailable')
 return holdings.map((h,i)=>({...h,units:rows[i].result as bigint})).filter(h=>h.units>0n)
}
