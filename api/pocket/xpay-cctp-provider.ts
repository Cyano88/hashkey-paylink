import { decodeEventLog, encodeFunctionData, getAddress, parseAbi, parseAbiItem, type Address, type Hex } from 'viem'

// Dedicated Privy-source bridge; do not add X Layer to the Circle-wallet router.
export const XPAY_CCTP = {
  sourceDomain: 37, destinationDomain: 6,
  sourceToken: '0xB6CEceAB302E2E4948951eE7843FC24E92933061' as Address,
  destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  messenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d' as Address,
  transmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64' as Address,
}
const burnAbi = parseAbi(['function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold)'])
const mintAbi = parseAbi(['function receiveMessage(bytes message,bytes attestation) returns (bool)'])
const approveAbi = parseAbi(['function approve(address spender,uint256 amount) returns (bool)'])
const batchAbi = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
// V2 ABI from Circle's contract source; the legacy uint64 event is not valid here.
const receivedEvent = parseAbiItem('event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)')
const transferEvent = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const same = (a:string,b:string) => a.toLowerCase()===b.toLowerCase()
const word = (a:string) => ('0x'+getAddress(a).slice(2).toLowerCase().padStart(64,'0')) as Hex
function fail(message:string,status=409):never  {throw Object.assign(new Error(message),{status})}
export type XPayBridgePlan = {source:Address;destination:Address;destinationWalletId?:string;burnUnits:string;maxFeeUnits:string;minimumReceiveUnits:string;finality:1000|2000;expiresAt:number}
export async function quoteXPayBridge(source:string,destination:string,receiveUnits:bigint,fetcher:typeof fetch=fetch):Promise<XPayBridgePlan> {
  if(receiveUnits<=0n||receiveUnits>100_000n*1_000_000n)fail('Enter a supported payment amount.',400)
  const from=getAddress(source),to=getAddress(destination)
  if(/^0x0{40}$/i.test(from)||/^0x0{40}$/i.test(to))fail('Open both Pocket wallets before paying.',400)
  const response=await fetcher('https://iris-api.circle.com/v2/burn/USDC/fees/37/6',{signal:AbortSignal.timeout(15000),redirect:'error'})
  if(!response.ok)fail('Bridge fees are temporarily unavailable.',503)
  const rows=await response.json() as Array<{finalityThreshold:number;minimumFee:number|string}>
  if(!Array.isArray(rows))fail('Bridge fee response is invalid.',503)
  const fee=rows.find(r=>r.finalityThreshold===1000)||rows.find(r=>r.finalityThreshold===2000)
  const match=String(fee?.minimumFee??'').match(/^(\d{1,5})(?:\.(\d{1,8}))?$/)
  if(!fee||!match)fail('Bridge fee response is invalid.',503)
  const scale=10n**BigInt(match[2]?.length||0),rate=BigInt(match[1])*scale+BigInt(match[2]||'0'),denominator=10000n*scale
  if(rate>=denominator)fail('Bridge fee is invalid.',503)
  const burn=(receiveUnits*denominator+(denominator-rate)-1n)/(denominator-rate)
  return {source:from,destination:to,burnUnits:String(burn),maxFeeUnits:String(burn-receiveUnits),minimumReceiveUnits:String(receiveUnits),finality:fee.finalityThreshold as 1000|2000,expiresAt:Date.now()+45000}
}
export function xpayBurnCalls(plan:XPayBridgePlan) {
  const burn=BigInt(plan.burnUnits)
  return {
    approval:{to:XPAY_CCTP.sourceToken,data:encodeFunctionData({abi:approveAbi,functionName:'approve',args:[XPAY_CCTP.messenger,burn]}),value:0n},
    burn:{to:XPAY_CCTP.messenger,data:encodeFunctionData({abi:burnAbi,functionName:'depositForBurn',args:[burn,6,word(plan.destination),XPAY_CCTP.sourceToken,word(plan.destination),BigInt(plan.maxFeeUnits),plan.finality]}),value:0n},
  }
}
export function validateXPayAttestation(raw:unknown,plan:XPayBridgePlan) {
  if(typeof raw!=='string'||!/^0x[0-9a-f]{752}$/i.test(raw))fail('Waiting for a valid Circle bridge message.')
  const bytes=Buffer.from(raw.slice(2),'hex'),u=(offset:number)=>BigInt('0x'+bytes.subarray(offset,offset+32).toString('hex')),at=(offset:number)=>'0x'+bytes.subarray(offset,offset+32).toString('hex')
  if(bytes.readUInt32BE(0)!==1||bytes.readUInt32BE(148)!==1||bytes.readUInt32BE(4)!==37||bytes.readUInt32BE(8)!==6)fail('Bridge message uses a different network or version.')
  for(const [offset,address] of [[44,XPAY_CCTP.messenger],[76,XPAY_CCTP.messenger],[108,plan.destination],[152,XPAY_CCTP.sourceToken],[184,plan.destination],[248,plan.source]] as const)if(!same(at(offset),word(address)))fail('Bridge message does not match the approved wallets and token.')
  const fee=u(312),burn=u(216),maxFee=u(280),executed=bytes.readUInt32BE(144)
  if(burn!==BigInt(plan.burnUnits)||maxFee!==BigInt(plan.maxFeeUnits)||fee>maxFee||burn-fee<BigInt(plan.minimumReceiveUnits))fail('Bridge amount or fee does not match the approved payment.')
  if(bytes.readUInt32BE(140)!==plan.finality||(![1000,2000].includes(executed)||executed<plan.finality))fail('Bridge attestation has insufficient confirmation.')
  if(/^0x0{64}$/.test(at(12)))fail('Bridge nonce is not available.')
  return {message:raw as Hex,nonce:at(12) as Hex,amountUnits:burn-fee,expirationBlock:u(344),finality:executed,body:('0x'+bytes.subarray(148).toString('hex')) as Hex}
}
export async function readXPayAttestation(hash:Hex,plan:XPayBridgePlan,fetcher:typeof fetch=fetch) {
  if(!/^0x[0-9a-f]{64}$/i.test(hash))fail('Invalid bridge transaction.',400)
  const r=await fetcher('https://iris-api.circle.com/v2/messages/37?transactionHash='+encodeURIComponent(hash),{signal:AbortSignal.timeout(15000),redirect:'error'})
  if(r.status===404)return null
  if(!r.ok)fail('Bridge status is temporarily unavailable.',503)
  const b=await r.json() as {messages?:Array<{status?:string;message?:unknown;attestation?:unknown}>}
  if(!Array.isArray(b.messages)||!b.messages.length)return null
  if(b.messages.length!==1)fail('Bridge transaction needs review.')
  const m=b.messages[0];if(m.status!=='complete')return null
  if(typeof m.attestation!=='string'||!/^0x(?:[0-9a-f]{130}){1,20}$/i.test(m.attestation))fail('Circle bridge signature is not available.')
  return {...validateXPayAttestation(m.message,plan),attestation:m.attestation as Hex}
}
export function xpayMintBatch(proof:ReturnType<typeof validateXPayAttestation>&{attestation:Hex}) {
  const call=encodeFunctionData({abi:mintAbi,functionName:'receiveMessage',args:[proof.message,proof.attestation]})
  return encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[[{target:XPAY_CCTP.transmitter,value:0n,data:call}]]})
}
export function verifyXPayMintReceipt(plan:XPayBridgePlan,proof:ReturnType<typeof validateXPayAttestation>,receipt:{status:string;logs:readonly {address:string;data:Hex;topics:readonly Hex[]}[]}) {
  if(receipt.status!=='success')return false
  let received=false,minted=false
  for(const log of receipt.logs){try{
    if(same(log.address,XPAY_CCTP.transmitter)){
      const d=decodeEventLog({abi:[receivedEvent],data:log.data,topics:log.topics as [Hex,...Hex[]]})
      received ||= same(d.args.caller,plan.destination)&&d.args.sourceDomain===37&&same(d.args.nonce,proof.nonce)&&same(d.args.sender,word(XPAY_CCTP.messenger))&&d.args.finalityThresholdExecuted===proof.finality&&same(d.args.messageBody,proof.body)
    } else if(same(log.address,XPAY_CCTP.destinationToken)){
      const d=decodeEventLog({abi:[transferEvent],data:log.data,topics:log.topics as [Hex,...Hex[]]})
      minted ||= /^0x0{40}$/i.test(d.args.from)&&same(d.args.to,plan.destination)&&d.args.value===proof.amountUnits
    }
  }catch{/* Unrelated logs cannot establish settlement. */}}
  return received&&minted
}

