import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {formatUnits,type Hex} from 'viem'
import {quoteRelayStablecoin} from './xlayer-bridge-provider.js'
import type {EvmBridgeFeeQuote} from './evm-bridge-reimbursement.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

export type XLayerBridgeQuote={id:string;ownerId:string;walletId:string;walletAddress:Hex;destinationAddress:Hex;asset:'USDC';source:'base';destination:'xlayer';amount:string;amountUnits:string;receive:string;minimumReceive:string;minimumUnits:string;fee:string;total:string;networkFeeUnits:string;reimbursementTreasury:Hex;expiresAt:number;callData:Hex;orderId:string;requestId:string;provider:'relay';rail:'xlayer'}
export function xlayerBridgeQuote(route:Awaited<ReturnType<typeof quoteRelayStablecoin>>,priced:EvmBridgeFeeQuote):XLayerBridgeQuote{
 if(route.source!=='base'||route.destination!=='xlayer'||route.asset!=='USDC'||priced.source!==route.source||priced.destination!==route.destination||priced.amountUnits!==route.amountUnits||priced.bridgeDebitUnits!==route.amountUnits||priced.asset!==route.asset)throw Error('Bridge fee binding mismatch.')
 return {id:randomUUID(),ownerId:priced.ownerId,walletId:priced.walletId,walletAddress:priced.walletAddress as Hex,destinationAddress:priced.destinationAddress as Hex,asset:'USDC',source:'base',destination:'xlayer',amount:formatUnits(BigInt(route.amountUnits),6),amountUnits:route.amountUnits,receive:formatUnits(BigInt(route.receiveUnits),6),minimumReceive:formatUnits(BigInt(route.minimumUnits),6),minimumUnits:route.minimumUnits,fee:formatUnits(BigInt(route.amountUnits)-BigInt(route.receiveUnits)+BigInt(priced.networkFeeUnits),6),total:formatUnits(BigInt(priced.totalUnits),6),networkFeeUnits:priced.networkFeeUnits,reimbursementTreasury:EVM_PLATFORM_TREASURY,expiresAt:Math.min(route.expiresAt,priced.expiresAt),callData:priced.callData,orderId:route.orderId,requestId:route.requestId,provider:'relay',rail:'xlayer'}
}
const secret=()=>{const s=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(s.length<32)throw Error('Bridge signing is unavailable.');return s}
export function sealXLayerBridgeQuote(q:XLayerBridgeQuote){const body=Buffer.from(JSON.stringify(q)).toString('base64url');return body+'.'+createHmac('sha256',secret()).update('pocket:xlayer:bridge:v1:'+body).digest('base64url')}
export function openXLayerBridgeQuote(token:string,owner:string):XLayerBridgeQuote{
 if(typeof token!=='string'||token.length>50000)throw Error('Invalid bridge quote.')
 const [body,sig,extra]=token.split('.'),expected=createHmac('sha256',secret()).update('pocket:xlayer:bridge:v1:'+body).digest(),actual=Buffer.from(sig||'','base64url')
 if(extra||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Invalid bridge quote.')
 const q=JSON.parse(Buffer.from(body,'base64url').toString()) as XLayerBridgeQuote
 if(q.ownerId!==owner||q.source!=='base'||q.destination!=='xlayer'||q.asset!=='USDC'||q.rail!=='xlayer')throw Error('Bridge account or route mismatch.')
 return q
}
export const xlayerBridgePreview=({callData,ownerId,...q}:XLayerBridgeQuote)=>q
