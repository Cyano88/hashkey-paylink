import {formatPocketAssetAmount} from '../lib/pocketAmountDisplay'
import {pocketBridgeOperationAssets,pocketBridgeReceived} from '../lib/pocketBridgeOperation'
import {useEffect,useState} from 'react'
import PocketTransactionSheet from './PocketTransactionSheet'
import {readPocketBridgeTransfers,POCKET_BRIDGES_UPDATED} from '../lib/pocketPendingBridge'
import {readPocketOperations,POCKET_OPERATIONS_UPDATED} from '../lib/pocketOperationRecovery'
import {pocketBridgeNetworkLabel} from '../lib/pocketBridgeNetworks'

export type ActivePocketBridge={owner:string;asset:string;destinationAsset?:string;selectionKey?:string;id:string;rail?:'xlayer'|'bsc'|'cross'}

/** Only the bridge started in this mounted flow opens a sheet. The journal survives dismissal. */
export default function PocketBridgeProgressSheet({active,onDone}:{active:ActivePocketBridge;onDone():void}){
 const [,update]=useState(0)
 useEffect(()=>{
  const refresh=()=>update(n=>n+1)
  window.addEventListener(POCKET_BRIDGES_UPDATED,refresh)
  window.addEventListener(POCKET_OPERATIONS_UPDATED,refresh)
  window.addEventListener('storage',refresh)
  return()=>{window.removeEventListener(POCKET_BRIDGES_UPDATED,refresh);window.removeEventListener(POCKET_OPERATIONS_UPDATED,refresh);window.removeEventListener('storage',refresh)}
 },[])
 let received:string|undefined,destinationAsset=active.destinationAsset||active.asset
 let status='processing',amount='',source='',destination='',txHash='',refundAmount='',refundAsset='',refundNetwork=''
 try{
  if(active.asset==='USDC'&&!active.rail){
   const record=readPocketBridgeTransfers(active.owner,localStorage).find(r=>r.id===active.id)
   if(record){status=record.progress||'processing';amount=record.amount;source=record.source;destination=record.destination;txHash=record.destinationTxHash||record.txHash||''}
  }else{
   const record=readPocketOperations(active.owner).find(r=>r.kind==='bridge'&&r.pending.quote.id===active.id)
   if(record){const assets=pocketBridgeOperationAssets(record.pending.quote);if(assets.source!==active.asset||active.destinationAsset&&assets.destination!==active.destinationAsset||active.selectionKey&&record.pending.quote.selectionKey!==active.selectionKey)throw Error('Bridge route changed.');destinationAsset=assets.destination;received=pocketBridgeReceived(record.pending,record.state);status=record.state;amount=record.pending.quote.amount;source=record.pending.quote.source;destination=record.pending.quote.destination;txHash=record.pending.destinationTxHash||record.pending.txHash||'';refundAmount=record.pending.refundAmount||'';refundAsset=record.pending.refundAsset||'';refundNetwork=record.pending.refundNetwork||''}
  }
 }catch{/* Missing local data must not claim success or failure. Activity retains server recovery. */}
 const state=status==='completed'?'successful':status==='failed'?'failed':status==='refunded'?'reversed':'pending'
 const label=state==='successful'?'Bridge successful':state==='failed'?'Bridge failed':state==='reversed'?'Bridge refunded':status==='arriving'?'Arriving':status==='needs_attention'||status==='needs_review'?'Checking bridge status':'Bridging'
 const rows:Array<[string,string]>=[]
 if(source)rows.push(['From',pocketBridgeNetworkLabel(source as any)])
 if(destination)rows.push(['To',pocketBridgeNetworkLabel(destination as any)])
 if(state==='reversed'&&refundAmount&&refundAsset){rows.push(['Original amount',amount+' '+active.asset],['Refund received',refundAmount+' '+refundAsset]);if(refundNetwork)rows.push(['Refund network',pocketBridgeNetworkLabel(refundNetwork as any)])}
 if(status==='completed'&&received)rows.push(['Paid with',amount+' '+active.asset],['Received',received+' '+destinationAsset])
 if(txHash)rows.push(['Transaction',txHash])
 return <PocketTransactionSheet key={active.owner+':'+active.id} title={active.asset+' bridge'} state={state} statusLabel={label} amount={state==='reversed'&&refundAmount&&refundAsset?refundAmount+' '+refundAsset:status==='completed'&&received?formatPocketAssetAmount(received,destinationAsset)+' '+destinationAsset:amount?formatPocketAssetAmount(amount,active.asset)+' '+active.asset:undefined} detail={state==='pending'?'You can close this sheet. Progress is saved in Activity.':undefined} detailsRows={rows} onDone={onDone}/>
}
