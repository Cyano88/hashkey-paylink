import {createPublicClient,defineChain,fallback,http} from 'viem'
import {ARC_AGREEMENT_NETWORK} from '../arc-agreement-config.js'
export function arcTradeClient(env:NodeJS.ProcessEnv=process.env){
  const url=new URL(env.PRIVATE_RPC_URL_ARC_MAINNET||ARC_AGREEMENT_NETWORK.rpcUrl)
  if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid Arc RPC configuration.')
  const urls=[...new Set([url.toString(),ARC_AGREEMENT_NETWORK.rpcUrl,ARC_AGREEMENT_NETWORK.rpcFallbackUrl].map(value=>new URL(value).toString()))]
  const chain=defineChain({id:5042,name:'Arc',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:urls}}})
  // Match the existing Arc activation failover. A throttled primary must not
  // strand confirmed participant actions; the planner still verifies chain,
  // runtime, terms and confirmed block identity before offering an action.
  return createPublicClient({chain,transport:fallback(urls.map(rpc=>http(rpc,{timeout:12000,retryCount:0})),{retryCount:1})})
}
