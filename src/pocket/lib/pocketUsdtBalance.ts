import {formatUnits,isAddress,parseAbi,type Address} from 'viem'
import {POCKET_USDT_ASSETS,solanaUsdtUnits,type PocketUsdtNetwork} from './pocketUsdtAssets'
import {pocketApiUrl} from './pocketRoutes'
export async function readPocketUsdtBalance(network:PocketUsdtNetwork,address:string,getAccessToken:()=>Promise<string|null>) {
  const asset=POCKET_USDT_ASSETS[network]
  let units:bigint
  if(network==='solana') {
    const token=await getAccessToken()
    if(!token)throw Error('Sign in to refresh USDT.')
    const rpc=async(method:string,params:unknown[])=>{
      const response=await fetch(pocketApiUrl('/api/pocket/solana-rpc'),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(25000)})
      const body=await response.json()
      if(!response.ok||body.error)throw Error('Solana USDT balance unavailable.')
      return body.result
    }
    if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Solana network could not be verified.')
    units=solanaUsdtUnits(await rpc('getTokenAccountsByOwner',[address,{mint:asset.address},{encoding:'jsonParsed',commitment:'confirmed'}]),address)
  } else {
    if(!isAddress(address))throw Error('Wallet address is invalid.')
    const {EVM_CLIENTS}=await import('../../lib/router')
    const client=EVM_CLIENTS[network]
    if(await client.getChainId()!==asset.chainId)throw Error('USDT network could not be verified.')
    units=await client.readContract({address:asset.address as Address,abi:parseAbi(['function balanceOf(address) view returns (uint256)']),functionName:'balanceOf',args:[address as Address]})
  }
  return {units,amount:Number(formatUnits(units,asset.decimals))}
}
