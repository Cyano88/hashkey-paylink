import {createPublicClient,http} from 'viem'
import {base,arbitrum,mainnet,polygon,bsc,xLayer} from 'viem/chains'
import {arcChain} from '../../src/lib/chains.js'

export const INBOUND_EVM_SOURCES=['base','arbitrum','ethereum','polygon','arc'] as const
export type InboundEvmSource=typeof INBOUND_EVM_SOURCES[number]
export const isInboundEvmSource=(value:unknown):value is InboundEvmSource=>INBOUND_EVM_SOURCES.includes(value as InboundEvmSource)
export const inboundChains={base,arbitrum,ethereum:mainnet,polygon,arc:arcChain,bsc,xlayer:xLayer}
export function inboundBridgeClient(network:keyof typeof inboundChains){
 return createPublicClient({chain:inboundChains[network],transport:http(process.env['PRIVATE_RPC_URL_'+network.toUpperCase()]||undefined,{timeout:15000})})
}
