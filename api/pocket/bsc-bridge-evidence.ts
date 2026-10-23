import {decodeEventLog, parseAbi, type Hex} from 'viem'
import {RELAY_BSC_CHAINS, bscBridgeTokenAddress, type BscRelayInput, type BscRelayRefund} from './bsc-bridge-provider.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

type Network = BscRelayInput['source']
type Asset = BscRelayInput['asset']
export type BscBridgeBinding = BscRelayInput & {
  orderId:string; requestId:string; minimumUnits:string
  depositAsset?:'USDC'; depositUnits?:string
  // Populate only from the verified, owner-bound fee quote, never provider status.
  networkFeeUnits?:string; reimbursementTreasury?:string
  // Only the plan validated from the order and bound into an owner-signed quote.
  // Never populate this from a status response or untrusted request body.
  refundOptions?:BscRelayRefund[]
}
const transfer = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const deposit = parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)'])
const same = (network:Network,a:unknown,b:string) => typeof a==='string' && (network==='solana' ? a===b : a.toLowerCase()===b.toLowerCase())
const hashValid = (network:Network,h:unknown):h is string => typeof h==='string' && (network==='solana' ? /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(h) : /^0x[0-9a-fA-F]{64}$/.test(h))
const decimals=(network:Network)=>network==='bsc'?18:6
const rescale=(value:string,from:Network,to:Network)=>BigInt(value)*10n**BigInt(decimals(to))/10n**BigInt(decimals(from))
const units = (v:unknown):v is string => typeof v==='string' && /^(0|[1-9]\d{0,77})$/.test(v)

/** Caller must fetch this receipt from the pinned chain and verify its canonical block. */
export function evmStablecoinDelta(receipt:any,network:Exclude<Network,'solana'>,asset:Asset,owner:string,hash:string):bigint|null {
  if(!hashValid(network,hash)||receipt?.status!=='success'||!same(network,receipt.transactionHash,hash)||!Array.isArray(receipt.logs))return null
  const token=bscBridgeTokenAddress(network,asset)
  let total=0n
  for(const log of receipt.logs){
    if(!same(network,log.address,token))continue
    if(log.removed)return null
    try {
      const {args}=decodeEventLog({abi:transfer,eventName:'Transfer',data:log.data as Hex,topics:log.topics as [Hex,...Hex[]]})
      total+=(same(network,args.to,owner)?args.value:0n)-(same(network,args.from,owner)?args.value:0n)
    }catch{/* Approvals and other token events do not prove a transfer. */}
  }
  return total
}

/** Exact deposit event and exact net source debit, not a balance refresh. */
export function bscBridgeSourceProven(q:BscBridgeBinding,receipt:any,hash:string):boolean {
  if(q.source==='solana'||(q.source!=='bsc'&&q.destination!=='bsc')||!units(q.amountUnits)||BigInt(q.amountUnits)<=0n||!hashValid(q.source,q.orderId))return false
  const converted=q.depositAsset!==undefined||q.depositUnits!==undefined
  if(converted&&(q.source!=='xlayer'||q.destination!=='base'||q.asset!=='USDT'||q.depositAsset!=='USDC'||!units(q.depositUnits)||BigInt(q.depositUnits)<=0n||BigInt(q.depositUnits)>BigInt(q.amountUnits)))return false
  if(converted){const delta=evmStablecoinDelta(receipt,'xlayer','USDC',q.sender,hash);if(delta===null||delta<0n)return false}
  const hasFee=q.networkFeeUnits!==undefined||q.reimbursementTreasury!==undefined
  if(hasFee&&(!units(q.networkFeeUnits)||BigInt(q.networkFeeUnits)<=0n||!same(q.source,q.reimbursementTreasury,EVM_PLATFORM_TREASURY)||same(q.source,q.sender,EVM_PLATFORM_TREASURY)))return false
  const fee=hasFee?BigInt(q.networkFeeUnits!):0n
  if(evmStablecoinDelta(receipt,q.source,q.asset,q.sender,hash)!==-(BigInt(q.amountUnits)+fee))return false
  if(hasFee){
    // A matching total debit alone could hide a fee paid to the wrong address.
    const fees=receipt.logs.flatMap((log:any)=>{
      if(log.removed||!same(q.source,log.address,bscBridgeTokenAddress(q.source,q.asset)))return []
      try{
        const {args}=decodeEventLog({abi:transfer,eventName:'Transfer',data:log.data as Hex,topics:log.topics as [Hex,...Hex[]]})
        return same(q.source,args.from,q.sender)&&same(q.source,args.to,EVM_PLATFORM_TREASURY)?[args.value]:[]
      }catch{return []}
    })
    if(fees.length!==1||fees[0]!==fee)return false
  }
  const matches=receipt.logs.filter((log:any)=>{
    if(log.removed||!same(q.source,log.address,RELAY_BSC_CHAINS[q.source].depository))return false
    try {
      const {args}=decodeEventLog({abi:deposit,eventName:'RelayErc20Deposit',data:log.data as Hex,topics:log.topics as [Hex,...Hex[]]})
      return same(q.source,args.from,q.sender)&&same(q.source,args.token,bscBridgeTokenAddress(q.source,q.depositAsset||q.asset))&&args.amount===BigInt(q.depositUnits||q.amountUnits)&&same(q.source,args.id,q.orderId)
    }catch{return false}
  })
  return matches.length===1
}

