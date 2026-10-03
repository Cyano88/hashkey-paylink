import {getAddress,zeroAddress,type Address} from 'viem'
import {ARC_AGREEMENT_NETWORK} from '../arc-agreement-config.js'
import {ARC_TRADE_RELEASE,type ArcTradeRelease} from './arc.js'
import {ARC_TRADE_EXECUTION_POLICY,verifyArcTradeExecutionAccount,type ArcTradeExecutionPolicy,type ArcTradeExecutionReader} from './arc-execution.js'
import {verifyArcTradeAuthority,verifyArcTradeFactory,type ArcTradeReader} from './arc-verification.js'

export type ArcPreflightReader=ArcTradeReader & ArcTradeExecutionReader
type Manifest={release:ArcTradeRelease|null;executionPolicy:ArcTradeExecutionPolicy|null}
const remaining=['Hash PayStream hosted Trade lifecycle and receipt validation','Reviewer production validation','Final XLayer two-signer split evidence']
// An inspection result is never authorization to enable, sign or deploy.
export async function inspectArcTradeRelease(input:{manifest:Manifest;wallets:readonly string[];reader:()=>ArcPreflightReader;now?:number}){
  const blockers:string[]=[]
  const {release,executionPolicy}=input.manifest
  if(!release)blockers.push('Arc Trade release is not configured.')
  if(!executionPolicy)blockers.push('Circle execution policy is not configured.')
  let wallets:Address[]=[]
  try{
    if(input.wallets.length!==2)throw Error()
    wallets=input.wallets.map(value=>getAddress(value))
    if(wallets.includes(zeroAddress)||new Set(wallets).size!==2)throw Error()
    if(release&&wallets.some(value=>[getAddress(release.factory),getAddress(release.arbiter),ARC_AGREEMENT_NETWORK.usdc].includes(value)))throw Error()
  }catch{blockers.push('Provide distinct buyer and seller Circle wallet addresses, separate from the deployment roles.')}
  const base={chainId:5042,productionReady:false as const,remaining}
  if(blockers.length||!release||!executionPolicy)return {...base,checksPassed:false,blockers}
  let stage='RPC and canonical block'
  try{
    const reader=input.reader()
    if(await reader.getChainId()!==5042)throw Error('Arc mainnet chain ID mismatch.')
    const head=await reader.getBlockNumber({cacheTime:0})
    if(head<=5n)throw Error('Insufficient confirmed Arc history.')
    const confirmed=head-5n
    const snapshots=await Promise.all([confirmed,head].map(async blockNumber=>({blockNumber,...await reader.getBlock({blockNumber})})))
    const now=BigInt(Math.floor((input.now??Date.now())/1000))
    for(const block of snapshots){
      stage='Canonical block'
      if(!block.hash||!/^0x[0-9a-f]{64}$/i.test(block.hash)||/^0x0{64}$/i.test(block.hash)||typeof block.timestamp!=='bigint'||block.timestamp>now+30n||block.timestamp<now-300n)throw Error('Arc block is missing or stale.')
      stage='Trade factory and USDC'
      await verifyArcTradeFactory(reader,release,block.blockNumber)
      stage='Two-signer Safe'
      await verifyArcTradeAuthority(reader,release,block.blockNumber)
      // Pin wallet checks to the same block as deployment and authority checks.
      const pinned:ArcTradeExecutionReader={
        getChainId:()=>reader.getChainId(),getBlockNumber:async()=>block.blockNumber,
        getBlock:i=>reader.getBlock(i),getCode:i=>reader.getCode(i),getStorageAt:i=>reader.getStorageAt(i),
        getTransaction:i=>reader.getTransaction(i),getTransactionReceipt:i=>reader.getTransactionReceipt(i),
        ...(reader.call?{call:(i:{to:Address;data:`0x${string}`;blockNumber:bigint})=>reader.call!(i)}:{}),
      }
      stage='Circle wallet execution policy'
      for(const wallet of wallets)await verifyArcTradeExecutionAccount(wallet,executionPolicy,pinned)
    }
    stage='Canonical block recheck'
    for(const block of snapshots){
      if((await reader.getBlock({blockNumber:block.blockNumber})).hash!==block.hash)throw Error('Arc chain changed during preflight.')
    }
    if(await reader.getChainId()!==5042)throw Error('Arc network changed during preflight.')
    return {...base,checksPassed:true,blockers,confirmedBlock:confirmed.toString(),headBlock:head.toString(),blockHashes:snapshots.map(block=>block.hash)}
  }catch{
    // RPC exceptions can contain credential-bearing URLs. Keep reports sanitized.
    return {...base,checksPassed:false,blockers:[`${stage} verification failed.`]}
  }
}
export function preflightArcTradeRelease(wallets:readonly string[],reader:()=>ArcPreflightReader){
  return inspectArcTradeRelease({manifest:{release:ARC_TRADE_RELEASE,executionPolicy:ARC_TRADE_EXECUTION_POLICY},wallets,reader})
}
