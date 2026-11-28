import {decodeEventLog,parseAbi,type Hex} from 'viem'
import {readSponsoredBridgeSource} from './bridge-sponsored-source.js'
import type {openCrossBridgeReview} from './cross-bridge-review.js'
import {RELAY_BSC_CHAINS} from './cross-bridge-chains.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const lifiStarted=parseAbi(['event LiFiTransferStarted((bytes32 transactionId,string bridge,string integrator,address referrer,address sendingAssetId,address receiver,uint256 minAmount,uint256 destinationChainId,bool hasSourceSwaps,bool hasDestinationCall) bridgeData)'])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const pending=():never=>{throw Object.assign(Error('Bridge source debit is still being verified.'),{status:409})}
export async function readCrossBridgePrivySource(review:Review,hash:Hex,userOperationHash?:Hex,options:NonNullable<Parameters<typeof readSponsoredBridgeSource>[3]>&{onWalletGasPaid?:(units:string)=>Promise<void>}={}){
 const {quote:q,route,charged}=review,source=route.source
 if(!['bsc','xlayer','celo'].includes(source)||q.wallets.source.provider!=='privy'||charged.plan.kind!=='evm')return pending()
 const privySource=source as 'bsc'|'xlayer'|'celo'
 const {receipt,outcome,paidGasUnits}=await readSponsoredBridgeSource(privySource,hash,{owner:q.wallets.source.address,callData:charged.plan.callData,userOperationHash,walletGas:!!q.walletGasUnits},options)
 if(outcome==='failed')return 'failed' as const
 if(route.provider==='lifi'){
  if(source!=='celo'||route.lifi.tool!=='squid'||route.tokenIn.symbol!=='cNGN'||route.lifi.transactionId!==route.orderId||route.lifi.bridgeTokenAddress.toLowerCase()!=='0xeb466342c4d449bc9f53a865d5cb90586f405215')return pending()
  const movements:Array<{from:string;to:string;value:bigint}>=[]
  for(const log of receipt.logs){
   if(log.removed)pending()
   if(same(log.address,route.tokenIn.address)){
    try{const e=decodeEventLog({abi:transfer,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});if(same(e.args.from,q.input.sender)||same(e.args.to,q.input.sender))movements.push(e.args)}catch{/* Ignore unrelated ERC20 logs. */}
   }
  }
  const reimbursement=movements.filter(m=>same(m.from,q.input.sender)&&same(m.to,q.reimbursementRecipient)&&m.value===BigInt(q.reimbursementUnits))
  if(reimbursement.length!==(q.walletGasUnits?0:1))return pending()
  const remaining=movements.filter(m=>m!==reimbursement[0]),debit=remaining.reduce((sum,m)=>sum+(same(m.from,q.input.sender)?m.value:0n)-(same(m.to,q.input.sender)?m.value:0n),0n)
  if(debit!==BigInt(route.amountUnits))return pending()
  const matches=receipt.logs.filter((log:any)=>{
   if(log.removed||!same(log.address,'0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'))return false
   try{const {args}=decodeEventLog({abi:lifiStarted,eventName:'LiFiTransferStarted',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});const b=args.bridgeData;return same(b.transactionId,route.lifi.transactionId)&&b.bridge==='squid'&&same(b.sendingAssetId,route.lifi.bridgeTokenAddress)&&same(b.receiver,q.input.recipient)&&b.minAmount===BigInt(route.lifi.bridgeMinimumUnits)&&b.destinationChainId===8453n&&b.hasSourceSwaps&&!b.hasDestinationCall}catch{return false}
  })
  if(matches.length!==1)return pending()
  if(paidGasUnits)await options.onWalletGasPaid?.(String(BigInt(paidGasUnits)+BigInt(route.lifi.nativeValueUnits)))
  return 'confirmed' as const
 }
 // Successful exact atomic Kernel batch proves native call values. ERC20 calls
 // additionally require deposit and fee movements; false-return transfers fail.
 if(!route.tokenIn.native){
  const movements:Array<{from:string;to:string;value:bigint}>=[]
  for(const log of receipt.logs){
   if(log.removed)pending()
   if(!same(log.address,route.tokenIn.address))continue
   let e;try{e=decodeEventLog({abi:transfer,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true})}catch{continue}
   if(same(e.args.from,q.input.sender)||same(e.args.to,q.input.sender))movements.push(e.args)
  }
  if(route.conversion){
   if(!q.walletGasUnits){
    const feeIndex=movements.findIndex(m=>same(m.from,q.input.sender)&&same(m.to,q.reimbursementRecipient)&&m.value===BigInt(q.reimbursementUnits))
    if(feeIndex<0)pending();movements.splice(feeIndex,1)
   }
   const debit=movements.reduce((sum,m)=>sum+(same(m.from,q.input.sender)?m.value:0n)-(same(m.to,q.input.sender)?m.value:0n),0n)
   if(debit!==BigInt(route.amountUnits))pending()
  }else{
  const expected=[{to:RELAY_BSC_CHAINS[privySource].depository,value:BigInt(route.amountUnits)},...(q.walletGasUnits?[]:[{to:q.reimbursementRecipient,value:BigInt(q.reimbursementUnits)}])]
  if(movements.length!==expected.length)pending()
  for(const item of expected){const index=movements.findIndex(m=>same(m.from,q.input.sender)&&same(m.to,item.to)&&m.value===item.value);if(index<0)pending();movements.splice(index,1)}
  }
 }
 if(route.conversion){
  const deposits=receipt.logs.flatMap(log=>{if(log.removed)pending();if(!same(log.address,route.conversion!.bridgeToken.address))return [];try{return [decodeEventLog({abi:transfer,eventName:'Transfer',topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true}).args]}catch{return []}}).filter(m=>same(m.from,q.input.sender)&&same(m.to,RELAY_BSC_CHAINS[privySource].depository))
  if(deposits.length!==1||deposits[0].value!==BigInt(route.conversion.minimumUnits))pending()
 }
 if(paidGasUnits)await options.onWalletGasPaid?.(paidGasUnits)
 return 'confirmed' as const
}
