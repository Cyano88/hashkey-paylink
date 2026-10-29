import {isAddress} from 'viem'
import {PublicKey} from '@solana/web3.js'
const chainIds:Record<string,string>={ethereum:'1',base:'8453',arbitrum:'42161',polygon:'137',arc:'5042',xlayer:'196',bsc:'56'}
export function pocketWalletAddressCode(raw:string,network:string):string {
 let address=raw.trim()
 if(address.length>2048)throw Error('This is not a wallet address.')
 if(address.startsWith('ethereum:')){
  if(network==='solana')throw Error('Use a Solana wallet address.')
  const match=/^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\?[^#]*)?$/.exec(address)
  if(!match)throw Error('Scan a wallet address, not a payment request.')
  if(match[2]&&match[2]!==chainIds[network])throw Error('This address QR is for a different network.')
  address=match[1]
 }else if(address.startsWith('solana:')){
  if(network!=='solana')throw Error('Use an address for the selected network.')
  address=address.slice(7).split('?')[0]
 }
 if(network==='solana'){
  try { if(new PublicKey(address).toBase58()!==address)throw Error() }catch{throw Error('Use a valid Solana wallet address.')}
 }else if(!isAddress(address))throw Error('Use a valid wallet address for this network.')
 return address
}
