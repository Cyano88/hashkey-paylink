import {crossBridgeAsset,type CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import type {CrossBridgeFeePolicy,CrossBridgePrice} from './cross-bridge-reimbursement.js'
import {POCKET_NATIVE_FEE_ALLOWANCE_BPS,POCKET_CIRCLE_GAS_STATION_FEE_BPS} from './native-fee-policy.js'
/** Explicit USD fee limits; convert to the input token using its verified price.
 * Never reuse a six-decimal stablecoin limit as native or 18-decimal units. */
export function crossBridgeConfiguredPolicy(network:CrossBridgeNetwork,asset:string,price:CrossBridgePrice,env:NodeJS.ProcessEnv=process.env):CrossBridgeFeePolicy{
 const integer=(name:string)=>{const value=env[name];if(typeof value!=='string'||! /^(0|[1-9]\d{0,12})$/.test(value))throw Error('Bridge fee policy is not configured.');return BigInt(value)}
 if(price.scaled8<=0n)throw Error('Bridge fee price is unavailable.')
 const sponsored=network==='bsc'||network==='xlayer',scale=10n**BigInt(crossBridgeAsset(network,asset).decimals),min=integer('POCKET_CROSS_BRIDGE_MIN_FEE_USD_MICROS'),max=integer(network==='polygon'&&env.POCKET_CROSS_BRIDGE_POLYGON_MAX_FEE_USD_MICROS!==undefined?'POCKET_CROSS_BRIDGE_POLYGON_MAX_FEE_USD_MICROS':'POCKET_CROSS_BRIDGE_MAX_FEE_USD_MICROS')
 const units=(usd:bigint,ceil:boolean)=>(usd*100n*scale+(ceil?price.scaled8-1n:0n))/price.scaled8
 const mode=env.POCKET_XLAYER_FEE_POLICY||'provider_terms'
 if(sponsored&&!['observed_cost','provider_terms'].includes(mode))throw Error('Bridge fee policy is unavailable.')
 // Circle EVM bridges need the same reviewed gas reserve as native swaps.
 // Requiring an unbuffered estimate to stay identical across review, PIN and
 // two preflights otherwise turns ordinary gas movement into a reprice loop.
 // Sponsored billing keeps its configured policy; Solana rent is unchanged.
 return {providerBps:sponsored?(mode==='provider_terms'?Number(integer('POCKET_XLAYER_PROVIDER_FEE_BPS')):0):network==='solana'?0:POCKET_CIRCLE_GAS_STATION_FEE_BPS,providerAllowanceUsdMicros:sponsored?integer(mode==='observed_cost'?'POCKET_XLAYER_OBSERVED_COST_USD_MICROS':'POCKET_XLAYER_PROVIDER_FIXED_USD_MICROS'):0n,marginBps:sponsored?Number(integer('POCKET_XLAYER_FEE_MARGIN_BPS')):network==='solana'?0:POCKET_NATIVE_FEE_ALLOWANCE_BPS,minimumFeeUnits:units(min,true),maximumFeeUnits:units(max,false)}
}
