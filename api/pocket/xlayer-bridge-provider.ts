import {getOrderId,type Order} from '@relay-protocol/settlement-sdk'
import {PublicKey,SystemProgram,TransactionInstruction} from '@solana/web3.js'
import {SOLANA_TOKEN_PROGRAM_ID as TOKEN_PROGRAM_ID,SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID as ASSOCIATED_TOKEN_PROGRAM_ID} from '../solana-token.js'
import {decodeFunctionData,encodeFunctionData,parseAbi,type Address,type Hex} from 'viem'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {CHAIN_META} from '../../src/lib/chains.js'

// X Layer routes only. Quote validation never authorizes signing or broadcasting.
// The existing USDT/Circle adapter remains unchanged during this rollout.
// Pin independently fetched /chains metadata, never trust a quote to select its own depository.
export const RELAY_STABLECOIN_CHAINS={
 xlayer:{id:196,depository:'0x4cd00e387622c35bddb9b4c962c136462338bc31'},
 ethereum:{id:1,depository:'0x4cd00e387622c35bddb9b4c962c136462338bc31'},
 polygon:{id:137,depository:'0x4cd00e387622c35bddb9b4c962c136462338bc31'},
 arc:{id:5042,depository:'0x4cd00e387622c35bddb9b4c962c136462338bc31'},
 base:{id:8453,depository:'0x4cd00e387622c35bddb9b4c962c136462338bc31'},
 arbitrum:{id:42161,depository:'0x4cd00e387622c35bddb9b4c962c136462338bc31'},
 solana:{id:792703809,depository:'99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2'},
} as const
export function stablecoinAddress(network:RelayStablecoinNetwork,asset:'USDC'|'USDT'):string {
 if(network==='xlayer')return asset==='USDC'?'0xb6ceceab302e2e4948951ee7843fc24e92933061':'0x779ded0c9e1022225f8e0630b35a9b54be713736'
 if(asset==='USDC')return CHAIN_META[network].tokenAddress
 if(network==='arc')throw Error('USDT is not supported on Arc')
 return POCKET_USDT_ASSETS[network].address
}
export type RelayStablecoinNetwork=keyof typeof RELAY_STABLECOIN_CHAINS
export type RelayStablecoinInput={asset:'USDC'|'USDT';source:RelayStablecoinNetwork;destination:RelayStablecoinNetwork;sender:string;recipient:string;amountUnits:string}
export type RelayStablecoinRefund={network:RelayStablecoinNetwork;asset:'USDC'|'USDT';recipient:string}
export type RelayStablecoinPolicy={allowXLayerUsdcRefund?:boolean}
const depositAbi=parseAbi(['function depositErc20(address depositor,address token,uint256 amount,bytes32 id)'])
const approveAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
const batchAbi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const vmTypes={xlayer:'ethereum-vm',ethereum:'ethereum-vm',polygon:'ethereum-vm',arc:'ethereum-vm',base:'ethereum-vm',arbitrum:'ethereum-vm',solana:'solana-vm'} as const
function requireThat(value:unknown,message:string):asserts value {if(!value)throw Error('Relay bridge: '+message)}
const same=(network:string,a:unknown,b:string)=>typeof a==='string'&&(network==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
function inputCheck(i:RelayStablecoinInput){
 requireThat(Object.prototype.hasOwnProperty.call(RELAY_STABLECOIN_CHAINS,i.source)&&Object.prototype.hasOwnProperty.call(RELAY_STABLECOIN_CHAINS,i.destination)&&i.source!==i.destination&&(i.source==='xlayer'||i.destination==='xlayer'),'unsupported route')
 requireThat(i.asset==='USDC'||i.asset==='USDT','unsupported asset')
 requireThat(i.asset!=='USDT'||i.source!=='arc'&&i.destination!=='arc','USDT is not supported on Arc')
 requireThat(/^[1-9]\d{0,18}$/.test(i.amountUnits)&&BigInt(i.amountUnits)<2n**64n,'invalid amount')
 for(const [network,address] of [[i.source,i.sender],[i.destination,i.recipient]])requireThat(network==='solana'?new PublicKey(address).toBase58()===address:/^0x[0-9a-fA-F]{40}$/.test(address)&&!/^0x0{40}$/.test(address),'invalid wallet')
}
// Request a slightly tighter USDT quote: live conversion routes can round their
// minimum beyond the 50-bps validation bound. Keep that bound unchanged.
export function relayStablecoinRequest(i:RelayStablecoinInput){inputCheck(i);return {user:i.sender,recipient:i.recipient,originChainId:RELAY_STABLECOIN_CHAINS[i.source].id,destinationChainId:RELAY_STABLECOIN_CHAINS[i.destination].id,originCurrency:stablecoinAddress(i.source,i.asset),destinationCurrency:stablecoinAddress(i.destination,i.asset),amount:i.amountUnits,tradeType:'EXACT_INPUT',slippageTolerance:i.asset==='USDT'?'49':'50',explicitDeposit:true,disableOriginSwaps:true,includeProtocolData:true,appFees:[]}}
// Derive every account locally using the pinned settlement SDK deposit_token IDL.
export function relayStablecoinSolanaDeposit(sender:string,amount:bigint,orderId:Hex,asset:'USDC'|'USDT'){
 const program=new PublicKey(RELAY_STABLECOIN_CHAINS.solana.depository),owner=new PublicKey(sender),mint=new PublicKey(stablecoinAddress('solana',asset))
 const config=PublicKey.findProgramAddressSync([Buffer.from('relay_depository')],program)[0],vault=PublicKey.findProgramAddressSync([Buffer.from('vault')],program)[0]
 const keys=[config,owner,owner,vault,mint,PublicKey.findProgramAddressSync([owner.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),mint.toBuffer()],ASSOCIATED_TOKEN_PROGRAM_ID)[0],PublicKey.findProgramAddressSync([vault.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),mint.toBuffer()],ASSOCIATED_TOKEN_PROGRAM_ID)[0],TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,SystemProgram.programId].map((pubkey,index)=>({pubkey,isSigner:index===1,isWritable:[1,5,6].includes(index)}))
 const data=Buffer.alloc(48);Buffer.from([11,156,96,218,39,163,180,19]).copy(data);data.writeBigUInt64LE(amount,8);Buffer.from(orderId.slice(2),'hex').copy(data,16)
 return new TransactionInstruction({programId:program,keys,data})
}
export function validateRelayStablecoinQuote(q:any,i:RelayStablecoinInput,now=Date.now(),policy:RelayStablecoinPolicy={}){
 inputCheck(i)
 const source=RELAY_STABLECOIN_CHAINS[i.source],destination=RELAY_STABLECOIN_CHAINS[i.destination],from=stablecoinAddress(i.source,i.asset),to=stablecoinAddress(i.destination,i.asset)
 const protocol=q?.protocol?.v2,order=protocol?.orderData as Order
 requireThat(protocol?.hubType==='onchain'&&order?.version==='v1'&&order.inputs?.length===1&&order.output?.payments?.length===1&&order.output.calls?.length===0&&order.fees?.length===0,'unsupported order')
 requireThat(q.fees?.app?.amount==='0','app fee must be zero')
 const payment=order.inputs[0].payment,out=order.output.payments[0],amount=BigInt(i.amountUnits)
 requireThat(payment.chainId===i.source&&same(i.source,payment.currency,from)&&payment.amount===i.amountUnits&&payment.weight==='1','input payment mismatch')
 requireThat(order.output.chainId===i.destination&&same(i.destination,out.recipient,i.recipient)&&same(i.destination,out.currency,to),'output payment mismatch')
 requireThat(/^\d+$/.test(out.minimumAmount)&&/^\d+$/.test(out.expectedAmount),'invalid output amounts')
 const minimum=BigInt(out.minimumAmount),receive=BigInt(out.expectedAmount)
 // High provider costs are disclosed before approval, not blocked by a percentage cap.
 // Keep the requested slippage bound and positive, consistent delivery amounts.
 requireThat(minimum>0n&&minimum<=receive&&receive<=amount&&minimum*10000n>=receive*9950n-10000n,'output outside amount/slippage limits')
 requireThat(Number.isSafeInteger(order.output.deadline)&&order.output.deadline*1000>now+45000&&order.output.deadline*1000<now+8*86400000,'invalid order deadline')
 const refunds=order.inputs[0].refunds
 requireThat(refunds?.length===2&&new Set(refunds.map(r=>r.chainId)).size===2,'unexpected refunds')
 const refundOptions:RelayStablecoinRefund[]=refunds.map(r=>{
  const src=r.chainId===i.source
  requireThat(src||r.chainId===i.destination,'unexpected refund chain')
  // Opt-in inspection only until signed quotes, review and recovery carry this plan.
  // Never permit an origin swap or arbitrary provider-selected refund token.
  const alternate=policy.allowXLayerUsdcRefund===true&&i.asset==='USDT'&&i.source==='base'&&i.destination==='xlayer'&&!src&&same('xlayer',r.currency,stablecoinAddress('xlayer','USDC'))
  requireThat(same(r.chainId,r.recipient,src?i.sender:i.recipient)&&(same(r.chainId,r.currency,src?from:to)||alternate)&&r.minimumAmount==='0'&&r.deadline===order.output.deadline,'refund mismatch')
  return {network:r.chainId as RelayStablecoinNetwork,asset:alternate?'USDC':i.asset,recipient:src?i.sender:i.recipient}
 })
 const details=protocol.paymentDetails
 requireThat(details?.chainId===i.source&&same(i.source,details.depository,source.depository)&&same(i.source,details.currency,from)&&details.amount===i.amountUnits,'depository mismatch')
 const orderId=getOrderId(order,vmTypes) as Hex
 requireThat(orderId.toLowerCase()===protocol.orderId?.toLowerCase(),'order hash mismatch')
 const display=q.details
 requireThat(display?.currencyIn?.amount===i.amountUnits&&same(i.source,display.currencyIn.currency?.address,from)&&display.currencyIn.currency?.chainId===source.id&&display.currencyIn.currency?.decimals===6&&display.currencyOut?.amount===out.expectedAmount&&same(i.destination,display.currencyOut.currency?.address,to)&&display.currencyOut.currency?.chainId===destination.id&&display.currencyOut.currency?.decimals===6,'display mismatch')
 requireThat(Array.isArray(q.steps)&&q.steps.every((s:any)=>s.kind==='transaction'&&s.items?.length===1&&!s.depositAddress),'unsupported execution steps')
 const depositStep=q.steps.find((s:any)=>s.id==='deposit'),requestId=depositStep?.requestId
 requireThat(typeof requestId==='string'&&/^0x[0-9a-fA-F]{64}$/.test(requestId),'missing recovery identifier')
 requireThat(depositStep.items[0].check?.method==='GET'&&depositStep.items[0].check?.endpoint==='/intents/status/v3?requestId='+requestId,'unexpected recovery endpoint')
 let execution:{kind:'evm';callData:Hex}|{kind:'solana';instruction:TransactionInstruction}
 if(i.source==='solana'){
  requireThat(q.steps.length===1&&q.steps[0].id==='deposit','unexpected Solana steps')
  const data=q.steps[0].items[0].data,expected=relayStablecoinSolanaDeposit(i.sender,amount,orderId,i.asset),ix=data?.instructions?.[0]
  requireThat(data?.instructions?.length===1&&ix?.programId===expected.programId.toBase58()&&ix.data===expected.data.toString('hex')&&ix.keys?.length===expected.keys.length,'Solana instruction mismatch')
  expected.keys.forEach((key,index)=>requireThat(ix.keys[index].pubkey===key.pubkey.toBase58()&&ix.keys[index].isSigner===key.isSigner&&ix.keys[index].isWritable===key.isWritable,'Solana account mismatch'))
  // Use locally reconstructed instruction; provider lookup tables are never imported.
  execution={kind:'solana',instruction:expected}
 }else{
  requireThat(q.steps.length>=1&&q.steps.length<=2&&q.steps.filter((s:any)=>s.id==='deposit').length===1&&q.steps.every((s:any)=>['approve','deposit'].includes(s.id)),'unexpected EVM steps')
  for(const step of q.steps){const tx=step.items[0].data;requireThat(tx?.chainId===source.id&&same(i.source,tx.from,i.sender)&&BigInt(tx.value||0)===0n,'transaction sender/chain/value mismatch')
   if(step.id==='approve'){const call=decodeFunctionData({abi:approveAbi,data:tx.data});requireThat(same(i.source,tx.to,from)&&same(i.source,call.args[0],source.depository)&&call.args[1]===amount,'approval mismatch')}
   else{const call=decodeFunctionData({abi:depositAbi,data:tx.data});requireThat(same(i.source,tx.to,source.depository)&&same(i.source,call.args[0],i.sender)&&same(i.source,call.args[1],from)&&call.args[2]===amount&&call.args[3].toLowerCase()===orderId.toLowerCase(),'deposit mismatch')}
  }
  const approval=(n:bigint)=>({target:from as Address,value:0n,data:encodeFunctionData({abi:approveAbi,functionName:'approve',args:[source.depository as Address,n]})})
  execution={kind:'evm',callData:encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[[approval(0n),approval(amount),{target:source.depository as Address,value:0n,data:encodeFunctionData({abi:depositAbi,functionName:'depositErc20',args:[i.sender as Address,from as Address,amount,orderId]})},approval(0n)]]})}
 }
 return {provider:'relay' as const,orderId,requestId,asset:i.asset,source:i.source,destination:i.destination,amountUnits:i.amountUnits,receiveUnits:out.expectedAmount,minimumUnits:out.minimumAmount,appFeeUnits:'0',expiresAt:Math.min(now+45000,order.output.deadline*1000),execution,refundOptions}
}
export async function quoteRelayStablecoin(i:RelayStablecoinInput,apiKey:string,fetcher=fetch,policy:RelayStablecoinPolicy={}){
 requireThat(apiKey.trim().length>0,'provider API key required')
 const response=await fetcher('https://api.relay.link/quote/v2',{method:'POST',headers:{'content-type':'application/json','x-api-key':apiKey},body:JSON.stringify(relayStablecoinRequest(i)),signal:AbortSignal.timeout(20000)})
 requireThat(response.ok,'quote unavailable')
 return validateRelayStablecoinQuote(await response.json(),i,Date.now(),policy)
}
