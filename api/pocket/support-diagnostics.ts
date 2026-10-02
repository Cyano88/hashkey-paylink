import {PrivyClient} from '@privy-io/server-auth'
import {createPublicClient,http,formatUnits,isAddress,type Address} from 'viem'
import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {stockAssets,stockUsdc,stockTokenAbi,pocketXLayer} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {createPocketBillsStore} from './bills-store.js'
import {readVtpassPhase0Config} from '../vtpass-config.js'
import {createVtpassClient} from '../vtpass-client.js'
import type {PocketActivityRow} from '../../src/pocket/models/pocketActivity.js'
export type SupportBalanceFinding={text:string;observedAt:number;asset:string;network:string;amount:string}
export async function supportStockWallet(owner:string){
 const privy=new PrivyClient((process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID)!,process.env.PRIVY_APP_SECRET!)
 const user=await privy.getUserById(owner)
 const addresses=[...new Set(user.linkedAccounts.flatMap(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy'&&isAddress(a.address)?[a.address.toLowerCase()]:[]))]
 if(addresses.length!==1)throw Error('Stock wallet could not be uniquely verified.')
 return addresses[0] as Address
}
export function supportStockAsset(value:string){return [...stockAssets,stockUsdc].find(a=>a.symbol.toLowerCase()===value.toLowerCase())}
export function supportStockClient(){return createPublicClient({chain:pocketXLayer,transport:http(process.env.XLAYER_RPC_URL||pocketXLayer.rpcUrls.default.http[0],{timeout:8000,retryCount:0,fetchOptions:{signal:AbortSignal.timeout(12000)}})})}
export async function readSupportBalance(owner:string,network:string,asset='USDC'):Promise<SupportBalanceFinding>{
 let amount:string
 if(network==='xlayer'){
  const token=asset.toUpperCase()==='OKB'?undefined:supportStockAsset(asset)
  if(!token&&asset.toUpperCase()!=='OKB')throw Error('Choose a supported asset.')
  const wallet=await supportStockWallet(owner),client=supportStockClient()
  if(await client.getChainId()!==196)throw Error('Wrong network.')
  const block=await client.getBlock({blockTag:'latest'})
  if(!block.number||!block.timestamp||Date.now()-Number(block.timestamp)*1000>60000)throw Error('Node is behind.')
  if(!token)amount=formatUnits(await client.getBalance({address:wallet,blockNumber:block.number}),18)
  else {const [units,decimals]=await Promise.all([client.readContract({address:token.address as Address,abi:stockTokenAbi,functionName:'balanceOf',args:[wallet],blockNumber:block.number}),client.readContract({address:token.address as Address,abi:stockTokenAbi,functionName:'decimals',blockNumber:block.number})]);if(decimals>36)throw Error('Invalid decimals');amount=formatUnits(units,decimals);asset=token.symbol}
 }else{
  if(!['base','arbitrum','arc','ethereum','polygon','solana'].includes(network)||asset.toUpperCase()!=='USDC')throw Error('Unsupported balance.')
  const link=await readCircleLink(circleLinkKey(owner,network,'payment'))
  if(!link||link.chain!==network||(link.purpose??'payment')!=='payment')throw Error('Receiving wallet is not verified.')
  const {readPocketNetworkBalance}=await import('./balances.js')
  const balance=await readPocketNetworkBalance(network as any,link.circleWalletAddress,true)
  if(!Number.isFinite(balance)||balance<0)throw Error('Balance unavailable.')
  amount=balance.toFixed(6).replace(/\.?0+$/,'')||'0'
 }
 const observedAt=Date.now()
 return {amount,asset,network,observedAt,text:'The current on-chain balance on '+(network==='xlayer'?'X Layer':network)+' is '+amount+' '+asset+'. This is this network and asset only. Payment fees and pending reservations can affect what you can spend. If Pocket shows a different figure, share the amount shown so support can compare it.'}
}
export async function readSupportBillStatus(owner:string,row:PocketActivityRow){
 if(row.source!=='bills'||!row.eventId.startsWith('pocket-bill:'))throw Error('Choose a bill payment.')
 const config=readVtpassPhase0Config(),store=createPocketBillsStore({config})
 const intent=await store.getOwnedIntent(owner,row.eventId.slice('pocket-bill:'.length))
 if(intent.ownerId!==owner||!intent.providerAttemptedAt||intent.providerEnvironment!==config.environment)throw Error('The original provider attempt is unavailable.')
 const result=await createVtpassClient({config,timeoutMs:8000}).requeryTransaction(intent.requestId)
 if(result.requestId!==intent.requestId)throw Error('Provider reference did not match.')
 if(intent.providerTransactionId&&result.transactionId&&intent.providerTransactionId!==result.transactionId)throw Error('Provider transaction did not match.')
 return {status:result.status,checkedAt:Date.now()}
}
