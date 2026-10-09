import type {Request,Response} from 'express'
import {createPublicClient,decodeEventLog,getAddress,http,parseAbi,type Hex} from 'viem'
import {base,arbitrum,mainnet,polygon} from 'viem/chains'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {createCircleGasStationEvmChallenge,readCircleEvmChallenge} from '../circle-solana-email.js'
import {evmActivity} from './wallet-chain-activity.js'
import {appendPocketMoneyLedgerEvent} from './money-ledger.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {bridgeError,openUsdtBridgeQuote,quoteUsdtBridge,sameAddress,sealUsdtBridgeQuote,USDT_BRIDGE_ROUTER,USDT_TRANSFER_ABI,usdtBridgeNetwork,type UsdtBridgeQuote,type UsdtBridgeNetwork} from './usdt-bridge-provider.js'

const ACTION='wallet.usdt-bridge'
const chains={base,arbitrum,ethereum:mainnet,polygon}
const BALANCE=parseAbi(['function balanceOf(address owner) view returns(uint256)'])
const client=(network:UsdtBridgeNetwork)=>createPublicClient({chain:chains[network],transport:http(process.env['PRIVATE_RPC_URL_'+network.toUpperCase()]||undefined,{timeout:15000})})
const preview=(q:UsdtBridgeQuote)=>{const {callData,ownerId,...value}=q;return value}
const metadata=(q:UsdtBridgeQuote,quoteToken:string)=>({quoteToken,assetSymbol:'USDT',source:q.source,destination:q.destination,amount:q.amount,walletAddress:q.walletAddress,destinationAddress:q.destinationAddress,provider:'across'})

export default async function usdtBridgeHandler(req:Request,res:Response){
  res.setHeader('Cache-Control','no-store')
  try {
    if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
    const identity=await verifiedPrivyUser(req)
    if(req.method==='GET'){
      const records=await listCirclePocketActions(identity.userId,500,ACTION,true)
      const pending=records.filter(r=>['started','submitted'].includes(r.status)&&r.metadata?.quoteToken).map(r=>{
        const q=openUsdtBridgeQuote(r.metadata!.quoteToken,identity.userId,true)
        return {quote:preview(q),quoteToken:r.metadata!.quoteToken,challengeId:r.metadata?.challengeId,txHash:r.metadata?.txHash}
      })
      return res.json({ok:true,pending})
    }
    const action=req.body?.action
    if(action==='quote'){
      const source=usdtBridgeNetwork(req.body.source),destination=usdtBridgeNetwork(req.body.destination)
      const [from,to]=await Promise.all([source,destination].map(n=>readCircleLink(circleLinkKey(identity.userId,n,'payment'))))
      if(!from||!to)bridgeError('Open both Pocket wallets before bridging.',409)
      const q=await quoteUsdtBridge({ownerId:identity.userId,walletId:from.circleWalletId,walletAddress:getAddress(from.circleWalletAddress),destinationAddress:getAddress(to.circleWalletAddress),source,destination,amount:String(req.body.amount||'')})
      const balance=await client(source).readContract({address:getAddress(POCKET_USDT_ASSETS[source].address),abi:BALANCE,functionName:'balanceOf',args:[q.walletAddress]})
      return res.json({ok:true,quote:preview(q),quoteToken:sealUsdtBridgeQuote(q),sufficientBalance:balance>=BigInt(q.amountUnits)})
    }
    if(action!=='execute'&&action!=='status')bridgeError('Unsupported bridge action.')
    const quoteToken=String(req.body.quoteToken||''),q=openUsdtBridgeQuote(quoteToken,identity.userId,true)
    const journalKey='pocket:usdt-bridge:'+q.id
    const existing=await findCirclePocketAction(identity.userId,journalKey,ACTION)
    const meta:Record<string,string>={...metadata(q,quoteToken),...(existing?.metadata||{})}
    if(action==='execute'){
      const [from,to]=await Promise.all([q.source,q.destination].map(n=>readCircleLink(circleLinkKey(identity.userId,n,'payment'))))
      if(!from||!to||from.circleWalletId!==q.walletId||!sameAddress(from.circleWalletAddress,q.walletAddress)||!sameAddress(to.circleWalletAddress,q.destinationAddress))bridgeError('Linked wallets changed. Review a new bridge quote.',409)
      if(existing?.metadata?.challengeId)return res.json({ok:true,challengeId:existing.metadata.challengeId})
      if(existing)bridgeError('This bridge already has an unresolved submission. Check its status before retrying.',409)
      if(q.expiresAt<=Date.now())bridgeError('Quote expired. Review a new quote.',409)
      const userToken=String(req.body.circleUserToken||'')
      if(!userToken||userToken.length>8000)bridgeError('Reconnect your Circle wallet.')
      const rpc=client(q.source)
      const balance=await rpc.readContract({address:getAddress(POCKET_USDT_ASSETS[q.source].address),abi:BALANCE,functionName:'balanceOf',args:[q.walletAddress]})
      if(balance<BigInt(q.amountUnits))bridgeError('Insufficient USDT on the source network.',409)
      await rpc.call({account:q.walletAddress,to:q.walletAddress,data:q.callData})
      if(q.expiresAt<=Date.now())bridgeError('Quote expired. Review a new quote.',409)
      const claim=await claimCirclePocketAction({ownerId:identity.userId,idempotencyKey:journalKey,action:ACTION,metadata:meta,dedupe:{metadataKey:'walletAddress',metadataValue:q.walletAddress,statuses:['started','submitted']}})
      if(!claim.claimed)bridgeError('An earlier USDT bridge is still pending. Check its status first.',409)
      const result=await createCircleGasStationEvmChallenge({userToken,walletId:q.walletId,walletAddress:q.walletAddress,chain:q.source,callData:q.callData,idempotencyKey:q.id,refId:journalKey})
      if(!result.challengeId)bridgeError('The bridge submission result is unknown. Check its status before retrying.',503)
      await recordCirclePocketAction({ownerId:identity.userId,idempotencyKey:journalKey,action:ACTION,status:'submitted',resourceId:q.id,metadata:{...meta,challengeId:result.challengeId}})
      return res.json({ok:true,challengeId:result.challengeId})
    }
    return res.json(await reconcileUsdtBridge(identity.userId,quoteToken,{txHash:req.body.txHash,circleUserToken:req.body.circleUserToken}))
  }catch(reason){const error=reason as Error&{status?:number};return res.status(error.status||503).json({ok:false,error:error.status?error.message:'USDT bridge is temporarily unavailable. Your pending transfer remains saved.'})}
}

