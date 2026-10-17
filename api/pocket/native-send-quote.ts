import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {encodeFunctionData,parseAbi,parseUnits,formatUnits,isAddress,getAddress,type Hex} from 'viem'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
export const nativeEvmNetworks={ethereum:{id:1,symbol:'ETH',blockchain:'ETH'},base:{id:8453,symbol:'ETH',blockchain:'BASE'},arbitrum:{id:42161,symbol:'ETH',blockchain:'ARB'},polygon:{id:137,symbol:'POL',blockchain:'MATIC'}} as const
export type NativeEvmNetwork=keyof typeof nativeEvmNetworks
export type NativeSendBinding={ownerId:string;network:NativeEvmNetwork;walletId:string;walletAddress:Hex;recipient:Hex;amount:string}
export type NativeSendQuote=NativeSendBinding&{version:1;id:string;asset:'ETH'|'POL';amountUnits:string;feeUnits:string;totalUnits:string;callData:Hex;issuedAt:number;expiresAt:number}
const abi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const fail=()=>{throw Object.assign(Error('Transfer details changed. Review the amount and fee again.'),{status:409})}
export function nativeAmountUnits(amount:string){if(typeof amount!=='string'||! /^(?:0|[1-9]\d{0,59})(?:\.\d{1,18})?$/.test(amount))fail();const units=parseUnits(amount,18);if(units<=0n||units>=2n**256n)fail();return units}
function validateBinding(b:NativeSendBinding){if(!Object.hasOwn(nativeEvmNetworks,b.network)||!b.ownerId||!b.walletId||!isAddress(b.walletAddress)||!isAddress(b.recipient)||/^0x0{40}$/i.test(b.recipient)||b.recipient.toLowerCase()===b.walletAddress.toLowerCase())fail();nativeAmountUnits(b.amount)}
export function nativeSendCallData(b:NativeSendBinding,fee:bigint){validateBinding(b);if(fee<=0n)fail();return encodeFunctionData({abi,functionName:'executeBatch',args:[[{target:getAddress(b.recipient),value:nativeAmountUnits(b.amount),data:'0x'},{target:EVM_PLATFORM_TREASURY,value:fee,data:'0x'}]]})}
// Native units throughout: no USD peg assumptions, float rounding or price-service dependency.
export function bufferedNativeFee(estimate:string){return (nativeAmountUnits(estimate)*15000n+9999n)/10000n}
export async function quoteNativeSend(binding:NativeSendBinding,estimate:(data:Hex)=>Promise<string>,now=Date.now()):Promise<NativeSendQuote>{
 validateBinding(binding);let fee=1n
 for(let pass=0;pass<4;pass++){
  const callData=nativeSendCallData(binding,fee),next=bufferedNativeFee(await estimate(callData))
  if(next<=fee){const amount=nativeAmountUnits(binding.amount),total=amount+fee;if(total>=2n**256n)fail();return {...binding,amount:formatUnits(amount,18),version:1,id:randomUUID(),asset:nativeEvmNetworks[binding.network].symbol,amountUnits:String(amount),feeUnits:String(fee),totalUnits:String(total),callData,issuedAt:now,expiresAt:now+45000}}
  fee=next
 }
 throw Object.assign(Error('Network fees changed. Try the estimate again.'),{status:409})
}
function mac(payload:string){const key=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(key.length<32)throw Error('Native transfer signing unavailable.');return createHmac('sha256',key).update('pocket:native-send:v1:'+payload).digest()}
export function sealNativeSend(q:NativeSendQuote){const payload=Buffer.from(JSON.stringify(q)).toString('base64url');return payload+'.'+mac(payload).toString('base64url')}
export function openNativeSend(token:string,ownerId:string,recovery=false,now=Date.now()):NativeSendQuote{
 if(typeof token!=='string'||token.length>12000)fail();const [payload,signature,extra]=token.split('.');if(!payload||!signature||extra)fail();const actual=Buffer.from(signature,'base64url'),expected=mac(payload);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail()
 const q=JSON.parse(Buffer.from(payload,'base64url').toString()) as NativeSendQuote;validateBinding(q)
 if(q.ownerId!==ownerId||q.version!==1||! /^[0-9a-f-]{36}$/i.test(q.id)||q.asset!==nativeEvmNetworks[q.network].symbol||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt-q.issuedAt!==45000)fail()
 if(!/^[1-9]\d{0,77}$/.test(q.feeUnits)||nativeAmountUnits(q.amount).toString()!==q.amountUnits||BigInt(q.totalUnits)!==BigInt(q.amountUnits)+BigInt(q.feeUnits)||BigInt(q.totalUnits)>=2n**256n||q.callData!==nativeSendCallData(q,BigInt(q.feeUnits)))fail();
 if(!recovery&&q.expiresAt<=now)throw Object.assign(Error('Fee estimate expired. Tap Continue to refresh it.'),{status:409,code:'NATIVE_QUOTE_EXPIRED'});return q
}
export type NativeCallTrace={type?:string;from?:string;to?:string;input?:string;value?:string;error?:string;revertReason?:string;calls?:NativeCallTrace[]}
/** A successful bundler receipt can contain a reverted wallet operation. */
export function revertedNativeBatch(q:{walletAddress:string;callData:string},trace:NativeCallTrace){
 const matches:boolean[]=[]
 const visit=(node:NativeCallTrace,failed=false,depth=0)=>{
  if(depth>100)throw Error('Trace too deep.')
  const reverted=failed||!!node.error||!!node.revertReason
  if(node.type==='CALL'&&node.to?.toLowerCase()===q.walletAddress.toLowerCase()&&node.input?.toLowerCase()===q.callData.toLowerCase())matches.push(reverted)
  for(const child of node.calls||[])visit(child,reverted,depth+1)
 }
 visit(trace);return matches.length===1&&matches[0]
}
/** A successful outer bundler receipt alone cannot prove a smart-account payment. */
export function confirmsNativeSend(q:NativeSendQuote,trace:NativeCallTrace){
 const same=(a:string|undefined,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
 const matches:NativeCallTrace[]=[]
 const walk=(node:NativeCallTrace,failed=false,depth=0)=>{if(depth>100)throw Error('Trace too deep.');const reverted=failed||!!node.error||!!node.revertReason;if(!reverted&&node.type==='CALL'&&same(node.to,q.walletAddress)&&same(node.input,q.callData))matches.push(node);for(const child of node.calls||[])walk(child,reverted,depth+1)}
 walk(trace);if(matches.length!==1)return false
 const outgoing:NativeCallTrace[]=[]
 const scan=(node:NativeCallTrace)=>{if(node.error||node.revertReason)return;for(const child of node.calls||[]){if(same(child.from,q.walletAddress)&&child.type==='CALL'&&BigInt(child.value||'0')>0n)outgoing.push(child);scan(child)}};scan(matches[0])
 const expected=[{to:q.recipient,value:BigInt(q.amountUnits)},{to:EVM_PLATFORM_TREASURY,value:BigInt(q.feeUnits)}]
 return outgoing.length===2&&outgoing.every((call,index)=>!call.error&&!call.revertReason&&same(call.to,expected[index].to)&&BigInt(call.value||'0')===expected[index].value&&(!call.input||call.input==='0x'))
}
