import type {PocketActivityRow} from '../models/pocketActivity'
import {isCashConversion} from './pocketCashConversion'
import {formatStockQuantity} from './pocketStockDisplay'

const networks:Record<string,string>={arc:'Arc',ethereum:'Ethereum',base:'Base',arbitrum:'Arbitrum',polygon:'Polygon',solana:'Solana',xlayer:'X Layer'}
const valid=(value:string|undefined)=>!!value&&/^\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))&&Number(value)>0
const quantity=(value:string,symbol:string)=>formatStockQuantity(value)+' '+symbol
/** Exchange notifications use terminal journal truth, never a quote or a source-only confirmation. */
export function pocketExchangeNotification(row:PocketActivityRow){
 const swap=row.source?.replace(/_/g,'-')==='wallet-swap',state=(row.paycrestStatus||'').toLowerCase()
 const failed=['failed','rejected','cancelled','canceled','expired','reverted'].includes(state),refunded=['refunded','reversed'].includes(state)
 if(!['completed',...['failed','rejected','cancelled','canceled','expired','reverted','refunded','reversed']].includes(state)||!row.txHash||!valid(row.amount)||!row.assetSymbol)return null
 const network=networks[row.chain],destination=networks[row.destination||'']
 if(!network||!swap&&!destination)return null
 const paid=quantity(row.amount,row.assetSymbol),kind=swap?'Swap':'Bridge'
 if(isCashConversion(row)){
  const received=(row.contextLabel||'').match(/^\d+(?:\.\d+)? USDT to (\d+(?:\.\d+)?) USDC$/)?.[1]
  if(refunded||!failed&&!valid(received))return null
  const tag='pocket-payment:cash-conversion:'+row.eventId
  return {eventId:tag+':'+(failed?'failed':'completed'),title:failed?'Cash funding failed':'Cash added',body:failed?'Your cash top-up was not completed. Open for details.':quantity(received!,'USD')+' added to your cash balance.',path:'/activity?receipt='+encodeURIComponent(row.eventId),tag,occurredAt:row.statusUpdatedAt||row.ts}
 }
 let title=kind+' successful',body=swap?`Your swap on ${network} completed.`:`${paid} bridged from ${network} to ${destination}.`
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
