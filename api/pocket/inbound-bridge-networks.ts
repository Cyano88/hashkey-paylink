import {createPublicClient,http} from 'viem'
import {base,arbitrum,mainnet,polygon,bsc,xLayer} from 'viem/chains'
import {arcChain} from '../../src/lib/chains.js'

export const INBOUND_EVM_SOURCES=['base','arbitrum','ethereum','polygon','arc'] as const
export type InboundEvmSource=typeof INBOUND_EVM_SOURCES[number]
export const isInboundEvmSource=(value:unknown):value is InboundEvmSource=>INBOUND_EVM_SOURCES.includes(value as InboundEvmSource)
export const inboundChains={base,arbitrum,ethereum:mainnet,polygon,arc:arcChain,bsc,xlayer:xLayer}
const rpcEnvironment={base:'PRIVATE_RPC_URL',arbitrum:'PRIVATE_RPC_URL_ARB',ethereum:'PRIVATE_RPC_URL_ETHEREUM',polygon:'PRIVATE_RPC_URL_POLYGON',arc:'PRIVATE_RPC_URL_ARC_MAINNET',bsc:'PRIVATE_RPC_URL_BSC',xlayer:'PRIVATE_RPC_URL_XLAYER'} as const
export const inboundBridgeRpcUrl=(network:keyof typeof inboundChains,env:NodeJS.ProcessEnv=process.env)=>env[rpcEnvironment[network]]||undefined
export function inboundBridgeClient(network:keyof typeof inboundChains,env:NodeJS.ProcessEnv=process.env){
 return createPublicClient({chain:inboundChains[network],transport:http(inboundBridgeRpcUrl(network,env),{timeout:15000,retryCount:0})})
}
