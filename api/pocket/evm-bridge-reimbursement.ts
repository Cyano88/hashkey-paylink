import {createHmac,timingSafeEqual} from 'node:crypto'
import {decodeFunctionData,encodeFunctionData,isAddress,parseAbi,type Hex} from 'viem'
import {nativeFeeToUsdcUnits} from '../payment-network-fees.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

const batchAbi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const transferAbi=parseAbi(['function transfer(address to,uint256 amount) returns(bool)'])
export type EvmBridgeFeeBinding={ownerId:string;walletId:string;walletAddress:string;source:string;destination:string;destinationAddress:string;asset:'USDC'|'USDT';tokenAddress:Hex;amountUnits:string;bridgeDebitUnits:string}
export type EvmBridgeFeeQuote=EvmBridgeFeeBinding&{version:1;bridgeCallData:Hex;callData:Hex;networkFeeUnits:string;totalUnits:string;issuedAt:number;expiresAt:number}
const fail=()=>{throw Object.assign(Error('Bridge quote changed or expired. Review a new quote.'),{status:409})}
function valid(input:EvmBridgeFeeBinding){
 if(!input.ownerId||!input.walletId||!isAddress(input.walletAddress)||!isAddress(input.tokenAddress)||!input.destinationAddress||!['USDC','USDT'].includes(input.asset)||!['base','arbitrum','ethereum','polygon','arc'].includes(input.source)||!['base','arbitrum','ethereum','polygon','arc','solana','xlayer'].includes(input.destination)||input.source===input.destination||(input.asset==='USDT'&&(input.source==='arc'||input.destination==='arc'||input.destination==='xlayer'&&input.source!=='base')))fail()
 // X Layer is a destination only here. Circle cannot estimate a Privy-sponsored source batch.
 if(input.destination==='xlayer'&&(!isAddress(input.destinationAddress)||/^0x0{40}$/i.test(input.destinationAddress)))fail()
 for(const value of [input.amountUnits,input.bridgeDebitUnits])if(!/^[1-9]\d{0,77}$/.test(value)||BigInt(value)>=2n**256n)fail()
}
function withRecovery(bridgeCallData:Hex,token:Hex,units:bigint){
 const decoded=decodeFunctionData({abi:batchAbi,data:bridgeCallData})
 const calls=decoded.args[0]
 if(!calls.length||calls.length>12||calls.some(c=>c.value!==0n))fail()
 return encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[[...calls,{target:token,value:0n,data:encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,units]})}]]})
}
/** Server-only: bridgeCallData must come from the validated provider/CCTP builder, never a request body. */
export async function quoteEvmBridgeFee(input:EvmBridgeFeeBinding&{bridgeCallData:Hex;providerExpiresAt:number},estimate:(callData:Hex)=>Promise<string>,rateScaled8:bigint,now=Date.now(),availableUnits?:bigint):Promise<EvmBridgeFeeQuote>{
 valid(input)
 if(!Number.isSafeInteger(input.providerExpiresAt)||input.providerExpiresAt<=now)fail()
 let units=1n
 // Re-estimate the exact batch against the previously observed fee ceiling.
 // Circle's live estimate can rise slightly on every call. Pocket absorbs
 // at most 0.1% AND 0.0001 source stablecoin of drift, never adds a markup.
 // Still simulate the exact final batch; larger changes must converge or fail.
 for(let pass=0;pass<4;pass++){
  if(availableUnits!==undefined&&BigInt(input.bridgeDebitUnits)+units>availableUnits){
   const maximum=BigInt(input.amountUnits)-(BigInt(input.bridgeDebitUnits)+units-availableUnits)
   throw Object.assign(Error('Insufficient '+input.asset+' to cover the bridge and network fee. Enter a smaller amount.'),{status:422,maximumAmountUnits:(maximum>0n?maximum:0n).toString()})
  }
  const callData=withRecovery(input.bridgeCallData,input.tokenAddress,units)
  const next=nativeFeeToUsdcUnits(await estimate(callData),rateScaled8)
  const relativeTolerance=units/1000n
  const absorbedDrift=relativeTolerance<100n?relativeTolerance:100n
  if(next<=units+absorbedDrift){
   const total=BigInt(input.bridgeDebitUnits)+units
   if(total>=2n**256n)fail()
   const {providerExpiresAt,...binding}=input
   return {...binding,version:1,callData,networkFeeUnits:units.toString(),totalUnits:total.toString(),issuedAt:now,expiresAt:Math.min(providerExpiresAt,now+30000)}
  }
  units=next
 }
 throw Error('Bridge fee estimate changed. Please try a new quote.')
}
function mac(payload:string){const secret=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(secret.length<32)throw Error('Bridge quote signing is not configured.');return createHmac('sha256',secret).update('pocket:evm-bridge-fee:v1:'+payload).digest()}
export function sealEvmBridgeFee(quote:EvmBridgeFeeQuote){const payload=Buffer.from(JSON.stringify(quote)).toString('base64url');return payload+'.'+mac(payload).toString('base64url')}
export function openEvmBridgeFee(token:string,binding:Omit<EvmBridgeFeeBinding,'bridgeDebitUnits'> & {bridgeDebitUnits?:string},now=Date.now()):EvmBridgeFeeQuote{
 valid({...binding,bridgeDebitUnits:binding.bridgeDebitUnits??'1'})
 if(typeof token!=='string'||token.length>100000)fail()
 const [payload,signature,extra]=token.split('.')
 if(!payload||!signature||extra)fail()
 const expected=mac(payload),actual=Buffer.from(signature,'base64url')
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail()
 const quote=JSON.parse(Buffer.from(payload,'base64url').toString()) as EvmBridgeFeeQuote
 for(const field of Object.keys(binding) as (keyof EvmBridgeFeeBinding)[]){
  const normalize=(value:string)=>field==='walletAddress'||field==='tokenAddress'||(field==='destinationAddress'&&binding.destination!=='solana')?value.toLowerCase():value
  if(typeof quote[field]!=='string'||normalize(quote[field])!==normalize(binding[field]!))fail()
 }
 if(quote.version!==1||!Number.isSafeInteger(quote.issuedAt)||!Number.isSafeInteger(quote.expiresAt)||quote.issuedAt>now+5000||quote.expiresAt<=now||quote.expiresAt<=quote.issuedAt||quote.expiresAt-quote.issuedAt>30000||!/^\d{1,78}$/.test(quote.networkFeeUnits))fail()
 const recovery=BigInt(quote.networkFeeUnits)
 if(recovery<=0n||BigInt(quote.totalUnits)!==BigInt(quote.bridgeDebitUnits)+recovery||BigInt(quote.totalUnits)>=2n**256n||quote.callData!==withRecovery(quote.bridgeCallData,quote.tokenAddress,recovery))fail()
 return quote
}
/** Repricing can reduce the debit, but increasing it always requires a new approval. */
export async function refreshEvmBridgeFee(approved:EvmBridgeFeeQuote,estimate:(callData:Hex)=>Promise<string>,rateScaled8:bigint,now=Date.now()){
 const fresh=await quoteEvmBridgeFee({...approved,providerExpiresAt:approved.expiresAt},estimate,rateScaled8,now)
 if(BigInt(fresh.totalUnits)>BigInt(approved.totalUnits))throw Error('Bridge fee increased. Review the updated quote.')
 return fresh
}
