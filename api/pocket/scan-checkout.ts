import { isAddress } from 'viem'
import { parsePocketScanCode } from '../../src/pocket/lib/pocketScanCode.js'
type Merchant = {merchant_id:string;display_name:string;payout_preference:string;settlement_enabled:boolean;source?:string;kyc_status?:string;circle_smart_wallet_address:string;solana_wallet_address?:string;supported_networks?:string[];encrypted_bank_details?:unknown;bank_name?:string;bank_last4?:string;bank_account_name?:string}
type Intent = {merchant_id:string;amount_ngn:string;estimated_amount_usdc:string;expires_at:string}
export function resolvePocketPosCheckout(merchant:Merchant, raw:string, intent?:Intent) {
 const parsed=parsePocketScanCode(raw)
 if(parsed.kind!=='pos'||parsed.id!==merchant.merchant_id||!merchant.settlement_enabled||merchant.kyc_status==='RESTRICTED'||(merchant.source&&merchant.source!=='pos'))throw Error('This merchant checkout is unavailable.')
 const input=new URL(parsed.url).searchParams
 const fiat=merchant.payout_preference==='INSTANT_FIAT'
 if(!fiat&&merchant.payout_preference!=='KEEP_CRYPTO')throw Error('Unsupported merchant settlement.')
 if(fiat&&!merchant.encrypted_bank_details)throw Error('Merchant bank settlement is unavailable.')
 const network=fiat?'base':input.get('n')||input.get('net')||'base'
 if(!['base','arbitrum','arc'].includes(network)||!(merchant.supported_networks||['base']).includes(network))throw Error('This network is not supported by the merchant.')
 if(!fiat && (network==='solana' ? !merchant.solana_wallet_address : !isAddress(merchant.circle_smart_wallet_address)))throw Error('Merchant payment wallet is unavailable.')
 const amount=(value:string|null,decimals:number)=>{
  if(!value)return ''
  if(!new RegExp('^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,'+decimals+'})?$').test(value)||Number(value)<=0)throw Error('This checkout amount is invalid.')
  return value
 }
 let usdc=amount(input.get('a')||input.get('amt'),6),ngn=amount(input.get('ngn'),2)
 const intentId=input.get('intent')||''
 if(intentId){
  if(!fiat||!intent||intent.merchant_id!==merchant.merchant_id||!Number.isFinite(Date.parse(intent.expires_at))||Date.parse(intent.expires_at)<=Date.now())throw Error('This checkout quote expired. Ask the merchant for a fresh QR.')
  usdc=amount(intent.estimated_amount_usdc,6);ngn=amount(intent.amount_ngn,2)
 }
 if(fiat&&!intentId&&(ngn||usdc))throw Error('A fixed Naira checkout needs a current merchant quote. Ask for a fresh QR.')
 const fixed=fiat?!!ngn:!!usdc
 const params=new URLSearchParams({src:'ngpos',merchant:merchant.merchant_id,m:merchant.display_name,n:network,settlement:fiat?'instant_fiat':'keep_crypto'})
 if(fixed){if(usdc)params.set('a',usdc);if(ngn)params.set('ngn',ngn)}else params.set('f','1')
 if(fiat){params.set('offramp','paycrest');params.set('fx','NGN');params.set('fs','1');if(intentId)params.set('intent',intentId);if(merchant.bank_name)params.set('bank',merchant.bank_name);if(merchant.bank_last4)params.set('acct','****'+merchant.bank_last4);if(merchant.bank_account_name)params.set('acctName',merchant.bank_account_name)}
 else params.set(network==='solana'?'s':'e',network==='solana'?merchant.solana_wallet_address!:merchant.circle_smart_wallet_address)
 return {merchantName:merchant.display_name,settlement:fiat?'NGN':'USDC',paymentUrl:'/pay?'+params.toString()}
}
