import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {encodeFunctionData,parseAbi,type Hex} from 'viem'
import {buildCircleKitFeeBatch,type CircleKitFeeInput} from './circle-bridge-platform-fee.js'
import {quoteEvmBridgeFee} from './evm-bridge-reimbursement.js'
import type {CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
const batchAbi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
type StoredInput=Omit<CircleKitFeeInput,'transferUnits'|'providerFeeUnits'|'reimbursementUnits'>&{transferUnits:string;providerFeeUnits:string;reimbursementUnits:string}
export type CircleKitReview={version:1;id:string;ownerId:string;wallets:CrossBridgeWalletBinding;input:StoredInput;platformFee:{recipient:Hex;bps:number;amountUnits:string;developerUnits:string;protocolUnits:string};callData:Hex;totalUnits:string;issuedAt:number;expiresAt:number}
const fail=():never=>{throw Object.assign(Error('Bridge review changed or expired. Review it again.'),{status:409})}
const units=(value:unknown)=>{if(typeof value!=='string'||! /^(0|[1-9]\d{0,38})$/.test(value)||BigInt(value)>=2n**128n)fail();return BigInt(value as string)}
const mac=(body:string,secret:string)=>{if(secret.length<32)throw Error('Bridge review signing is unavailable.');return createHmac('sha256',secret).update('pocket:circle-kit-review:v1:'+body).digest()}
export function sealCircleKitReview(q:CircleKitReview,secret=process.env.POCKET_SWAP_QUOTE_SECRET||''){const body=Buffer.from(JSON.stringify(q)).toString('base64url');return body+'.'+mac(body,secret).toString('base64url')}
export async function openCircleKitReview(token:string,ownerId:string,options:{recovery?:boolean;now?:number;secret?:string}={}){
 const now=options.now??Date.now()
 if(typeof token!=='string'||token.length>60000)fail()
 const [body,signature,extra]=token.split('.');if(!body||!signature||extra)fail()
 const expected=mac(body,options.secret??process.env.POCKET_SWAP_QUOTE_SECRET??''),actual=Buffer.from(signature,'base64url')
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail()
 const q=JSON.parse(Buffer.from(body,'base64url').toString()) as CircleKitReview
 if(q.version!==1||q.ownerId!==ownerId||q.wallets?.ownerId!==ownerId||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.id)||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt<=q.issuedAt||q.expiresAt-q.issuedAt>30000||(!options.recovery&&q.expiresAt<=now))fail()
 if(q.wallets.source.provider!=='circle'||q.wallets.destination.provider!=='circle'||!q.wallets.source.walletId||!q.wallets.destination.walletId||! /^[0-9a-f]{64}$/.test(q.wallets.fingerprint)||q.wallets.source.network!==q.input.source||q.wallets.destination.network!==q.input.destination||q.wallets.source.address.toLowerCase()!==q.input.walletAddress.toLowerCase()||(q.input.destination==='solana'?q.wallets.destination.address!==q.input.destinationAddress:q.wallets.destination.address.toLowerCase()!==q.input.destinationAddress.toLowerCase()))fail()
 const input={...q.input,transferUnits:units(q.input.transferUnits),providerFeeUnits:units(q.input.providerFeeUnits),reimbursementUnits:units(q.input.reimbursementUnits)}
 const batch=await buildCircleKitFeeBatch(input,{},q.platformFee)
 if(q.callData!==batch.callData||units(q.totalUnits)!==batch.totalUnits||units(q.platformFee.developerUnits)<=0n||units(q.platformFee.protocolUnits)+units(q.platformFee.developerUnits)!==units(q.platformFee.amountUnits))fail()
 return {quote:q,batch}
}
/** Owned-wallet binding and live CCTP provider quote are supplied by the authenticated service. */
export async function quoteCircleKitReview(input:Omit<CircleKitFeeInput,'reimbursementUnits'>,wallets:CrossBridgeWalletBinding,deps:{estimate(callData:Hex):Promise<string>;feeShares(gross:bigint):Promise<readonly [bigint,bigint]>;availableUnits:bigint;nativeRateScaled8:bigint;providerExpiresAt:number;now?():number},env:NodeJS.ProcessEnv=process.env){
 const now=deps.now?.()??Date.now(),policy={...env}
 if(!Number.isSafeInteger(deps.providerExpiresAt)||deps.providerExpiresAt<=now)fail()
 const seed=await buildCircleKitFeeBatch({...input,reimbursementUnits:1n},policy)
 const bridgeCallData=encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[seed.calls.slice(0,-1)]})
 const priced=await quoteEvmBridgeFee({ownerId:wallets.ownerId,walletId:wallets.source.walletId,walletAddress:input.walletAddress,source:input.source,destination:input.destination,destinationAddress:input.destinationAddress,asset:'USDC',tokenAddress:seed.bridgeParams.burnToken,amountUnits:String(input.transferUnits),bridgeDebitUnits:String(seed.approvalUnits),bridgeCallData,providerExpiresAt:Math.min(deps.providerExpiresAt,now+30000)},deps.estimate,deps.nativeRateScaled8,now,deps.availableUnits)
 const shares=await deps.feeShares(BigInt(seed.platformFee.grossAmountUnits))
 const batch=await buildCircleKitFeeBatch({...input,reimbursementUnits:BigInt(priced.networkFeeUnits)},policy)
 if(batch.callData!==priced.callData)fail()
 const q:CircleKitReview={version:1,id:randomUUID(),ownerId:wallets.ownerId,wallets:structuredClone(wallets),input:{...input,transferUnits:String(input.transferUnits),providerFeeUnits:String(input.providerFeeUnits),reimbursementUnits:priced.networkFeeUnits},platformFee:{recipient:seed.platformFee.recipient,bps:seed.platformFee.bps,amountUnits:seed.platformFee.grossAmountUnits,developerUnits:String(shares[0]),protocolUnits:String(shares[1])},callData:priced.callData,totalUnits:priced.totalUnits,issuedAt:now,expiresAt:priced.expiresAt}
 const token=sealCircleKitReview(q,policy.POCKET_SWAP_QUOTE_SECRET)
 await openCircleKitReview(token,wallets.ownerId,{now:deps.now?.()??Date.now(),secret:policy.POCKET_SWAP_QUOTE_SECRET})
 return {quote:q,quoteToken:token,batch}
}
