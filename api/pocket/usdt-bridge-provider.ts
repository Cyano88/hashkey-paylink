import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto'
import {decodeFunctionData, encodeFunctionData, formatUnits, getAddress, pad, parseAbi, parseUnits, type Address, type Hex} from 'viem'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'

export const USDT_BRIDGE_NETWORKS = ['base','arbitrum','ethereum','polygon'] as const
export type UsdtBridgeNetwork = typeof USDT_BRIDGE_NETWORKS[number]
export const USDT_BRIDGE_ROUTER = getAddress('0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE')
const FEE_FORWARDER = '0xce40449b773a3e6e5e769adb4e567179d4828cbd'
const bridgeTuple = '(bytes32 transactionId,string bridge,string integrator,address referrer,address sendingAssetId,address receiver,uint256 minAmount,uint256 destinationChainId,bool hasSourceSwaps,bool hasDestinationCall)'
const acrossTuple = '(bytes32 receiverAddress,bytes32 refundAddress,bytes32 sendingAssetId,bytes32 receivingAssetId,uint256 outputAmount,uint128 outputAmountMultiplier,bytes32 exclusiveRelayer,uint32 quoteTimestamp,uint32 fillDeadline,uint32 exclusivityParameter,bytes message)'
const swapTuple = '(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,uint256 fromAmount,bytes callData,bool requiresDeposit)[]'
export const USDT_BRIDGE_ABI = parseAbi([`function startBridgeTokensViaAcrossV4(${bridgeTuple} bridgeData,${acrossTuple} acrossData) payable`, `function swapAndStartBridgeTokensViaAcrossV4(${bridgeTuple} bridgeData,${swapTuple} swapData,${acrossTuple} acrossData) payable`])
const FEE_ABI = parseAbi(['function forwardERC20Fees(address token,(address recipient,uint256 amount)[] distributions)'])
export const USDT_BATCH_ABI = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)'])
export const USDT_TRANSFER_ABI = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)', `event LiFiTransferStarted(${bridgeTuple} bridgeData)`])
export const sameAddress = (a: unknown,b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
export function bridgeError(message: string,status=400):never {throw Object.assign(new Error(message),{status})}
export function usdtBridgeNetwork(value: unknown):UsdtBridgeNetwork {
  if(!USDT_BRIDGE_NETWORKS.includes(value as UsdtBridgeNetwork)) bridgeError('USDT bridging is available on supported EVM networks only.')
  return value as UsdtBridgeNetwork
}
export type UsdtBridgeQuote = {id:string;ownerId:string;walletId:string;source:UsdtBridgeNetwork;destination:UsdtBridgeNetwork;walletAddress:Address;destinationAddress:Address;amount:string;amountUnits:string;receive:string;minimumReceive:string;minimumUnits:string;fee:string;expiresAt:number;callData:Hex;transactionId:Hex;provider:'across'}

// Only audited Across V4 calls and its exact fee-forwarding step are accepted.
// No token conversion, destination calls, native value, or arbitrary swap calls.
export function validateUsdtBridgeQuote(data:any,input:{source:UsdtBridgeNetwork;destination:UsdtBridgeNetwork;walletAddress:Address;destinationAddress:Address;amountUnits:bigint}) {
  const from=POCKET_USDT_ASSETS[input.source],to=POCKET_USDT_ASSETS[input.destination]
  const a=data?.action,t=data?.transactionRequest,e=data?.estimate
  if(data?.tool!=='across'||!a||!t||!e||a.fromChainId!==from.chainId||a.toChainId!==to.chainId||t.chainId!==from.chainId
    ||!sameAddress(a.fromToken?.address,from.address)||!sameAddress(a.toToken?.address,to.address)||a.fromToken?.decimals!==6||a.toToken?.decimals!==6
    ||!sameAddress(a.fromAddress,input.walletAddress)||!sameAddress(a.toAddress,input.destinationAddress)||!sameAddress(t.from,input.walletAddress)
    ||!sameAddress(t.to,USDT_BRIDGE_ROUTER)||!sameAddress(e.approvalAddress,USDT_BRIDGE_ROUTER)||BigInt(t.value||'0')!==0n||String(a.fromAmount)!==String(input.amountUnits)
    ||typeof t.data!=='string'||t.data.length>24000||!Array.isArray(data.includedSteps)||data.includedSteps.some((s:any)=>!['cross','protocol'].includes(s.type))) bridgeError('USDT bridge route did not match the requested wallets and assets.',502)
  const minimum=BigInt(e.toAmountMin),receive=BigInt(e.toAmount)
  if(minimum<=0n||receive<minimum||receive>input.amountUnits||minimum*10000n<receive*9950n||input.amountUnits-minimum>input.amountUnits/20n) bridgeError('USDT bridge fees or minimum received are outside the supported limits.',502)
  const decoded=decodeFunctionData({abi:USDT_BRIDGE_ABI,data:t.data as Hex}) as any
  const b=decoded.args[0],across=decoded.args[decoded.args.length-1] as any
  if(b.bridge!=='across'||b.destinationChainId!==BigInt(to.chainId)||!sameAddress(b.sendingAssetId,from.address)||!sameAddress(b.receiver,input.destinationAddress)||b.hasDestinationCall
    ||!sameAddress(across.receiverAddress,pad(input.destinationAddress))||!sameAddress(across.refundAddress,pad(input.walletAddress))
    ||!sameAddress(across.sendingAssetId,pad(from.address))||!sameAddress(across.receivingAssetId,pad(to.address))||across.message!=='0x'
    ||across.fillDeadline<=Math.floor(Date.now()/1000)+60||across.quoteTimestamp>Math.floor(Date.now()/1000)+60) bridgeError('USDT bridge calldata does not match the requested delivery.',502)
  let fee=0n
  if(decoded.functionName==='swapAndStartBridgeTokensViaAcrossV4') {
    const steps=decoded.args[1]
    if(!b.hasSourceSwaps||steps.length!==1) bridgeError('USDT conversion routes are not enabled.',502)
    const s=steps[0]
    if(!sameAddress(s.callTo,FEE_FORWARDER)||!sameAddress(s.approveTo,FEE_FORWARDER)||!sameAddress(s.sendingAssetId,from.address)||!sameAddress(s.receivingAssetId,from.address)||s.fromAmount!==input.amountUnits||!s.requiresDeposit) bridgeError('Unsupported USDT source operation.',502)
    const fees=decodeFunctionData({abi:FEE_ABI,data:s.callData})
    if(!sameAddress(fees.args[0],from.address)||fees.args[1].length>4) bridgeError('Unsupported bridge fee operation.',502)
    fee=fees.args[1].reduce((sum,item)=>sum+item.amount,0n)
    const listed=(e.feeCosts||[]).filter((f:any)=>f.name==='LIFI Fixed Fee'&&f.included===true&&sameAddress(f.token?.address,from.address)).reduce((sum:bigint,f:any)=>sum+BigInt(f.amount),0n)
    if(fee!==listed||fee>input.amountUnits/100n||b.minAmount!==input.amountUnits-fee||(b.minAmount*across.outputAmountMultiplier/10n**18n)<minimum) bridgeError('USDT bridge fee or delivery amount changed.',502)
  } else if(b.hasSourceSwaps||b.minAmount!==input.amountUnits) bridgeError('Unexpected USDT bridge input.',502)
  if(across.outputAmount<minimum) bridgeError('Bridge output is below the approved minimum.',502)
  return {callData:t.data as Hex,transactionId:b.transactionId,minimum,receive}
}
export async function quoteUsdtBridge(input:Omit<UsdtBridgeQuote,'id'|'amountUnits'|'receive'|'minimumReceive'|'minimumUnits'|'fee'|'expiresAt'|'callData'|'transactionId'|'provider'>,fetcher=fetch):Promise<UsdtBridgeQuote> {
  if(input.source===input.destination||!/^\d+(\.\d{1,6})?$/.test(input.amount)||input.amount.length>40) bridgeError('Enter an amount and choose different networks.')
  const units=parseUnits(input.amount,6)
  if(units<=0n) bridgeError('Enter an amount to bridge.')
  const from=POCKET_USDT_ASSETS[input.source],to=POCKET_USDT_ASSETS[input.destination]
  const query=new URLSearchParams({fromChain:String(from.chainId),toChain:String(to.chainId),fromToken:from.address,toToken:to.address,fromAmount:String(units),fromAddress:input.walletAddress,toAddress:input.destinationAddress,slippage:'0.005',allowBridges:'across',allowDestinationCall:'false',integrator:'hashpaylink'})
  const response=await fetcher('https://li.quest/v1/quote?'+query,{headers:process.env.LIFI_API_KEY?{'x-lifi-api-key':process.env.LIFI_API_KEY}:{},signal:AbortSignal.timeout(20000)})
  if(!response.ok) bridgeError('No USDT bridge route is available for this amount and network pair.',503)
  const validated=validateUsdtBridgeQuote(await response.json(),{...input,amountUnits:units})
  const approve=(amount:bigint)=>({target:getAddress(from.address),value:0n,data:encodeFunctionData({abi:APPROVE_ABI,functionName:'approve',args:[USDT_BRIDGE_ROUTER,amount]})})
  const callData=encodeFunctionData({abi:USDT_BATCH_ABI,functionName:'executeBatch',args:[[approve(0n),approve(units),{target:USDT_BRIDGE_ROUTER,value:0n,data:validated.callData},approve(0n)]]})
  return {...input,id:randomUUID(),amount:formatUnits(units,6),amountUnits:String(units),receive:formatUnits(validated.receive,6),minimumReceive:formatUnits(validated.minimum,6),minimumUnits:String(validated.minimum),fee:formatUnits(units-validated.receive,6),expiresAt:Date.now()+45000,callData,transactionId:validated.transactionId,provider:'across'}
}
function secret(){const value=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(value.length<32)bridgeError('Stablecoin bridge signing is not configured.',503);return value}
export function sealUsdtBridgeQuote(quote:UsdtBridgeQuote,key=secret()){const body=Buffer.from(JSON.stringify(quote)).toString('base64url');return body+'.'+createHmac('sha256',key).update('pocket-usdt-bridge-v1:'+body).digest('base64url')}
export function openUsdtBridgeQuote(token:string,owner:string,allowExpired=false,key=secret()):UsdtBridgeQuote {
  if(token.length>50000)bridgeError('Invalid bridge quote.')
  const [body,signature,...extra]=token.split('.'),expected=createHmac('sha256',key).update('pocket-usdt-bridge-v1:'+body).digest(),actual=Buffer.from(signature||'','base64url')
  if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))bridgeError('Invalid bridge quote.',403)
  const quote=JSON.parse(Buffer.from(body,'base64url').toString()) as UsdtBridgeQuote
  if(quote.ownerId!==owner)bridgeError('Bridge quote belongs to another account.',403)
  if(!allowExpired&&quote.expiresAt<=Date.now())bridgeError('Quote expired. Review a new quote.',409)
  return quote
}
