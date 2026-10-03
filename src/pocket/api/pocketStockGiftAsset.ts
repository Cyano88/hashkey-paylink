import {getAddress,parseAbi,type Address,type PublicClient} from 'viem'
import catalogue from '../lib/pocketXStocksCatalog.json'
import type {MultiGiftAsset} from '../features/gifts/pocketMultiGift'
const decimalsAbi=parseAbi(['function decimals() view returns(uint8)'])
/** Token identity comes from Pocket's catalogue, never the request's label. */
export async function readStockGiftAsset(token:string,client:Pick<PublicClient,'getChainId'|'readContract'>):Promise<MultiGiftAsset>{
 const asset=catalogue.assets.find(a=>a.address.toLowerCase()===token.toLowerCase())
 if(!asset)throw Error('Choose a supported stock.')
 if(await client.getChainId()!==196)throw Error('X Layer could not be verified.')
 const decimals=await client.readContract({address:getAddress(asset.address),abi:decimalsAbi,functionName:'decimals'})
 if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('Stock precision could not be verified.')
 return {chainId:196,token:getAddress(asset.address),symbol:asset.symbol,decimals,rail:'xstocks'}
}
export function sameStockGiftAsset(a:MultiGiftAsset,b:MultiGiftAsset){return a.rail==='xstocks'&&b.rail==='xstocks'&&a.chainId===196&&b.chainId===196&&a.token.toLowerCase()===b.token.toLowerCase()&&a.decimals===b.decimals&&a.symbol===b.symbol}
export type StockGiftWalletCall={to:Address;data:`0x${string}`;value:0n}
/** Transaction fees and spendability always come from RPC, never indexed display balances. */
export async function preflightStockGiftCall(owner:Address,call:StockGiftWalletCall,client:Pick<PublicClient,'getChainId'|'estimateGas'|'getGasPrice'|'getBalance'>){
 if(await client.getChainId()!==196||call.value!==0n)throw Error('Invalid stock gift transaction.')
 const gas=await client.estimateGas({account:owner,...call}),price=await client.getGasPrice(),balance=await client.getBalance({address:owner})
 const fee=(gas*price*120n+99n)/100n
 if(balance<fee)throw Error('Add OKB to cover this gift transaction.')
 return {gas,gasPrice:price,maximumFee:fee}
}