export function verifyXPayBurnTransaction(plan:XPayBridgePlan,transaction:{from:string;to:string|null;input:Hex;value:bigint},receipt:{status:string}) {
  const expected=xpayBurnCalls(plan).burn
  if(!same(transaction.from,plan.source)||!transaction.to||!same(transaction.to,expected.to)||!same(transaction.input,expected.data)||transaction.value!==0n)fail('This transaction does not match the approved bridge.')
  return receipt.status==='success'?'confirmed' as const:receipt.status==='reverted'?'reverted' as const:fail('Waiting for the source transaction.')
}
export function assertXPayMintWindow(proof:ReturnType<typeof validateXPayAttestation>,baseBlock:bigint) {
  if(proof.expirationBlock!==0n&&baseBlock>=proof.expirationBlock)throw Object.assign(new Error('Bridge confirmation expired. Refresh confirmation to continue; do not send again.'),{status:409,code:'ATTESTATION_EXPIRED'})
}

export async function requestXPayReattestation(nonce:Hex,fetcher:typeof fetch=fetch) {
  if(!/^0x[0-9a-f]{64}$/i.test(nonce)||/^0x0{64}$/.test(nonce))fail('Invalid bridge nonce.',400)
  const r=await fetcher('https://iris-api.circle.com/v2/reattest/'+nonce,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error'})
  if(!r.ok)fail('Bridge confirmation could not be refreshed. Please retry.',503)
}
