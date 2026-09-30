import { bridgeFromActivityRow } from './pocketBridgeActivity'
import type { PocketActivityRow } from '../models/pocketActivity'
export type PocketPaymentFunding = { source: string; destination: string; amount: string; txHash: string; destinationTxHash?: string; status: string }
export type PocketFundingReference = { kind: 'bills' | 'bank-withdraw' | 'request'; id: string }
export function fundingParentMatches(row: PocketActivityRow, key: string) {
 const split=key.indexOf(':');const kind=key.slice(0,split), id=key.slice(split+1)
 if(kind==='bills')return row.source==='bills' && (row.merchantId===id || row.eventId==='pocket-bill:'+id)
 if(kind==='bank-withdraw')return row.source==='bank-withdraw' && row.providerReference===id
 return kind==='request' && row.source==='request' && row.eventId===id
}
export function groupPocketPaymentFunding(rows: PocketActivityRow[]): PocketActivityRow[] {
 const result=rows.map(row=>({...row})); const hidden=new Set<PocketActivityRow>();const hashes=new Set<string>()
 for(const bridge of result){
  if(!bridge.fundingParent || !bridge.fundingPayment || bridge.source!=='wallet-bridge' || !bridge.txHash)continue
  let parent=result.find(row=>row!==bridge && (fundingParentMatches(row,bridge.fundingParent!) || (row.source===bridge.fundingPayment!.source && row.eventId===bridge.fundingPayment!.eventId)))
  if(!parent){parent={...bridge.fundingPayment,fundingOnly:true,bridge:bridgeFromActivityRow(bridge) || undefined};result.push(parent)}
  const funding: PocketPaymentFunding={source:bridge.chain,destination:bridge.destination||bridge.recipient||'base',amount:bridge.amount,txHash:bridge.txHash,destinationTxHash:bridge.destinationTxHash,status:bridge.paycrestStatus||'processing'}
  parent.paymentFunding=[...(parent.paymentFunding||[]).filter(item=>!(item.source===funding.source&&item.txHash===funding.txHash)),funding]
  hidden.add(bridge);hashes.add(bridge.chain+':'+bridge.txHash.toLowerCase())
  if(bridge.destinationTxHash)hashes.add(funding.destination+':'+bridge.destinationTxHash.toLowerCase())
 }
 return result.filter(row=>!hidden.has(row)&&(!['wallet-deposit','wallet-withdrawal','wallet-bridge'].includes(row.source||'')||!hashes.has(row.chain+':'+row.txHash.toLowerCase())))
}
export function pocketFundingRoute(funding: PocketPaymentFunding[]) {
 const label=(value:string)=>({base:'Base',polygon:'Polygon',arc:'Arc',arbitrum:'Arbitrum',solana:'Solana',ethereum:'Ethereum',xlayer:'X Layer'}[value]||value)
 return [...new Set(funding.map(item=>label(item.source)))].join(' + ')+' \u2192 '+[...new Set(funding.map(item=>label(item.destination)))].join(' + ')
}