/** Solana amounts are integer base units; no UI amount or rounded balance evidence. */
export function solanaStablecoinDelta(tx:any,asset:Asset,owner:string,hash:string):bigint|null {
  if(!hashValid('solana',hash)||!tx?.meta||tx.meta.err!==null||tx.transaction?.signatures?.[0]!==hash||!Array.isArray(tx.meta.preTokenBalances)||!Array.isArray(tx.meta.postTokenBalances))return null
  const sum=(rows:any[])=>{
    let total=0n;const seen=new Set<number>()
    for(const row of rows){
      if(row.owner!==owner||row.mint!==bscBridgeTokenAddress('solana',asset))continue
      if(!Number.isSafeInteger(row.accountIndex)||row.accountIndex<0||seen.has(row.accountIndex)||row.uiTokenAmount?.decimals!==6||!units(row.uiTokenAmount?.amount))throw Error('Invalid token evidence')
      seen.add(row.accountIndex);total+=BigInt(row.uiTokenAmount.amount)
    }
    return total
  }
  try{return sum(tx.meta.postTokenBalances)-sum(tx.meta.preTokenBalances)}catch{return null}
}

type DeliveryCheck = {status:'pending'|'needs_attention'} | {
  status:'verify_delivery'; outcome:'completed'|'refunded'; network:Network;
  recipient:string; asset:Asset; hash:string; exactUnits:string|null; minimumUnits:string; maximumUnits:string
}
/** Provider success is only a candidate for onchain verification, never terminal success. */
export function bscBridgeDeliveryCandidate(q:BscBridgeBinding,sourceHash:string,status:any,requests:any):DeliveryCheck {
  const attention:DeliveryCheck={status:'needs_attention'}
  if(!hashValid(q.source,sourceHash)||!hashValid('xlayer',q.orderId)||!hashValid('xlayer',q.requestId)||!units(q.amountUnits)||!units(q.minimumUnits)||BigInt(q.minimumUnits)<=0n||BigInt(q.minimumUnits)>rescale(q.amountUnits,q.source,q.destination))return attention
  if(!['success','refund','failure'].includes(status?.status))return {status:'pending'}
  if(status.status==='failure')return attention
  if(status.originChainId!==RELAY_BSC_CHAINS[q.source].id||!Array.isArray(status.inTxHashes)||!status.inTxHashes.some((h:unknown)=>same(q.source,h,sourceHash)))return attention
  if(!Array.isArray(requests?.requests)||requests.requests.length!==1)return {status:'pending'}
  const request=requests.requests[0]
  if(!same('xlayer',request.id,q.requestId)||!same('xlayer',request.protocol?.orderId,q.orderId)||request.protocol?.hubType!=='onchain'||request.status!==status.status||!same(q.source,request.user,q.sender)||!same(q.destination,request.recipient,q.recipient)||!Array.isArray(request.data?.inTxs)||!request.data.inTxs.some((t:any)=>same(q.source,t.txHash,sourceHash)&&t.chainId===RELAY_BSC_CHAINS[q.source].id&&t.status==='success'))return attention
  let network=q.destination,recipient=q.recipient,asset=q.asset,exactUnits:string|null=null
  if(status.status==='refund'){
    const refund=request.data.refundCurrencyData
    if(refund?.currency?.chainId===RELAY_BSC_CHAINS[q.source].id){network=q.source;recipient=q.sender}
    else if(refund?.currency?.chainId!==RELAY_BSC_CHAINS[q.destination].id)return attention
    if(q.refundOptions!==undefined){
      // Fail closed on malformed, duplicate, wrong-wallet or broadened plans.
      const plan=q.refundOptions
      if(!Array.isArray(plan)||plan.length!==2||new Set(plan.map(r=>r?.network)).size!==2)return attention
      for(const r of plan){
        const origin=r?.network===q.source
        if(!r||!origin&&r.network!==q.destination||!same(r.network,r.recipient,origin?q.sender:q.recipient))return attention
        const alternate=q.asset==='USDT'&&r.asset==='USDC'&&(q.source==='base'&&q.destination==='xlayer'&&!origin||q.source==='xlayer'&&q.destination==='base'&&origin&&q.depositAsset==='USDC'&&units(q.depositUnits)&&BigInt(q.depositUnits)>0n&&BigInt(q.depositUnits)<=BigInt(q.amountUnits))
        if(r.asset!==q.asset&&!alternate)return attention
      }
      const selected=plan.find(r=>r.network===network)
      if(!selected)return attention
      asset=selected.asset
    }
    if(!same(network,refund.currency.address,bscBridgeTokenAddress(network,asset))||refund.currency.decimals!==decimals(network)||!units(refund.amount)||BigInt(refund.amount)<=0n||BigInt(refund.amount)>rescale(q.amountUnits,q.source,network))return attention
    exactUnits=refund.amount
  }else if(status.destinationChainId!==RELAY_BSC_CHAINS[q.destination].id)return attention
  if(!Array.isArray(request.data.outTxs)||!Array.isArray(status.txHashes))return {status:'pending'}
  const outputs=request.data.outTxs.filter((t:any)=>t.status==='success'&&t.chainId===RELAY_BSC_CHAINS[network].id&&status.txHashes.some((h:unknown)=>same(network,h,t.txHash)))
  if(outputs.length!==1||!hashValid(network,outputs[0].txHash))return attention
  return {status:'verify_delivery',outcome:status.status==='refund'?'refunded':'completed',network,recipient,asset,hash:outputs[0].txHash,exactUnits,minimumUnits:q.minimumUnits,maximumUnits:String(rescale(q.amountUnits,q.source,network))}
}

export function bscBridgeDeliveryProven(candidate:DeliveryCheck,netReceived:bigint|null):boolean {
  return candidate.status==='verify_delivery'&&netReceived!==null&&netReceived>0n&&netReceived<=BigInt(candidate.maximumUnits)&&(candidate.exactUnits!==null?netReceived===BigInt(candidate.exactUnits):netReceived>=BigInt(candidate.minimumUnits))
}
