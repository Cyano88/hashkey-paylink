import type {Request,Response} from 'express'
import {lifiRevenueProven,lifiRevenueMetadata} from './lifi-revenue-evidence.js'
import {quoteEvmSolanaUsdt,solanaUsdtDestinationEnabled,relayUsdtDepositMatches,readEvmSolanaUsdtDelivery} from './evm-solana-usdt-bridge.js'
import solanaUsdtBridgeHandler,{listPendingSolanaUsdtBridges,solanaUsdtBridgeEnabled,recoverSolanaUsdtBridge} from './solana-usdt-bridge-api.js'
import {createPublicClient,decodeEventLog,formatUnits,parseUnits,getAddress,http,parseAbi,type Hex} from 'viem'
import {base,arbitrum,mainnet,polygon} from 'viem/chains'
import {verifiedPrivyUser,circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {claimCirclePocketAction,findCirclePocketAction,listCirclePocketActions,recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import {createCircleGasStationEvmChallenge,readCircleEvmChallenge,quoteCircleEvmBatchRecovery} from '../circle-solana-email.js'
import {evmActivity} from './wallet-chain-activity.js'
import {appendPocketMoneyLedgerEvent} from './money-ledger.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {bridgeError,openUsdtBridgeQuote,quoteUsdtBridge,sameAddress,sealUsdtBridgeQuote,USDT_BRIDGE_ROUTER,USDT_TRANSFER_ABI,usdtBridgeNetwork,type UsdtBridgeQuote,type UsdtBridgeNetwork} from './usdt-bridge-provider.js'

import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

const ACTION='wallet.usdt-bridge'
const chains={base,arbitrum,ethereum:mainnet,polygon}
const BALANCE=parseAbi(['function balanceOf(address owner) view returns(uint256)'])
const client=(network:UsdtBridgeNetwork)=>createPublicClient({chain:chains[network],transport:http(process.env['PRIVATE_RPC_URL_'+network.toUpperCase()]||undefined,{timeout:15000})})
const preview=(q:UsdtBridgeQuote)=>{const {callData,ownerId,...value}=q;return value}
const metadata=(q:UsdtBridgeQuote,quoteToken:string)=>({...lifiRevenueMetadata(q.revenue,q.networkFeeUnits),intentFingerprint:[q.walletAddress.toLowerCase(),q.source,q.destination,q.amountUnits].join(':'),quoteToken,assetSymbol:'USDT',source:q.source,destination:q.destination,amount:q.amount,walletAddress:q.walletAddress,destinationAddress:q.destinationAddress,provider:q.provider})

export default async function usdtBridgeHandler(req:Request,res:Response){
  if(req.method==='POST'&&(req.body?.source==='solana'||String(req.body?.quoteToken||'').startsWith('solana:')))return solanaUsdtBridgeHandler(req,res)
  res.setHeader('Cache-Control','no-store')
  try {
    if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed.'})
    const identity=await verifiedPrivyUser(req)
    if(req.method==='GET'){
      const records=await listCirclePocketActions(identity.userId,500,ACTION,true)
      const pending=records.filter(r=>['started','submitted'].includes(r.status)&&r.metadata?.quoteToken&&!r.metadata.quoteToken.startsWith('solana:')).map(r=>{
        const q=openUsdtBridgeQuote(r.metadata!.quoteToken,identity.userId,true)
        return {quote:preview(q),quoteToken:r.metadata!.quoteToken,challengeId:r.metadata?.challengeId,txHash:r.metadata?.txHash}
      })
      return res.json({ok:true,pending:[...await listPendingSolanaUsdtBridges(identity.userId),...pending],solanaSourceEnabled:solanaUsdtBridgeEnabled(),solanaDestinationEnabled:solanaUsdtDestinationEnabled()})
    }
    const action=req.body?.action
    if(action==='quote'){
      const source=usdtBridgeNetwork(req.body.source),destination=req.body.destination==='solana'?'solana':usdtBridgeNetwork(req.body.destination)
      if(destination==='solana'&&(!solanaUsdtDestinationEnabled()||source!=='arbitrum'))bridgeError('This Solana bridge route is not available yet.',409)
      const [from,to]=await Promise.all([source,destination].map(n=>readCircleLink(circleLinkKey(identity.userId,n,'payment'))))
      if(!from||!to)bridgeError('Open both Pocket wallets before bridging.',409)
      const binding={ownerId:identity.userId,walletId:from.circleWalletId,walletAddress:getAddress(from.circleWalletAddress),source,amount:String(req.body.amount||'')}
      const q=destination==='solana'?await quoteEvmSolanaUsdt({...binding,destinationAddress:to.circleWalletAddress}):await quoteUsdtBridge({...binding,destination,destinationAddress:getAddress(to.circleWalletAddress)})
      const priced=await quoteCircleEvmBatchRecovery({ownerId:identity.userId,walletId:q.walletId,walletAddress:q.walletAddress,source,destination,destinationAddress:q.destinationAddress,asset:'USDT',tokenAddress:getAddress(POCKET_USDT_ASSETS[source].address),amountUnits:q.amountUnits,bridgeDebitUnits:q.amountUnits,bridgeCallData:q.callData,providerExpiresAt:q.expiresAt,userToken:String(req.body.circleUserToken||'')})
      q.callData=priced.callData;q.networkFeeUnits=priced.networkFeeUnits;q.totalUnits=priced.totalUnits;q.total=formatUnits(BigInt(priced.totalUnits),6);q.reimbursementTreasury=EVM_PLATFORM_TREASURY;q.expiresAt=priced.expiresAt
      q.fee=formatUnits(BigInt(priced.networkFeeUnits)+parseUnits(q.fee,6),6)
      const balance=await client(source).readContract({address:getAddress(POCKET_USDT_ASSETS[source].address),abi:BALANCE,functionName:'balanceOf',args:[q.walletAddress]})
      return res.json({ok:true,quote:preview(q),quoteToken:sealUsdtBridgeQuote(q),sufficientBalance:balance>=BigInt(q.totalUnits!)})
    }
    if(action!=='execute'&&action!=='status'&&action!=='resume')bridgeError('Unsupported bridge action.')
    const quoteToken=String(req.body.quoteToken||''),q=openUsdtBridgeQuote(quoteToken,identity.userId,true)
    const journalKey='pocket:usdt-bridge:'+q.id
    const existing=await findCirclePocketAction(identity.userId,journalKey,ACTION)
    const meta:Record<string,string>={...metadata(q,quoteToken),...(existing?.metadata||{})}
    if(action==='resume'){
      const state=await reconcileUsdtBridge(identity.userId,quoteToken,{circleUserToken:req.body.circleUserToken})
      if(state.status!=='awaiting_approval')return res.json(state)
      // Reopen only the existing challenge; never create another transaction.
      // Simulate the saved batch again so expired provider routes cannot be approved.
      try{await client(q.source).call({account:q.walletAddress,to:q.walletAddress,data:q.callData})}
      catch{bridgeError('This saved bridge cannot be approved now. Your transfer remains saved for review.',409)}
      return res.json(state)
    }
    if(action==='execute'){
      const [from,to]=await Promise.all([q.source,q.destination].map(n=>readCircleLink(circleLinkKey(identity.userId,n,'payment'))))
      if(!from||!to||from.circleWalletId!==q.walletId||!sameAddress(from.circleWalletAddress,q.walletAddress)||(q.destination==='solana'?to.circleWalletAddress!==q.destinationAddress:!sameAddress(to.circleWalletAddress,q.destinationAddress)))bridgeError('Linked wallets changed. Review a new bridge quote.',409)
      if(existing?.metadata?.challengeId)return res.json({ok:true,challengeId:existing.metadata.challengeId})
      if(existing)bridgeError('This bridge already has an unresolved submission. Check its status before retrying.',409)
      if(q.expiresAt<=Date.now())bridgeError('Quote expired. Review a new quote.',409)
      if(!q.totalUnits||q.networkFeeUnits===undefined||!q.reimbursementTreasury)bridgeError('Review a new bridge quote.',409)
      const userToken=String(req.body.circleUserToken||'')
      if(!userToken||userToken.length>8000)bridgeError('Reconnect your Circle wallet.')
      const rpc=client(q.source)
      const balance=await rpc.readContract({address:getAddress(POCKET_USDT_ASSETS[q.source].address),abi:BALANCE,functionName:'balanceOf',args:[q.walletAddress]})
      if(balance<BigInt(q.totalUnits!))bridgeError('Insufficient USDT on the source network.',409)
      await rpc.call({account:q.walletAddress,to:q.walletAddress,data:q.callData})
      if(q.expiresAt<=Date.now())bridgeError('Quote expired. Review a new quote.',409)
      const previous=await listCirclePocketActions(identity.userId,500,ACTION,true)
      if(previous.some(r=>r.idempotencyKey!==journalKey&&['started','submitted'].includes(r.status)&&r.metadata?.walletAddress?.toLowerCase()===q.walletAddress.toLowerCase()&&r.metadata.source===q.source&&r.metadata.destination===q.destination&&r.metadata.amount&&parseUnits(r.metadata.amount,6)===BigInt(q.amountUnits)))bridgeError('This transfer is already being tracked in Activity.',409)
      const claim=await claimCirclePocketAction({ownerId:identity.userId,idempotencyKey:journalKey,action:ACTION,metadata:meta,dedupe:{metadataKey:'intentFingerprint',metadataValue:meta.intentFingerprint,statuses:['started','submitted']}})
      if(!claim.claimed)bridgeError('An earlier USDT bridge is still pending. Check its status first.',409)
      const result=await createCircleGasStationEvmChallenge({userToken,walletId:q.walletId,walletAddress:q.walletAddress,chain:q.source,callData:q.callData,idempotencyKey:q.id,refId:journalKey})
      if(!result.challengeId)bridgeError('The bridge submission result is unknown. Check its status before retrying.',503)
      await recordCirclePocketAction({ownerId:identity.userId,idempotencyKey:journalKey,action:ACTION,status:'submitted',resourceId:q.id,metadata:{...meta,challengeId:result.challengeId}})
      return res.json({ok:true,challengeId:result.challengeId})
    }
    return res.json(await reconcileUsdtBridge(identity.userId,quoteToken,{txHash:req.body.txHash,circleUserToken:req.body.circleUserToken,retireUnsubmitted:req.body.retireUnsubmitted===true}))
  }catch(reason){const error=reason as Error&{status?:number;maximumAmountUnits?:string};console.error('[pocket-usdt-bridge]',{action:req.body?.action||req.method,reason:error.message});return res.status(error.status||503).json({ok:false,...(req.body?.action==='quote'&&error.maximumAmountUnits?{maximumAmountUnits:error.maximumAmountUnits}:{}),error:error.status?error.message:req.body?.action==='quote'?'Could not refresh the bridge quote. Try again.':'USDT bridge is temporarily unavailable. Your pending transfer remains saved.'})}
}

// Shared by the authenticated status route and background reconciliation.
const recoveryDefaults={claimAction:claimCirclePocketAction,findAction:findCirclePocketAction,recordAction:recordCirclePocketAction,appendLedger:appendPocketMoneyLedgerEvent,readChallenge:readCircleEvmChallenge,readActivity:evmActivity,client,fetch:globalThis.fetch,relayDelivery:readEvmSolanaUsdtDelivery}
export async function reconcileUsdtBridge(ownerId:string,quoteToken:string,input:{txHash?:string;circleUserToken?:string;retireUnsubmitted?:boolean}={},overrides:Partial<typeof recoveryDefaults>={}){
  if(quoteToken.startsWith('solana:'))return recoverSolanaUsdtBridge(ownerId,quoteToken.slice(7))
  const deps={...recoveryDefaults,...overrides}
  const q=openUsdtBridgeQuote(quoteToken,ownerId,true),journalKey='pocket:usdt-bridge:'+q.id
  const existing=await deps.findAction(ownerId,journalKey,ACTION)
  const meta:Record<string,string>={...metadata(q,quoteToken),...(existing?.metadata||{})}
    if(!existing){
      if(!input.retireUnsubmitted||q.expiresAt>Date.now())return {ok:true,status:'not_submitted'}
      // Reserve the same key atomically before retiring an expired unsigned draft.
      // A delayed execute can no longer create a provider challenge after this wins.
      const claim=await deps.claimAction({ownerId,idempotencyKey:journalKey,action:ACTION,metadata:meta})
      if(!claim.claimed)return reconcileUsdtBridge(ownerId,quoteToken,{...input,retireUnsubmitted:false},overrides)
      await deps.recordAction({ownerId,idempotencyKey:journalKey,action:ACTION,status:'failed',resourceId:q.id,metadata:{...meta,paymentState:'not_submitted'}})
      return {ok:true,status:'not_submitted',reason:'approval_expired'}
    }
    if(existing.status==='completed'){
      await deps.appendLedger({eventKey:'usdt-bridge:'+q.id+':completed',ownerId,executionId:existing.id,rail:'wallet_bridge',state:'completed',asset:'USDT',amount:q.amount,sourceNetwork:q.source,settlementNetwork:q.destination,resourceId:q.id,transactionHash:meta.txHash,metadata:{...lifiRevenueMetadata(q.revenue,q.networkFeeUnits),destinationTxHash:meta.destinationTxHash,provider:q.provider,...(meta.settledAmountUnits?{settledAmountUnits:meta.settledAmountUnits,settledAmount:formatUnits(BigInt(meta.settledAmountUnits),6)}:{})},recordedAt:existing.updatedAt})
      return {ok:true,status:'completed',txHash:meta.txHash,destinationTxHash:meta.destinationTxHash,...(meta.settledAmountUnits?{amountOut:formatUnits(BigInt(meta.settledAmountUnits),6),settlement:{network:q.destination,transactionHash:meta.destinationTxHash,amountUnits:meta.settledAmountUnits}}:{})}
    }
    if(existing.status==='failed'){
      if(meta.paymentState==='not_submitted')return {ok:true,status:'not_submitted',reason:'approval_expired'}
      if(meta.paymentState==='refunded'){
        await deps.appendLedger({eventKey:'usdt-bridge:'+q.id+':refunded',ownerId,executionId:existing.id,rail:'wallet_bridge',state:'refunded',asset:'USDT',amount:q.amount,sourceNetwork:q.source,settlementNetwork:meta.refundNetwork,resourceId:q.id,transactionHash:meta.txHash,metadata:{...lifiRevenueMetadata(q.revenue,q.networkFeeUnits),refundTxHash:meta.refundTxHash,refundAmount:meta.refundAmount,provider:q.provider},recordedAt:existing.updatedAt})
        return {ok:true,status:'refunded',txHash:meta.txHash,destinationTxHash:meta.refundTxHash,settlement:{network:meta.refundNetwork,transactionHash:meta.refundTxHash,amountUnits:meta.refundAmountUnits}}
      }
      return {ok:true,status:'failed'}
    }
    let txHash=meta.txHash||''
    let awaitingApproval=false
    let statusUnavailable=false
    if(!txHash&&meta.challengeId&&input.circleUserToken){
      const result=await deps.readChallenge({chain:q.source,userToken:String(input.circleUserToken),walletId:q.walletId,walletAddress:q.walletAddress,challengeId:meta.challengeId}).catch(()=>{statusUnavailable=true;return {status:'pending' as const,txHash:undefined}})
      if(result.status==='failed'){
        const notSubmitted='notSubmitted' in result&&result.notSubmitted===true
        await deps.recordAction({ownerId:ownerId,idempotencyKey:journalKey,action:ACTION,status:'failed',resourceId:q.id,metadata:{...meta,...(notSubmitted?{paymentState:'not_submitted'}:{})}})
        return notSubmitted?{ok:true,status:'not_submitted',reason:'approval_expired'}:{ok:true,status:'failed'}
      }
      txHash=result.txHash||''
      awaitingApproval=result.status==='awaiting_approval'
    }
    txHash=txHash||String(input.txHash||'')
    if(!txHash){
      const rows=await deps.readActivity(q.source,q.walletAddress,AbortSignal.timeout(8000)).catch(()=>[])
      const hashes=[...new Set(rows.filter(r=>r.assetSymbol==='USDT'&&r.direction==='out'&&r.ts>=q.expiresAt-120000).map(r=>r.txHash))].slice(0,8)
      for(const hash of hashes){
        const receipt=await deps.client(q.source).getTransactionReceipt({hash:hash as Hex}).catch(()=>null)
        if(receipt&&(q.provider==='relay'?relayUsdtDepositMatches(q,receipt.logs):receipt.logs.some(log=>{if(!sameAddress(log.address,USDT_BRIDGE_ROUTER))return false;try{const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;return event.eventName==='LiFiTransferStarted'&&event.args.bridgeData.transactionId===q.transactionId}catch{return false}}))){txHash=hash;break}
      }
    }
    if(!/^0x[0-9a-f]{64}$/i.test(txHash))return {ok:true,status:awaitingApproval?'awaiting_approval':'pending',challengeId:meta.challengeId,...(!input.circleUserToken&&meta.challengeId?{requiresWalletSession:true}:{}),...(statusUnavailable?{statusUnavailable:true}:{})}
    const receipt=await deps.client(q.source).getTransactionReceipt({hash:txHash as Hex}).catch(()=>null)
    if(!receipt)return {ok:true,status:'pending',challengeId:meta.challengeId}
    const debited=receipt.logs.reduce((sum,log)=>{
      if(!sameAddress(log.address,POCKET_USDT_ASSETS[q.source].address))return sum
      try{const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;if(event.eventName!=='Transfer')return sum;return sum+(sameAddress(event.args.from,q.walletAddress)?BigInt(event.args.value):0n)-(sameAddress(event.args.to,q.walletAddress)?BigInt(event.args.value):0n)}catch{return sum}
    },0n)
    const reimbursed=receipt.logs.reduce((sum,log)=>{
      if(!sameAddress(log.address,POCKET_USDT_ASSETS[q.source].address)||!q.reimbursementTreasury)return sum
      try{const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;return event.eventName==='Transfer'&&sameAddress(event.args.from,q.walletAddress)&&sameAddress(event.args.to,q.reimbursementTreasury)?sum+BigInt(event.args.value):sum}catch{return sum}
    },0n)
    const started=receipt.status==='success'&&reimbursed===BigInt(q.networkFeeUnits||'0')&&debited===BigInt(q.totalUnits||q.amountUnits)&&(q.provider==='relay'?relayUsdtDepositMatches(q,receipt.logs):receipt.logs.some(log=>{
      if(q.destination==='solana'||!sameAddress(log.address,USDT_BRIDGE_ROUTER))return false
      try {const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;return event.eventName==='LiFiTransferStarted'&&event.args.bridgeData.transactionId===q.transactionId&&sameAddress(event.args.bridgeData.receiver,q.destinationAddress)&&sameAddress(event.args.bridgeData.sendingAssetId,POCKET_USDT_ASSETS[q.source].address)&&event.args.bridgeData.destinationChainId===BigInt(POCKET_USDT_ASSETS[q.destination].chainId)}catch{return false}
    }))
    if(!started||!lifiRevenueProven(q.revenue,POCKET_USDT_ASSETS[q.source].address,receipt,txHash))return {ok:true,status:'needs_attention'}
    if(q.revenue){
      const sourceRpc=deps.client(q.source)
      if(await sourceRpc.getChainId()!==POCKET_USDT_ASSETS[q.source].chainId)return {ok:true,status:'needs_attention',txHash}
      const canonical=await sourceRpc.getBlock({blockNumber:receipt.blockNumber})
      if(!sameAddress(canonical.hash,receipt.blockHash))return {ok:true,status:'pending',txHash}
    }
    await deps.recordAction({ownerId:ownerId,idempotencyKey:journalKey,action:ACTION,status:'submitted',resourceId:q.id,metadata:{...meta,txHash,sourceConfirmed:'true'}})
    if(q.provider==='relay'){
      const rpc=deps.client(q.source)
      if(await rpc.getChainId()!==POCKET_USDT_ASSETS[q.source].chainId)return {ok:true,status:'needs_attention',txHash}
      const block=await rpc.getBlock({blockNumber:receipt.blockNumber})
      if(!sameAddress(block.hash,receipt.blockHash))return {ok:true,status:'pending',txHash,sourceConfirmed:true}
      const delivery=await deps.relayDelivery(q,txHash)
      if(!('settlement' in delivery))return {ok:true,...delivery,txHash,sourceConfirmed:true}
      const settlement=delivery.settlement,refunded=delivery.status==='refunded'
      await deps.recordAction({ownerId,idempotencyKey:journalKey,action:ACTION,status:refunded?'failed':'completed',resourceId:q.id,metadata:{...meta,txHash,sourceConfirmed:'true',destinationTxHash:settlement.transactionHash,paymentState:delivery.status,...(refunded?{refundNetwork:settlement.network,refundTxHash:settlement.transactionHash,refundAmount:formatUnits(BigInt(settlement.amountUnits),6),refundAmountUnits:settlement.amountUnits}:{settledAmountUnits:settlement.amountUnits})}})
      // Terminal reads retry the journal-to-ledger write gap without another payment.
      return reconcileUsdtBridge(ownerId,quoteToken,input,overrides)
    }
    if(q.destination==='solana')return {ok:true,status:'needs_attention',txHash}
    const query=new URLSearchParams({txHash,fromChain:String(POCKET_USDT_ASSETS[q.source].chainId),toChain:String(POCKET_USDT_ASSETS[q.destination].chainId),bridge:'across'})
    const response=await deps.fetch('https://li.quest/v1/status?'+query,{signal:AbortSignal.timeout(15000)})
    if(!response.ok)return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const delivery=await response.json() as any
    if(delivery.status==='FAILED'||delivery.substatus==='PARTIAL'||delivery.substatus==='REFUNDED')return {ok:true,status:'needs_attention',txHash}
    if(delivery.status!=='DONE'||delivery.substatus!=='COMPLETED'||!sameAddress(delivery.sending?.txHash,txHash)||Number(delivery.receiving?.chainId)!==POCKET_USDT_ASSETS[q.destination].chainId)return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const destinationTxHash=String(delivery.receiving?.txHash||'')
    if(!/^0x[0-9a-f]{64}$/i.test(destinationTxHash))return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const destinationReceipt=await deps.client(q.destination).getTransactionReceipt({hash:destinationTxHash as Hex}).catch(()=>null)
    if(!destinationReceipt||!sameAddress(destinationReceipt.transactionHash,destinationTxHash)||destinationReceipt.logs.some(log=>log.removed))return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const destinationRpc=deps.client(q.destination)
    if(await destinationRpc.getChainId()!==POCKET_USDT_ASSETS[q.destination].chainId)return {ok:true,status:'needs_attention',txHash,sourceConfirmed:true}
    const destinationBlock=await destinationRpc.getBlock({blockNumber:destinationReceipt.blockNumber})
    if(!sameAddress(destinationBlock.hash,destinationReceipt.blockHash))return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const received=destinationReceipt?.status==='success'?destinationReceipt.logs.reduce((sum,log)=>{
      if(!sameAddress(log.address,POCKET_USDT_ASSETS[q.destination].address))return sum
      try{const event=decodeEventLog({abi:USDT_TRANSFER_ABI,data:log.data,topics:log.topics}) as any;if(event.eventName!=='Transfer')return sum;return sum+(sameAddress(event.args.to,q.destinationAddress)?BigInt(event.args.value):0n)-(sameAddress(event.args.from,q.destinationAddress)?BigInt(event.args.value):0n)}catch{return sum}
    },0n):0n
    if(received<BigInt(q.minimumUnits))return {ok:true,status:'pending',txHash,sourceConfirmed:true}
    const completed=await deps.recordAction({ownerId:ownerId,idempotencyKey:journalKey,action:ACTION,status:'completed',resourceId:q.id,metadata:{...meta,txHash,destinationTxHash,sourceConfirmed:'true',paymentState:'completed',settledAmountUnits:String(received)}})
    await deps.appendLedger({eventKey:'usdt-bridge:'+q.id+':completed',ownerId:ownerId,executionId:completed.id,rail:'wallet_bridge',state:'completed',asset:'USDT',amount:q.amount,sourceNetwork:q.source,settlementNetwork:q.destination,resourceId:q.id,transactionHash:txHash,metadata:{...lifiRevenueMetadata(q.revenue,q.networkFeeUnits),destinationTxHash,provider:'across',settledAmountUnits:String(received),settledAmount:formatUnits(received,6)},recordedAt:completed.updatedAt})
    return {ok:true,status:'completed',txHash,destinationTxHash,amountOut:formatUnits(received,6),settlement:{network:q.destination,transactionHash:destinationTxHash,amountUnits:String(received)}}
}
