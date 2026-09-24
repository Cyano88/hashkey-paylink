import { type Address } from 'viem'
import { pocketApiUrl } from '../lib/pocketRoutes'
import { stockAssets, type StockBalanceSnapshot } from '../lib/pocketXStocksWallet'
export async function readRemoteStockBalances(getAccessToken:()=>Promise<string|null>,address:Address,signal?:AbortSignal,force=false):Promise<StockBalanceSnapshot>{
 const token=await getAccessToken();if(!token)throw Error('Sign in again.')
 const response=await fetch(pocketApiUrl('/api/pocket/xstocks/balances'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({wallet:address,force}),signal,cache:'no-store'}),body=await response.json(),s=body.snapshot
 if(!response.ok||!body.ok||!s||s.complete!==true||!Array.isArray(s.holdings)||!Number.isFinite(s.observedAt)||Date.now()-s.observedAt>=60000||s.observedAt>Date.now()+5000||!/^0x[0-9a-f]{64}$/i.test(s.blockHash))throw Error('Fresh stock balances unavailable.')
 const integer=(v:unknown)=>{if(typeof v!=='string'||!/^\d+$/.test(v))throw Error('Invalid stock balance.');return BigInt(v)}
 return {...s,cash:integer(s.cash),gas:integer(s.gas),blockNumber:integer(s.blockNumber),holdings:s.holdings.map((h:any)=>{const asset=stockAssets.find(a=>a.address.toLowerCase()===h.asset?.address?.toLowerCase());if(!asset||!Number.isInteger(h.decimals)||h.decimals<0||h.decimals>36)throw Error('Invalid stock holding.');return {asset,units:integer(h.units),decimals:h.decimals}})}
}
