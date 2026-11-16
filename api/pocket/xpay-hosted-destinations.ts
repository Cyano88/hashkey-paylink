import {createHash} from 'node:crypto'
import {isAddress} from 'viem'
import {isValidSolanaAddress} from '../../src/lib/solanaAddress.js'
import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {readUnifiedXPayStore} from './unified-xpay-store.js'
import {readBscWallet} from './bsc-wallet.js'
import {checkoutStablecoin} from '../../src/lib/checkoutStablecoins.js'
import type {XPayDestination} from '../../src/pocket/lib/pocketUnifiedXPay.js'
export const XPAY_HOSTED_NETWORKS=['xlayer','bsc','base','arbitrum','solana','ethereum','polygon'] as const
export type XPayHostedNetwork=typeof XPAY_HOSTED_NETWORKS[number]
const sameAddress=(network:string,a:string,b:string)=>network==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
export async function xpayReceivingWallet(owner:string,network:XPayHostedNetwork){
 if(network==='xlayer'||network==='bsc')return readBscWallet(owner)
 const link=await readCircleLink(circleLinkKey(owner,network,'payment'))
 if(!link||link.privyUserId!==owner||link.chain!==network||!link.circleWalletId||!(network==='solana'?isValidSolanaAddress(link.circleWalletAddress):isAddress(link.circleWalletAddress)))return null
 return {address:link.circleWalletAddress,id:link.circleWalletId}
}
export type HostedDestination={id:string;terminalId:string;owner:string;network:XPayHostedNetwork;recipient:string;assets:string[];revision:string;name:string}
export const HOSTED_DESTINATIONS_KEY='pocket:xpay-hosted-destinations:v1'
type Store={destinations:Record<string,HostedDestination>}
export const readHostedDestinations=async()=>await readDurableJson<Store>(HOSTED_DESTINATIONS_KEY)||{destinations:{}}
export function xpayHostedEnabled(network:string){return (XPAY_HOSTED_NETWORKS as readonly string[]).includes(network)&&process.env.HASHPAYLINK_XPAY_HOSTED_ENABLED==='true'&&(network==='bsc'?process.env.HASHPAYLINK_BSC_CHECKOUT_ENABLED==='true':network==='xlayer'?process.env.HASHPAYLINK_XSTOCKS_CHECKOUT_ENABLED==='true':true)}
export function hostedDestinationView(d:HostedDestination):XPayDestination{return {id:d.id,name:d.name,kind:'stablecoins',adapter:d.network,currency:'USD',assets:d.assets,networks:[d.network],revision:d.revision}}
export async function listXPayHostedDestinations(owner:string){return Object.values((await readHostedDestinations()).destinations).filter(d=>d.owner===owner).map(hostedDestinationView)}
export async function saveXPayHostedDestination(input:Omit<HostedDestination,'id'|'revision'>){
 if(!(input.network==='solana'?isValidSolanaAddress(input.recipient):isAddress(input.recipient))||!input.assets.length||input.assets.some(a=>!checkoutStablecoin(input.network,a)))throw Error('Invalid receiving configuration.')
 const assets=[...new Set(input.assets)].sort(),revision=createHash('sha256').update(JSON.stringify([input.owner,input.terminalId,input.network,input.network==='solana'?input.recipient:input.recipient.toLowerCase(),assets])).digest('hex')
 const d:HostedDestination={...input,assets,id:'xpd_'+revision.slice(0,32),revision}
 await mutateDurableJson<Store>(HOSTED_DESTINATIONS_KEY,current=>{const s=current||{destinations:{}};s.destinations[d.id]??=d;return s});return hostedDestinationView(d)
}
export const xpayHostedPartner=(terminalId:string,version:number,destinationId:string)=>`xpay:${terminalId}:${version}:${destinationId}`
export function parseXPayHostedPartner(id:string){const m=/^xpay:(xp_[0-9a-f-]{36}):(0|[1-9][0-9]*):(xpd_[0-9a-f]{32})$/.exec(id);return m?{terminalId:m[1],version:Number(m[2]),destinationId:m[3]}:null}
export async function xpayHostedPartnerExists(id:string){const p=parseXPayHostedPartner(id);if(!p)return false;const c=(await readUnifiedXPayStore()).checkouts.find(c=>c.id===p.terminalId);const d=(await readHostedDestinations()).destinations[p.destinationId];return !!c&&!!d&&c.owner===d.owner&&c.id===d.terminalId&&(c.destinationIds.includes(d.id)||!!c.pastDestinations?.some(p=>p.id===d.id))}
export async function assertXPayHostedRoute(partnerId:string,network:XPayHostedNetwork,recipient:string,asset:string){
 const p=parseXPayHostedPartner(partnerId),token=checkoutStablecoin(network,asset)
 if(!p||!token||!xpayHostedEnabled(network))throw Object.assign(Error('This QR payment option is unavailable.'),{status:409})
 const c=(await readUnifiedXPayStore()).checkouts.find(c=>c.id===p.terminalId&&!c.deletedAt),d=(await readHostedDestinations()).destinations[p.destinationId]
 if(!c||!d||c.owner!==d.owner||c.id!==d.terminalId||(c.version||0)!==p.version||d.network!==network||!sameAddress(network,d.recipient,recipient)||!d.assets.includes(token.symbol)||!c.destinationIds.includes(d.id)||c.revisions[c.destinationIds.indexOf(d.id)]!==d.revision||!c.acceptance?.routes.some(r=>r.destinationId===d.id&&r.revision===d.revision&&r.network===network&&r.asset===token.symbol))throw Object.assign(Error('Receiving options changed. Reopen the QR.'),{status:409})
 const wallet=await xpayReceivingWallet(c.owner,network)
 if(!wallet||!sameAddress(network,wallet.address,d.recipient))throw Object.assign(Error('The receiving wallet changed. Ask the merchant to update this QR.'),{status:409})
 return {checkout:c,destination:d,token}
}
