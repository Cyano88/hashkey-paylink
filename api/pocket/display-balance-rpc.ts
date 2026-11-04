import {decodeFunctionResult,encodeFunctionData,formatUnits,parseAbi,type Hex} from 'viem'
import {Connection,PublicKey} from '@solana/web3.js'
import {readEvmRpc,type ReadNetwork} from '../evm-read.js'
import {readSolanaUsdcBalance} from '../solana-balance.js'
import {solanaReadFetch} from '../solana-read.js'
import type {CircleLinkRecord} from '../privy-circle-link.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {pocketNativeOnNetwork} from '../../src/pocket/lib/pocketNativeAssets.js'
const abi=parseAbi(['function balanceOf(address) view returns(uint256)'])
export async function readDisplayTokenRpc(network:ReadNetwork,address:string,token:string):Promise<bigint>{
 const data=await readEvmRpc(network,'eth_call',[{to:token,data:encodeFunctionData({abi,functionName:'balanceOf',args:[address as Hex]})},'latest'])
 return decodeFunctionResult({abi,functionName:'balanceOf',data:data as Hex})
}
export async function readDisplayUsdtRpc(link:CircleLinkRecord){
 if(link.chain==='arc')throw Error('Unsupported token.')
 const units=link.chain==='solana'?(await readSolanaUsdcBalance(link.circleWalletAddress,solanaReadFetch,'USDT')).balance:await readDisplayTokenRpc(link.chain,link.circleWalletAddress,POCKET_USDT_ASSETS[link.chain].address)
 return Number(formatUnits(BigInt(units),6))
}
export async function readDisplayNativeRpc(link:CircleLinkRecord){
 const asset=pocketNativeOnNetwork(link.chain);if(!asset)throw Error('Unsupported native asset.')
 if(link.chain==='solana'){
  const client=new Connection('https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:solanaReadFetch})
  const account=await client.getAccountInfo(new PublicKey(link.circleWalletAddress))
  const units=account?.lamports??0;if(!Number.isSafeInteger(units)||units<0)throw Error('Invalid native balance.')
  return Number(formatUnits(BigInt(units),asset.decimals))
 }
 const raw=await readEvmRpc(link.chain,'eth_getBalance',[link.circleWalletAddress,'latest'])
 if(typeof raw!=='string'||!/^0x[0-9a-f]+$/i.test(raw))throw Error('Invalid native balance.')
 return Number(formatUnits(BigInt(raw),asset.decimals))
}
