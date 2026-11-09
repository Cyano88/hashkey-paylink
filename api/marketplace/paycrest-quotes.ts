import {getAddress,parseUnits} from 'viem'
import {readPaycrestOrderSnapshot} from '../paycrest-pos.js'
import {validateMarketplaceBankQuote,type MarketplaceBankQuote} from './bank-quotes.js'
import type {BankBeneficiary,BankDetails} from './bank-beneficiaries.js'

type Dependencies={now:()=>number;readOrder?:(id:string)=>Promise<unknown>;readBank:(projectId:string,beneficiaryId:string)=>Promise<BankBeneficiary|null>;decrypt:(beneficiary:BankBeneficiary)=>BankDetails;holding:{id:string;revision:string;address:string;billsAddress:string}}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Paycrest quote details are unavailable.');return value as Record<string,unknown>}
function units(value:unknown,decimals=6){
 if(typeof value!=='string'||!new RegExp('^(0|[1-9]\\d{0,23})(?:\\.\\d{1,'+decimals+'})?$').test(value))throw Error('Paycrest quote amount is invalid.')
 return parseUnits(value,decimals)
}
/** Read-only refresh of an accepted quote, not permission to create or fund an
 * order. Hash PayLink's checkout fee has already been charged to the buyer;
 * a Marketplace off-ramp must not charge another sender fee implicitly.
 */
export function createMarketplacePaycrestQuoteVerifier(input:Dependencies){
 const d={...input,holding:structuredClone(input.holding),readOrder:input.readOrder??readPaycrestOrderSnapshot}
 return async(accepted:MarketplaceBankQuote)=>{
  const started=d.now(),quote=validateMarketplaceBankQuote(structuredClone(accepted),started)
  const holding=getAddress(d.holding.address)
  if(/^0x0{40}$/i.test(holding)||holding===getAddress(d.holding.billsAddress)||quote.holdingId!==d.holding.id||quote.holdingRevision!==d.holding.revision||getAddress(quote.refundAddress)!==holding||getAddress(quote.fundingAddress)===holding||getAddress(quote.fundingAddress)===getAddress(d.holding.billsAddress))throw Error('Paycrest quote holding identity is invalid.')
  const bank=await d.readBank(quote.projectId,quote.beneficiaryId)
  if(!bank||bank.status!=='active'||bank.kind!=='bank'||bank.projectId!==quote.projectId||bank.beneficiaryId!==quote.beneficiaryId||bank.destinationDigest!==quote.destinationDigest||bank.currency!=='NGN'||bank.asset!=='USDC'||bank.network!=='base'||!bank.ownershipEvidenceId)throw Error('Paycrest quote beneficiary is no longer verified.')
  const details=d.decrypt(bank),data=object(await d.readOrder(quote.providerOrderId)),source=object(data.source),destination=object(data.destination),recipient=object(destination.recipient),account=object(data.providerAccount)
  if(data.id!==quote.providerOrderId||data.status!=='initiated'||data.statusDetail==='under_review')throw Error('Paycrest order is not available for funding.')
  if(source.type!=='crypto'||source.currency!=='USDC'||source.network!=='base'||getAddress(String(source.refundAddress))!==holding||destination.type!=='fiat'||destination.currency!=='NGN'||account.network!=='base'||account.currency!=='USDC'||getAddress(String(account.receiveAddress))!==getAddress(quote.fundingAddress))throw Error('Paycrest order route changed.')
  if(recipient.institution!==details.bankCode||recipient.accountIdentifier!==details.accountNumber||recipient.accountName!==details.accountName)throw Error('Paycrest bank destination changed.')
  if(typeof account.validUntil!=='string'||Date.parse(account.validUntil)!==quote.expiresAt)throw Error('Paycrest order expiry changed.')
  const principal=units(data.amount),senderFee=units(data.senderFee),providerFee=units(data.transactionFee),total=principal+senderFee+providerFee
  if(senderFee!==0n||data.senderFeePercent!==undefined&&units(data.senderFeePercent)!==0n)throw Error('Marketplace payout must not duplicate the checkout platform fee.')
  if(principal!==BigInt(quote.netUnits)||providerFee!==BigInt(quote.feeUnits)||total!==BigInt(quote.fundingUnits))throw Error('Paycrest funding amount or fees changed.')
  // If the provider supplies explicit funding totals, every one must agree.
  for(const explicit of [account.amountToTransfer,data.amountToPay,data.totalAmount,data.amountDue,source.amount])if(explicit!==undefined&&units(explicit)!==total)throw Error('Paycrest funding instructions conflict.')
  const rate=units(data.rate,18)
  if(quote.exchangeRate!==undefined&&rate!==units(quote.exchangeRate,18))throw Error('Paycrest exchange rate changed.')
  if(rate<=0n||(principal*rate+5n*10n**21n)/10n**22n!==BigInt(quote.ngnMinor))throw Error('Paycrest NGN quote amount changed.')
  for(const field of ['amountPaid','amountReturned','percentSettled'] as const)if(data[field]!==undefined&&units(data[field])!==0n)throw Error('Paycrest order already has payment activity.')
  for(const field of ['txHash','transactionHash','depositTxHash'] as const)if(data[field])throw Error('Paycrest order already has a transaction reference.')
  const current=await d.readBank(quote.projectId,quote.beneficiaryId)
  if(!current||JSON.stringify(current)!==JSON.stringify(bank))throw Error('Paycrest beneficiary changed during quote verification.')
  const now=d.now()
  if(now<started||now-started>5000)throw Error('Paycrest quote refresh became stale.')
  return validateMarketplaceBankQuote(quote,now)
 }
}
