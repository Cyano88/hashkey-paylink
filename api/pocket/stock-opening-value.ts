import {formatUnits,parseAbi,parseUnits,type Address} from 'viem'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {stockNoticeClient as client,stockNoticeAsset,readStockNotices} from './xstocks-notifications-store.js'
import {readStockMarketPrices} from './xstocks-prices.js'
import {investmentScope} from './stock-investment-ledger.js'
import type {StockOpening} from './stock-share-basis.js'
import {stockAssets} from '../../src/pocket/lib/pocketXStocksWallet.js'
export type OpeningValue=StockOpening&{blockNumber:string;blockHash:string;units:string;priceUsd:string;priceAt:number;createdAt:number;reason:'existing-test-holding'}
type Store=Record<string,Record<string,OpeningValue>>
const key='pocket:stock-opening-values:v1'
export async function readStockOpenings(owner:string,wallet:string){return (await readDurableJson<Store>(key))?.[investmentScope(owner,wallet)]||{}}

// Operator-only helper, intentionally not exposed as a public route or automatic
// fallback. Apply only after the owner explicitly chooses an opening valuation.
// An existing baseline is immutable: retries cannot restart their performance.
export async function establishStockOpening(owner:string,token:string){
 token=token.toLowerCase()
 if(!stockAssets.some(a=>a.address.toLowerCase()===token))throw Error('Unsupported stock')
 const s=await readStockNotices(),wallet=s.wallets[owner]?.address as Address
 if(!wallet)throw Error('Stock wallet unavailable')
 const existing=(await readStockOpenings(owner,wallet))[token];if(existing)return existing
 if(await client.getChainId()!==196)throw Error('Wrong stock chain')
 const head=await client.getBlockNumber(),block=await client.getBlock({blockNumber:head-12n})
 const at=Number(block.timestamp)*1000
 if(!block.hash||Date.now()-at>60000)throw Error('Stock snapshot is stale')
 const asset=await stockNoticeAsset(token)
 const abi=parseAbi(['function sharesOf(address) view returns(uint256)','function balanceOf(address) view returns(uint256)'])
 const [shares,units,prices]=await Promise.all([
  client.readContract({address:token as Address,abi,functionName:'sharesOf',args:[wallet],blockNumber:block.number}),
  client.readContract({address:token as Address,abi,functionName:'balanceOf',args:[wallet],blockNumber:block.number}),
  readStockMarketPrices([token],fetch,30000),
 ])
 const price=prices[token];if(!price||shares<=0n||units<=0n)throw Error('Opening value could not be verified')
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Stock snapshot changed')
 const cost=units*parseUnits(price.usd.toFixed(18),18)/10n**BigInt(asset.decimals)
 if(cost<=0n)throw Error('Invalid opening value')
 const opening:OpeningValue={at,quantity:formatUnits(shares,asset.decimals),costUsd:formatUnits(cost,18),shares:true,blockNumber:String(block.number),blockHash:block.hash,units:String(units),priceUsd:String(price.usd),priceAt:price.fetchedAt,createdAt:Date.now(),reason:'existing-test-holding'}
 const scope=investmentScope(owner,wallet)
 const saved=await mutateDurableJson<Store>(key,old=>{const next=old||{};next[scope]||={};next[scope][token]||=opening;return next})
 return saved[scope][token]
}