// Shared by the authenticated status route and background reconciliation.
const recoveryDefaults={findAction:findCirclePocketAction,recordAction:recordCirclePocketAction,appendLedger:appendPocketMoneyLedgerEvent,readChallenge:readCircleEvmChallenge,readActivity:evmActivity,client,fetch:globalThis.fetch}
export async function reconcileUsdtBridge(ownerId:string,quoteToken:string,input:{txHash?:string;circleUserToken?:string}={},overrides:Partial<typeof recoveryDefaults>={}){
  const deps={...recoveryDefaults,...overrides}
  const q=openUsdtBridgeQuote(quoteToken,ownerId,true),journalKey='pocket:usdt-bridge:'+q.id
  const existing=await deps.findAction(ownerId,journalKey,ACTION)
  const meta:Record<string,string>={...metadata(q,quoteToken),...(existing?.metadata||{})}
    if(!existing)return {ok:true,status:'not_submitted'}
    if(existing.status==='completed'){
      await deps.appendLedger({eventKey:'usdt-bridge:'+q.id+':completed',ownerId,executionId:existing.id,rail:'wallet_bridge',state:'completed',asset:'USDT',amount:q.amount,sourceNetwork:q.source,settlementNetwork:q.destination,resourceId:q.id,transactionHash:meta.txHash,metadata:{destinationTxHash:meta.destinationTxHash,provider:'across'},recordedAt:existing.updatedAt})
      return {ok:true,status:'completed',txHash:meta.txHash,destinationTxHash:meta.destinationTxHash}
    }
    if(existing.status==='failed')return {ok:true,status:'failed'}
    let txHash=meta.txHash||''
    if(!txHash&&meta.challengeId&&input.circleUserToken){
      const result=await deps.readChallenge({chain:q.source,userToken:String(input.circleUserToken),walletId:q.walletId,walletAddress:q.walletAddress,challengeId:meta.challengeId}).catch(()=>({status:'pending' as const,txHash:undefined}))
      if(result.status==='failed'){
        await deps.recordAction({ownerId:ownerId,idempotencyKey:journalKey,action:ACTION,status:'failed',resourceId:q.id,metadata:meta})
        return {ok:true,status:'failed'}
      }
      txHash=result.txHash||''
    }
    txHash=txHash||String(input.txHash||'')
    if(!txHash){
      const rows=await deps.readActivity(q.source,q.walletAddress,AbortSignal.timeout(8000)).catch(()=>[])
      const hashes=[...new Set(rows.filter(r=>r.assetSymbol==='USDT'&&r.direction==='out'&&r.ts>=q.expiresAt-120000).map(r=>r.txHash))].slice(0,8)
      for(const hash of hashes){
        const receipt=await deps.client(q.source).getTransactionReceipt({hash:hash as Hex}).catch(()=>null)
        if(receipt?.logs.some(log=>{if(!sameAddress(log.address,USDT_BRIDGE_ROUTER))return false;try{const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;return event.eventName==='LiFiTransferStarted'&&event.args.bridgeData.transactionId===q.transactionId}catch{return false}})){txHash=hash;break}
      }
    }
    if(!/^0x[0-9a-f]{64}$/i.test(txHash))return {ok:true,status:'pending',challengeId:meta.challengeId}
    const receipt=await deps.client(q.source).getTransactionReceipt({hash:txHash as Hex}).catch(()=>null)
    if(!receipt)return {ok:true,status:'pending',challengeId:meta.challengeId}
    const debited=receipt.logs.reduce((sum,log)=>{
      if(!sameAddress(log.address,POCKET_USDT_ASSETS[q.source].address))return sum
      try{const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;if(event.eventName!=='Transfer')return sum;return sum+(sameAddress(event.args.from,q.walletAddress)?event.args.value:0n)-(sameAddress(event.args.to,q.walletAddress)?event.args.value:0n)}catch{return sum}
    },0n)
    const started=receipt.status==='success'&&debited===BigInt(q.amountUnits)&&receipt.logs.some(log=>{
      if(!sameAddress(log.address,USDT_BRIDGE_ROUTER))return false
      try {const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;return event.eventName==='LiFiTransferStarted'&&event.args.bridgeData.transactionId===q.transactionId&&sameAddress(event.args.bridgeData.receiver,q.destinationAddress)&&sameAddress(event.args.bridgeData.sendingAssetId,POCKET_USDT_ASSETS[q.source].address)&&event.args.bridgeData.destinationChainId===BigInt(POCKET_USDT_ASSETS[q.destination].chainId)}catch{return false}
    })
    if(!started)return {ok:true,status:'needs_attention'}
    await deps.recordAction({ownerId:ownerId,idempotencyKey:journalKey,action:ACTION,status:'submitted',resourceId:q.id,metadata:{...meta,txHash,sourceConfirmed:'true'}})
    const query=new URLSearchParams({txHash,fromChain:String(POCKET_USDT_ASSETS[q.source].chainId),toChain:String(POCKET_USDT_ASSETS[q.destination].chainId),bridge:'across'})
    const response=await deps.fetch('https://li.quest/v1/status?'+query,{signal:AbortSignal.timeout(15000)})
    if(!response.ok)return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const delivery=await response.json() as any
    if(delivery.status==='FAILED'||delivery.substatus==='PARTIAL'||delivery.substatus==='REFUNDED')return {ok:true,status:'needs_attention',txHash}
    if(delivery.status!=='DONE'||delivery.substatus!=='COMPLETED'||!sameAddress(delivery.sending?.txHash,txHash)||Number(delivery.receiving?.chainId)!==POCKET_USDT_ASSETS[q.destination].chainId)return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const destinationTxHash=String(delivery.receiving?.txHash||'')
    if(!/^0x[0-9a-f]{64}$/i.test(destinationTxHash))return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const destinationReceipt=await deps.client(q.destination).getTransactionReceipt({hash:destinationTxHash as Hex}).catch(()=>null)
    const received=destinationReceipt?.status==='success'?destinationReceipt.logs.reduce((sum,log)=>{
      if(!sameAddress(log.address,POCKET_USDT_ASSETS[q.destination].address))return sum
      try{const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;if(event.eventName!=='Transfer')return sum;return sum+(sameAddress(event.args.to,q.destinationAddress)?event.args.value:0n)-(sameAddress(event.args.from,q.destinationAddress)?event.args.value:0n)}catch{return sum}
    },0n):0n
    if(received<BigInt(q.minimumUnits))return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const completed=await deps.recordAction({ownerId:ownerId,idempotencyKey:journalKey,action:ACTION,status:'completed',resourceId:q.id,metadata:{...meta,txHash,destinationTxHash,sourceConfirmed:'true',paymentState:'completed'}})
    await deps.appendLedger({eventKey:'usdt-bridge:'+q.id+':completed',ownerId:ownerId,executionId:completed.id,rail:'wallet_bridge',state:'completed',asset:'USDT',amount:q.amount,sourceNetwork:q.source,settlementNetwork:q.destination,resourceId:q.id,transactionHash:txHash,metadata:{destinationTxHash,provider:'across'},recordedAt:completed.updatedAt})
    return {ok:true,status:'completed',txHash,destinationTxHash}
}
