import {parseUnits} from 'viem'
import {POCKET_USDT_ASSETS} from './pocketUsdtAssets'
import {xLayerFeeAssets} from './pocketXLayerFeeAssets'
import {POCKET_EURC} from './pocketEurc'

export type RequestNetwork='base'|'arc'|'arbitrum'|'solana'|'ethereum'|'polygon'|'xlayer'
export const REQUEST_NETWORK_LABELS:Record<RequestNetwork,string>={base:'Base',arc:'Arc',xlayer:'X Layer',arbitrum:'Arbitrum',solana:'Solana',ethereum:'Ethereum',polygon:'Polygon'}
const usdc:Record<RequestNetwork,string>={base:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',arc:'0x3600000000000000000000000000000000000000',arbitrum:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',solana:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',ethereum:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',polygon:'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',xlayer:xLayerFeeAssets.USDC.address}
export const REQUEST_ASSETS=['USDC','USDT','ETH','SOL','POL','OKB','USDe','USDG','EURC'] as const
export type RequestAsset=typeof REQUEST_ASSETS[number]
export function requestAsset(network:string,asset:string='USDC'):{symbol:RequestAsset;decimals:number;address:string}|null{
 if(asset==='USDC'&&Object.hasOwn(usdc,network))return{symbol:asset,decimals:6,address:usdc[network as RequestNetwork]}
 if(network==='xlayer'&&Object.hasOwn(xLayerFeeAssets,asset))return{symbol:asset as RequestAsset,...xLayerFeeAssets[asset as keyof typeof xLayerFeeAssets]}
 if(asset==='USDT'&&Object.hasOwn(POCKET_USDT_ASSETS,network))return{symbol:asset,...POCKET_USDT_ASSETS[network as keyof typeof POCKET_USDT_ASSETS]}
 if(asset==='EURC'&&network==='base')return{...POCKET_EURC.base}
 if(asset==='ETH'&&['base','arbitrum','ethereum'].includes(network)||asset==='SOL'&&network==='solana'||asset==='POL'&&network==='polygon'||asset==='OKB'&&network==='xlayer')return{symbol:asset as RequestAsset,decimals:asset==='SOL'?9:18,address:'native'}
 return null
}
export function requestNetworks(asset:string){return(Object.keys(REQUEST_NETWORK_LABELS) as RequestNetwork[]).filter(n=>requestAsset(n,asset))}
export function requestAmountUnits(amount:string,network:string,asset:string='USDC'){
 const token=requestAsset(network,asset)
 if(!token)throw Error('This asset is not supported on this network.')
 if(!new RegExp('^(?:0|[1-9]\\d*)(?:\\.\\d{1,'+token.decimals+'})?$').test(amount)||amount.length>80)throw Error('Enter a valid '+asset+' amount.')
 const units=parseUnits(amount,token.decimals)
 if(units<=0n||units>=2n**256n)throw Error('Enter a valid '+asset+' amount.')
 return units
}
