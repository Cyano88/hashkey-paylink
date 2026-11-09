import {randomUUID} from 'node:crypto'
import {formatUnits,getAddress} from 'viem'
import {createCircleDeveloperTreasuryClient,type CircleTreasuryConfig} from '../circle-developer-treasury.js'
import {readEthUsdcRate,nativeFeeToUsdcUnits} from '../payment-network-fees.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {validateMarketplaceWalletQuote,type MarketplaceWalletQuote} from './wallet-quotes.js'
import type {RefundReservation} from './refunds.js'
import type {RefundFeeQuote} from './fee-reserve.js'

type Dependencies={config:CircleTreasuryConfig;now?:()=>number;maximumFeeUnits:string;providerSurchargeBps:number;
 estimate?:ReturnType<typeof createCircleDeveloperTreasuryClient>['estimateUsdcTransfer'];rate?:()=>Promise<bigint>}
/** Quotes only. A successful estimate is not proof of Gas Station sponsorship.
 * Callers separately verify provider coverage before submission. */
export function createMarketplaceGasQuotes(input:Dependencies){
 const now=input.now??Date.now,estimate=input.estimate??createCircleDeveloperTreasuryClient({config:input.config,purpose:'marketplace'}).estimateUsdcTransfer,rate=input.rate??(()=>readEthUsdcRate())
 if(!/^[1-9]\d{0,23}$/.test(input.maximumFeeUnits)||!Number.isSafeInteger(input.providerSurchargeBps)||input.providerSurchargeBps<0||input.providerSurchargeBps>10000)throw Error('Explicit bounded gas reimbursement policy is required.')
 async function networkFee(recipient:string,amountUnits:string){
  const started=now(),address=getAddress(recipient)
  if(address===getAddress(input.config.treasuryAddress)||/^0x0{40}$/i.test(address)||!/^[1-9]\d{0,23}$/.test(amountUnits))throw Error('Invalid payout fee estimate binding.')
  const [gas,conversion]=await Promise.all([estimate({destinationAddress:address,amount:formatUnits(BigInt(amountUnits),6),tokenAddress:BASE_STABLECOINS.USDC.address}),rate()])
  if(now()<started||now()-started>15000||gas.asset!=='ETH'||gas.blockchain!=='BASE')throw Error('Gas estimate became stale or changed route.')
  const raw=nativeFeeToUsdcUnits(gas.networkFee,conversion),fee=(raw*BigInt(10000+input.providerSurchargeBps)+9999n)/10000n
  if(fee>BigInt(input.maximumFeeUnits))throw Error('Network fee exceeds the permitted quote limit.')
  return fee
 }
 return {networkFee,
  async wallet(binding:Pick<MarketplaceWalletQuote,'projectId'|'paymentId'|'operationId'|'allocationId'|'beneficiaryId'|'recipient'|'debitUnits'>){
   const b=structuredClone(binding),started=now()
   if(!/^[1-9]\d{0,23}$/.test(b.debitUnits))throw Error('Invalid wallet withdrawal debit.')
   let fee=await networkFee(b.recipient,b.debitUnits)
   // Re-estimate the actual net transfer; keep the larger fixed quote, never
   // silently reduce the accepted recipient amount at execution time.
   for(let i=0;i<3;i++){
    const net=BigInt(b.debitUnits)-fee;if(net<=0n)throw Error('Withdrawal cannot cover its network fee.')
    const actual=await networkFee(b.recipient,net.toString())
    if(actual<=fee){if(now()-started>30000)throw Error('Wallet quote became stale.');return validateMarketplaceWalletQuote({...b,quoteId:randomUUID(),recipient:getAddress(b.recipient),asset:'USDC',network:'base',feePayer:'allocation',feePolicy:'fixed_success_only',networkFeeUnits:fee.toString(),recipientUnits:net.toString(),issuedAt:now(),expiresAt:now()+60000},now())}
    fee=actual
   }
   throw Error('Network estimate is unstable; request a new quote.')
  },
  async refund(reservation:RefundReservation):Promise<RefundFeeQuote>{
   const r=structuredClone(reservation)
   if(r.collection.asset!=='USDC'||r.collection.network!=='base'||getAddress(r.collection.holdingAddress)!==getAddress(input.config.treasuryAddress))throw Error('Refund gas route mismatch.')
   const fee=await networkFee(r.collection.payerWallet,r.amountUnits)
   return {quoteId:randomUUID(),projectId:r.collection.projectId,paymentId:r.collection.paymentId,refundId:r.refundId,amountUnits:r.amountUnits,networkFeeUnits:fee.toString(),expiresAt:now()+60000}
  },
 }
}
