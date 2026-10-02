import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {formatUnits,isAddress} from 'viem'
export type SupportChainFinding={status:'included'|'not_found'|'unmatched'|'unavailable';text:string}
const chains={base:{id:8453,token:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',env:'PRIVATE_RPC_URL',url:'https://mainnet.base.org'},arbitrum:{id:42161,token:'0xaf88d065e77c8cc2239327c5edb3a432268e5831',env:'PRIVATE_RPC_URL_ARB',url:'https://arb1.arbitrum.io/rpc'},polygon:{id:137,token:'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',env:'PRIVATE_RPC_URL_POLYGON',url:'https://polygon-bor-rpc.publicnode.com'},ethereum:{id:1,token:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',env:'PRIVATE_RPC_URL_ETHEREUM',url:'https://ethereum-rpc.publicnode.com'},arc:{id:5042,token:'0xfffffffffffffffffffffffffffffffffffffffe',env:'PRIVATE_RPC_URL_ARC_MAINNET',url:'https://rpc.mainnet.arc.io'}} as const
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
type Dependencies={wallet:(owner:string,network:string)=>Promise<string|undefined>;rpc:(url:string,method:string,params:unknown[],signal:AbortSignal)=>Promise<any>}
const dependencies:Dependencies={wallet:async(owner,network)=>(await readCircleLink(circleLinkKey(owner,network,'payment')))?.circleWalletAddress,rpc:async(url,method,params,signal)=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal});if(!response.ok)throw Error('Provider unavailable');const data=await response.json();if(data.error||!Object.hasOwn(data,'result'))throw Error('Provider unavailable');return data.result}}
export async function checkSupportIncomingUsdc(owner:string,network:string,hash:string,overrides:Partial<Dependencies>={}):Promise<SupportChainFinding>{
 const d={...dependencies,...overrides};const config=chains[network as keyof typeof chains]
 if(!config||!/^0x[a-fA-F0-9]{64}$/.test(hash))return {status:'unavailable',text:'Support does not have a live USDC check for this network or reference format yet. The team can investigate with these details.'}
 try{
  const wallet=await d.wallet(owner,network)
  if(!wallet||!isAddress(wallet))return {status:'unavailable',text:'I could not verify your receiving wallet for this network. Check the address in Receive or ask Pocket Support to investigate.'}
  const signal=AbortSignal.timeout(8000),url=process.env[config.env]?.trim()||config.url
  const [id,receipt]=await Promise.all([d.rpc(url,'eth_chainId',[],signal),d.rpc(url,'eth_getTransactionReceipt',[hash],signal)])
  if(BigInt(id)!==BigInt(config.id))throw Error('Wrong provider network')
  if(!receipt)return {status:'not_found',text:'The network has not returned a mined receipt for this hash. It may be pending, on a different network, or incorrect. I cannot confirm failure. Check the hash and network with the sender; do not repeat a payment just because it is missing here.'}
  if(receipt.transactionHash?.toLowerCase()!==hash.toLowerCase())throw Error('Wrong receipt')
  if(receipt.status!=='0x1')return {status:'unmatched',text:'This hash does not show a successful on-chain transaction. I cannot establish that it was a payment to your Pocket wallet. Ask the sender to check the original transaction; support can review the reference.'}
  const to='0x'+wallet.slice(2).toLowerCase().padStart(64,'0')
  let amount=0n
  for(const log of receipt.logs||[]){if(log.removed||String(log.address).toLowerCase()!==config.token||log.topics?.[0]?.toLowerCase()!==transfer||log.topics?.[2]?.toLowerCase()!==to)continue;if(!/^0x[a-f0-9]{64}$/i.test(log.data))throw Error('Invalid transfer');amount+=BigInt(log.data)}
  if(amount<=0n)return {status:'unmatched',text:'This transaction does not contain a supported USDC transfer to your current Pocket address on this network. That can happen with a different token, network or address. I cannot determine which from this reference alone. Check the receiving details with the sender or ask support to investigate.'}
  if(!/^0x[a-f0-9]+$/i.test(receipt.blockNumber)||!/^0x[a-f0-9]{64}$/i.test(receipt.blockHash))throw Error('Invalid block')
  const block=await d.rpc(url,'eth_getBlockByNumber',[receipt.blockNumber,false],signal)
  if(block?.hash?.toLowerCase()!==receipt.blockHash.toLowerCase()||block.number!==receipt.blockNumber)throw Error('Noncanonical receipt')
  return {status:'included',text:'A live network check found '+formatUnits(amount,network==='arc'?18:6)+' USDC included in a successful transaction to your current Pocket address on '+network+'. This verifies the incoming transfer, not your current spendable balance or a bank payout. If it is still missing in Pocket, the team should review activity indexing and the wallet balance; do not send it again.'}
 }catch{return {status:'unavailable',text:'The live network check could not be completed. I cannot confirm success or failure. Keep the reference and try again shortly, or ask Pocket Support to investigate.'}}
}
