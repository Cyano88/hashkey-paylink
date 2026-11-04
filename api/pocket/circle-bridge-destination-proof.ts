import {createHash} from 'node:crypto'
import {PublicKey} from '@solana/web3.js'
import bs58 from 'bs58'
import {decodeEventLog,parseAbi,type Hex} from 'viem'
import {TOKENS,validatePocketBridgeMessage,type Expected} from './bridge-proof.js'
import {readFinalizedBridgeReceipt} from './circle-bridge-source-reader.js'
import {readSolanaBridgeDelivery} from './bridge-solana-delivery.js'
import type {CircleKitSourceReceipt} from './circle-bridge-source-proof.js'

const transmitter='0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'
const messenger='0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'
const solanaMessenger='CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe'
const solanaTransmitter='CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC'
const receiveDiscriminator=createHash('sha256').update('global:receive_message').digest().subarray(0,8)
const abi=parseAbi(['event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)','event Transfer(address indexed from,address indexed to,uint256 value)'])
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
function pending():never {throw Object.assign(Error('The destination payment is still being verified.'),{status:409,code:'circle_bridge_destination_pending'})}
function messageFields(raw:string,expected:Expected){
 const bytes=Buffer.from(raw.slice(2),'hex'),word=(offset:number)=>'0x'+bytes.subarray(offset,offset+32).toString('hex'),uint=(offset:number)=>BigInt(word(offset))
 const messengerBytes=(network:string)=>network==='solana'?Buffer.from(new PublicKey(solanaMessenger).toBytes()):Buffer.from(messenger.slice(2).padStart(64,'0'),'hex')
 if(!bytes.subarray(44,76).equals(messengerBytes(expected.source))||!bytes.subarray(76,108).equals(messengerBytes(expected.destination)))pending()
 const finality=bytes.readUInt32BE(144),minimum=bytes.readUInt32BE(140),fee=uint(312),burn=uint(216)
 if(![1000,2000].includes(minimum)||![1000,2000].includes(finality)||finality<minimum||uint(12)===0n||fee>uint(280)||fee>=burn)pending()
 return {bytes,nonce:word(12),sender:word(44),sourceDomain:bytes.readUInt32BE(4),finality,body:'0x'+bytes.subarray(148).toString('hex'),amount:burn-fee}
}
/** Receipt canonicality is enforced by the reader; this binds its logs to the
 * already owner/amount-validated CCTP message, not merely an incoming transfer. */
export async function proveCircleBridgeDestination(expected:Expected,raw:string,receipt:CircleKitSourceReceipt,hash:string){
 await validatePocketBridgeMessage(raw,expected)
 const p=messageFields(raw,expected)
 if(expected.destination==='solana'||receipt.status!=='success'||!same(receipt.transactionHash,hash))pending()
 let received=0,mints=0,net=0n
 for(const log of receipt.logs){
  if(log.removed)pending()
  if(same(log.address,transmitter)){
   let event;try{event=decodeEventLog({abi,eventName:'MessageReceived',data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true})}catch{continue}
   const a=event.args
   if(a.sourceDomain!==p.sourceDomain||!same(a.nonce,p.nonce)||!same(a.sender,p.sender)||a.finalityThresholdExecuted!==p.finality||!same(a.messageBody,p.body))pending()
   received++
  }else if(same(log.address,TOKENS[expected.destination])){
   let event;try{event=decodeEventLog({abi,eventName:'Transfer',data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true})}catch{continue}
   const a=event.args
   net+=(same(a.to,expected.destinationAddress)?a.value:0n)-(same(a.from,expected.destinationAddress)?a.value:0n)
   if(/^0x0{40}$/i.test(a.from)&&same(a.to,expected.destinationAddress)&&a.value===p.amount)mints++
  }
 }
 if(received!==1||mints!==1||net!==p.amount)pending()
 return {amountUnits:String(p.amount),destinationTxHash:hash}
}
/** Only top-level receive_message is accepted: successful transaction status
 * then proves that exact invocation succeeded. Unverified CPI shapes fail closed. */
export function solanaCctpMessageExecuted(tx:any,raw:string){
 const expected=Buffer.from(raw.slice(2),'hex')
 let matches=0
 for(const ix of tx?.transaction?.message?.instructions??[]){
  if(ix.programId?.toString()!==solanaTransmitter)continue
  try{
   if(typeof ix.data!=='string'||ix.data.length>30000)return false
   const data=Buffer.from(bs58.decode(ix.data))
   if(!data.subarray(0,8).equals(receiveDiscriminator))continue
   if(data.length<16||data.readUInt32LE(8)!==expected.length||!data.subarray(12,12+expected.length).equals(expected))return false
   const offset=12+expected.length,attestationLength=data.readUInt32LE(offset)
   if(attestationLength<65||attestationLength>1300||attestationLength%65!==0||data.length!==offset+4+attestationLength)return false
   matches++
  }catch{return false}
 }
 return matches===1
}
export async function readCircleBridgeDestination(expected:Expected,raw:string,hash:string,overrides:{evm?:Parameters<typeof readFinalizedBridgeReceipt>[3];solana?:Parameters<typeof readSolanaBridgeDelivery>[3]}={}){
 await validatePocketBridgeMessage(raw,expected)
 const p=messageFields(raw,expected)
 if(expected.destination==='solana'){
  const amount=await readSolanaBridgeDelivery('USDC',expected.destinationAddress,hash,overrides.solana,tx=>solanaCctpMessageExecuted(tx,raw))
  if(amount!==p.amount)pending()
  return {amountUnits:String(amount),destinationTxHash:hash}
 }
 return readFinalizedBridgeReceipt(expected.destination,hash,receipt=>proveCircleBridgeDestination(expected,raw,receipt,hash),overrides.evm)
}
