import type {PocketActivityRow} from '../models/pocketActivity'
import {isCashConversion,isCashFunding} from './pocketCashConversion'
import {formatStockQuantity} from './pocketStockDisplay'

const networks:Record<string,string>={arc:'Arc',ethereum:'Ethereum',base:'Base',arbitrum:'Arbitrum',polygon:'Polygon',solana:'Solana',xlayer:'X Layer',bsc:'BNB Chain',celo:'Celo'}
const valid=(value:string|undefined)=>!!value&&/^\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))&&Number(value)>0
const cashBody='Your cash balance was topped up.'
const quantity=(value:string,symbol:string)=>formatStockQuantity(value)+' '+symbol
/** Exchange notifications use terminal journal truth, never a quote or a source-only confirmation. */
export function pocketExchangeNotification(row:PocketActivityRow){
 const swap=row.source?.replace(/_/g,'-')==='wallet-swap',state=(row.paycrestStatus||'').toLowerCase()
 const failed=['failed','rejected','cancelled','canceled','expired','reverted'].includes(state),refunded=['refunded','reversed'].includes(state)
 if(!['completed',...['failed','rejected','cancelled','canceled','expired','reverted','refunded','reversed']].includes(state)||!row.txHash||!valid(row.amount)||!row.assetSymbol)return null
 const network=networks[row.chain],destination=networks[row.destination||'']
 if(!network||!swap&&!destination)return null
 const paid=quantity(row.amount,row.assetSymbol),kind=swap?'Swap':'Bridge'
 // Recovery rows precede the canonical receipt and must not emit a second notification.
 if((swap||row.cashFunding)&&row.eventId.startsWith('operation:'))return null
 // A same-network top-up uses the swap rail but credits the settled USDC output to Cash.
 if(swap&&row.cashFunding&&row.chain==='base'&&row.destination==='Cash balance'&&row.eventId.startsWith('pocket-native-swap:')){
  const completed=!failed&&!refunded
  if(completed&&(row.destinationAsset!=='USDC'||!valid(row.receivedAmount)))return null
  const tag='pocket-payment:wallet-swap:'+row.eventId
  return {eventId:tag+':'+(refunded?'refunded':failed?'failed':'completed'),tag,
   title:completed?'Cash added':refunded?'Cash funding refunded':'Cash funding failed',
   ...(completed?{cashCredit:row.receivedAmount!}:{}),
   body:completed?cashBody:refunded?'Your cash top-up was refunded. Open for details.':'Your cash top-up was not completed. Open for details.',
   path:'/activity?receipt='+encodeURIComponent(row.eventId),occurredAt:row.statusUpdatedAt||row.ts}
 }
 if(isCashFunding(row)||row.cashFunding&&row.destination==='base'){
  // A USDT bridge is only the first leg. Cash success belongs to the final USDC conversion.
  if(!swap&&row.cashFunding&&row.assetSymbol==='USDT'&&row.destinationAsset!=='USDC'&&!failed&&!refunded)return null
  const received=row.cashReceivedAmount??(row.destinationAsset==='USDC'?row.receivedAmount:undefined)??(isCashConversion(row)?(row.contextLabel||'').match(/^\d+(?:\.\d+)? (?:USDT|EURC) to (\d+(?:\.\d+)?) USDC$/)?.[1]:undefined)
  if(!failed&&!refunded&&!valid(received))return null
  const tag='pocket-payment:'+(isCashConversion(row)?'cash-conversion':'wallet-bridge')+':'+row.eventId
  return {eventId:tag+':'+(refunded?'refunded':failed?'failed':'completed'),title:refunded?'Cash funding refunded':failed?'Cash funding failed':'Cash added',...(!refunded&&!failed?{cashCredit:received!}:{}),body:refunded?'Your cash top-up was refunded. Open for details.':failed?'Your cash top-up was not completed. Open for details.':cashBody,path:'/activity?receipt='+encodeURIComponent(row.eventId),tag,occurredAt:row.statusUpdatedAt||row.ts}
 }
 let title=kind+' successful',body=swap?`Your swap on ${network} completed.`:`${paid} bridged from ${network} to ${destination}.`
 if(!swap&&!failed&&!refunded&&row.destinationAsset){
  if(!valid(row.receivedAmount)||!row.destinationTxHash)return null
  body=`${paid} bridged from ${network} to ${quantity(row.receivedAmount!,row.destinationAsset)} on ${destination}.`
 }
 if(swap&&!failed&&!refunded){
  const legs=(row.contextLabel||'').match(/^(\d+(?:\.\d+)?) ([A-Za-z0-9]+) (?:to|\u2192) (\d+(?:\.\d+)?) ([A-Za-z0-9]+)$/)
  if(legs&&Number(legs[1])===Number(row.amount)&&legs[2]===row.assetSymbol&&valid(legs[3]))body=`${paid} swapped for ${quantity(legs[3],legs[4])} on ${network}.`
 }
 if(failed){title=kind+' failed';body=`Your ${paid} ${kind.toLowerCase()} on ${network} was not completed. Open for details.`}
 if(refunded){title=kind+' refunded';body=`Your ${paid} ${kind.toLowerCase()} was refunded. Open for details.`
  if(!swap&&valid(row.refundAmount)&&row.refundAsset&&networks[row.refundNetwork||''])body=`${quantity(row.refundAmount!,row.refundAsset)} returned to your ${networks[row.refundNetwork!]} wallet from your ${row.assetSymbol} bridge.`
 }
 const status=refunded?'refunded':failed?'failed':'completed',tag='pocket-payment:'+(swap?'wallet-swap':'wallet-bridge')+':'+row.eventId
 return {eventId:tag+':'+status,title,body,path:'/activity?receipt='+encodeURIComponent(row.eventId),tag,occurredAt:row.statusUpdatedAt||row.ts}
}
