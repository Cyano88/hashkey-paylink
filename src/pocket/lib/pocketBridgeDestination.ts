import bs58 from 'bs58'
import {isAddress} from 'viem'

export const POCKET_CIRCLE_BRIDGE_NETWORKS=['base','arc','arbitrum','ethereum','polygon','solana'] as const
export type PocketCircleBridgeNetwork=typeof POCKET_CIRCLE_BRIDGE_NETWORKS[number]
export const isPocketBridgeDestination=(value:unknown):value is PocketCircleBridgeNetwork=>POCKET_CIRCLE_BRIDGE_NETWORKS.includes(value as PocketCircleBridgeNetwork)
export function validBridgeDestination(network:unknown,address:unknown):address is string {
 if(!isPocketBridgeDestination(network)||typeof address!=='string')return false
 if(network!=='solana')return isAddress(address)&&!/^0x0{40}$/i.test(address)
 try{const bytes=bs58.decode(address);return bytes.length===32&&bytes.some(b=>b!==0)&&bs58.encode(bytes)===address}catch{return false}
}
export const sameBridgeDestination=(network:string,a:string,b:string)=>network==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
