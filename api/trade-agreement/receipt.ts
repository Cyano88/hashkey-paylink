import {createHash} from 'node:crypto'
import {decodeEventLog,parseAbi,type Hex} from 'viem'
import {mutateDurableJson} from '../render-durable-store.js'
import {ARC_TRADE_RELEASE,type ArcTradeRelease} from './arc.js'
import {arcTradeClient} from './arc-client.js'
import {planArcTradeCandidate} from './arc-planner.js'
import type {ArcHostedTrade} from './arc-http.js'
import type {ArcTradeReader} from './arc-verification.js'
const settlementAbi=parseAbi(['event Settled(bytes32 indexed offerId,uint256 buyerAmount,uint256 sellerAmount,bytes32 evidence,uint8 state)'])
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
type Log={address:string;data:Hex;topics:readonly Hex[];logIndex:number;removed?:boolean;transactionHash:Hex;blockHash:Hex;blockNumber:bigint}
export type ReceiptReader=ArcTradeReader & {getTransactionReceipt(input:{hash:Hex}):Promise<{transactionHash:Hex;status:string;blockNumber:bigint;blockHash:Hex;logs:readonly Log[]}>}
export type ArcTradeReceipt={id:string;agreementId:string;projectId:string;chainId:5042;token:string;decimals:6;title:string;termsHash:string;escrow:string;buyer:string;seller:string;amountUnits:string;buyerAmountUnits:string;sellerAmountUnits:string;state:6|7|8;evidence:string;transactionHash:string;blockNumber:string;blockHash:string;logIndex:number;settledAt:string}
const equal=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
function fail(message:string):never{throw Object.assign(Error(message),{status:409})}
export async function verifyArcTradeReceipt(record:ArcHostedTrade,transactionHash:unknown,reader:ReceiptReader,release:ArcTradeRelease):Promise<ArcTradeReceipt>{
  if(typeof transactionHash!=='string'||!/^0x[a-f0-9]{64}$/i.test(transactionHash)||!record.binding)fail('A confirmed settlement reference is required.')
  const binding=record.binding!,t=binding.contractTerms,hash=transactionHash as Hex
  const status=await planArcTradeCandidate({binding,account:t.buyer,fundingEnabled:false},reader,release)
  if(status.pending||![6,7,8].includes(status.state??-1)||!status.escrow||!status.observedBlock)fail('Settlement is not yet confirmed.')
  const receipt=await reader.getTransactionReceipt({hash})
  if(receipt.status!=='success'||!equal(receipt.transactionHash,hash)||receipt.blockNumber>BigInt(status.observedBlock))fail('Settlement transaction is not confirmed.')
  const block=await reader.getBlock({blockNumber:receipt.blockNumber})
  if(!block.hash||!equal(block.hash,receipt.blockHash))fail('Settlement block is not canonical.')
  const validLog=(log:Log)=>!log.removed&&equal(log.transactionHash,hash)&&equal(log.blockHash,receipt.blockHash)&&log.blockNumber===receipt.blockNumber&&Number.isSafeInteger(log.logIndex)&&log.logIndex>=0
  const settlements=receipt.logs.flatMap(log=>{
    if(!equal(log.address,status.escrow!))return []
    try{const event=decodeEventLog({abi:settlementAbi,data:log.data,topics:log.topics as [Hex,...Hex[]]});return [{log,args:event.args}]}catch{return []}
  })
  if(settlements.length!==1)fail('Expected one escrow settlement event.')
  const {log,args}=settlements[0]
  if(!validLog(log)||!equal(args.offerId,t.offerId)||args.state!==status.state||args.buyerAmount+args.sellerAmount!==BigInt(t.amount)
    ||(args.state===6&&args.buyerAmount!==0n)||(args.state===7&&args.sellerAmount!==0n))fail('Settlement does not match the agreed payment.')
  const transfers=receipt.logs.flatMap(log=>{
    if(!equal(log.address,t.token))return []
    try{const event=decodeEventLog({abi:transferAbi,data:log.data,topics:log.topics as [Hex,...Hex[]]});return equal(event.args.from,status.escrow!)?[{log,args:event.args}]:[]}catch{return []}
  })
  const expected=[[t.buyer,args.buyerAmount],[t.seller,args.sellerAmount]] as const
  if(transfers.length!==expected.filter(([,amount])=>amount>0n).length||expected.some(([to,amount])=>amount>0n&&!transfers.some(item=>validLog(item.log)&&equal(item.args.to,to)&&item.args.value===amount)))fail('USDC transfers do not match the settlement allocation.')
  if(await reader.getChainId()!==5042||(await reader.getBlock({blockNumber:receipt.blockNumber})).hash!==block.hash)fail('Settlement changed during verification.')
  const id='trc_'+createHash('sha256').update(`5042:${record.id}:${hash.toLowerCase()}:${log.logIndex}`).digest('hex')
  return {id,agreementId:record.id,projectId:record.partnerId,chainId:5042,token:t.token,decimals:6,title:record.terms.title,termsHash:binding.termsHash,escrow:status.escrow!,buyer:t.buyer,seller:t.seller,amountUnits:t.amount,buyerAmountUnits:String(args.buyerAmount),sellerAmountUnits:String(args.sellerAmount),state:args.state as 6|7|8,evidence:args.evidence,transactionHash:hash.toLowerCase(),blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,logIndex:log.logIndex,settledAt:new Date(Number(block.timestamp)*1000).toISOString()}
}
const defaults={release:()=>ARC_TRADE_RELEASE,reader:()=>arcTradeClient() as unknown as ReceiptReader,mutate:mutateDurableJson}
export function createArcTradeReceiptRecorder(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 return async(record:ArcHostedTrade,transactionHash:unknown)=>{
  const release=d.release();if(!release)fail('Arc Trade release is pending verification.')
  const receipt=await verifyArcTradeReceipt(record,transactionHash,d.reader(),release)
  const saved=await d.mutate<ArcHostedTrade>('hashpaylink:arc-hosted-trade:v1:'+record.id,current=>{
    if(!current?.binding||current.partnerId!==record.partnerId||current.binding.termsHash!==record.binding?.termsHash)fail('Agreement changed during receipt verification.')
    if(current.receipt&&JSON.stringify(current.receipt)!==JSON.stringify(receipt))fail('A different settlement receipt is already recorded.')
    return {...current,receipt}
  })
  return saved.receipt!
 }
}
export const recordArcTradeReceipt=createArcTradeReceiptRecorder()
