import {createPublicClient,defineChain,http} from 'viem'
import {ARC_AGREEMENT_NETWORK} from '../arc-agreement-config.js'
export function arcTradeClient(){
  const url=new URL(process.env.PRIVATE_RPC_URL_ARC_MAINNET||ARC_AGREEMENT_NETWORK.rpcUrl)
  if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid Arc RPC configuration.')
  const chain=defineChain({id:5042,name:'Arc',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[url.toString()]}}})
  return createPublicClient({chain,transport:http(url.toString(),{timeout:15000,retryCount:1})})
}
