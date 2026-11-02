import {getAddress,isAddress} from 'viem'
import {readBridgeRevenueConfig,bridgeRevenueUnits} from './bridge-revenue-config.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import type {CrossBridgeAsset,CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {RELAY_BSC_CHAINS} from './bsc-bridge-provider.js'
export type RelayBridgeAppFee={recipient:`0x${string}`;bps:number}
const fail=():never=>{throw Error('Bridge platform fee could not be verified.')}
export function validateRelayBridgeAppFee(fee:RelayBridgeAppFee){
 if(!fee||!isAddress(fee.recipient)||/^0x0{40}$/i.test(fee.recipient)||fee.recipient.toLowerCase()===EVM_PLATFORM_TREASURY.toLowerCase()||!Number.isSafeInteger(fee.bps)||fee.bps<1||fee.bps>100)fail()
 return {recipient:getAddress(fee.recipient),bps:fee.bps}
}
/** Read server configuration; never accept a fee recipient or rate from the client. */
export function relayBridgeAppFee(env:NodeJS.ProcessEnv=process.env):RelayBridgeAppFee|null{
 const config=readBridgeRevenueConfig(env)
 if(!config.configurationValid||config.bps===null||!config.evmAddress)fail()
 return config.bps===0?null:validateRelayBridgeAppFee({recipient:config.evmAddress!,bps:config.bps!})
}
export function relayBridgeAppFeeRequest(fee?:RelayBridgeAppFee|null){return fee?[{recipient:validateRelayBridgeAppFee(fee).recipient,fee:String(fee.bps)}]:[]}
/** Relay app fees accrue off-chain. A validated quote is NOT collected-revenue evidence.
 * Recipient is bound to our server request; Relay does not echo it in quote/order data.
 * The legacy source-unit amount is checked alongside the current app impact field,
 * not used as a complete provider-cost breakdown. */
export function validateRelayBridgeAppFeeQuote(q:any,network:CrossBridgeNetwork,token:CrossBridgeAsset,amountUnits:string,fee?:RelayBridgeAppFee|null){
 if(!fee){if(q?.fees?.app?.amount!=='0')fail();return null}
 const policy=validateRelayBridgeAppFee(fee),app=q?.fees?.app,impact=q?.details?.expandedPriceImpact?.app?.usd
 const expected=bridgeRevenueUnits(BigInt(amountUnits),fee.bps)
 if(expected<=0n||app?.amount!==String(expected)||app.currency?.chainId!==RELAY_BSC_CHAINS[network].id||app.currency?.decimals!==token.decimals||typeof app.currency?.address!=='string'||(network==='solana'?app.currency.address!==token.address:app.currency.address.toLowerCase()!==token.address.toLowerCase())||typeof impact!=='string'||!/^-[0-9]+(?:\.[0-9]+)?$/.test(impact)||!/[1-9]/.test(impact))fail()
 return {...policy,collector:'relay' as const,state:'quoted' as const,sourceAsset:token.symbol,sourceAmountUnits:String(expected),recipientBinding:'server_request' as const}
}
