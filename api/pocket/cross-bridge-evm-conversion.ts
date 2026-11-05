import {formatUnits} from 'viem'
import {prepareNativeEvmSwapRoute,validateNativeEvmSwap,nativeSwapCalls,type NativeEvmSwapQuote} from './native-evm-swap-quote.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import type {CrossBridgeInput} from './cross-bridge-provider.js'
import type {CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
export const needsNativeBridgeConversion=(input:Pick<CrossBridgeInput,'source'|'destination'|'from'|'to'>)=>input.source==='polygon'&&input.from==='POL'||['ethereum','base','arbitrum'].includes(input.source)&&input.destination==='arc'&&input.from==='ETH'&&input.to==='EURC'
export function validateNativeBridgeConversion(swap:NativeEvmSwapQuote,input:CrossBridgeInput,now:number){
 const q=validateNativeEvmSwap(swap,false,now)
 if(!needsNativeBridgeConversion(input)||q.version!==1||q.network!==input.source||q.from!==input.from||q.to!=='USDC'||q.walletAddress.toLowerCase()!==input.sender.toLowerCase()||q.amountUnits!==input.amountUnits)throw Error('Native conversion does not match this bridge review.')
 return {calls:nativeSwapCalls(q).slice(0,-1),minimumUnits:q.minimumOutUnits,expiresAt:q.expiresAt,spendRecipient:q.tx.to,bridgeToken:crossBridgeAsset(input.source,'USDC')}
}
export async function quoteNativeBridgeConversion(input:CrossBridgeInput,wallets:CrossBridgeWalletBinding){
 if(!needsNativeBridgeConversion(input)||wallets.source.provider!=='circle'||wallets.source.address.toLowerCase()!==input.sender.toLowerCase())throw Error('Invalid conversion wallet.')
 const q=await prepareNativeEvmSwapRoute({ownerId:wallets.ownerId,walletId:wallets.source.walletId,walletAddress:input.sender as `0x${string}`,network:input.source as 'ethereum'|'base'|'arbitrum'|'polygon',from:input.from,to:'USDC',amount:formatUnits(BigInt(input.amountUnits),18)})
 validateNativeBridgeConversion(q,input,Date.now());return q
}
