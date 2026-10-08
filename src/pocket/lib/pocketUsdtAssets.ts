// Exact USDT assets supported for deposits; local payouts still settle on Base.
export const POCKET_USDT_ASSETS = {
  base: {address:'0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',decimals:6,chainId:8453},
  arbitrum: {address:'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',decimals:6,chainId:42161},
  ethereum: {address:'0xdAC17F958D2ee523a2206206994597C13D831ec7',decimals:6,chainId:1},
  polygon: {address:'0xc2132D05D31c914a87C6611C10748AEb04B58e8F',decimals:6,chainId:137},
  solana: {address:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',decimals:6,chainId:null},
} as const
export type PocketUsdtNetwork = keyof typeof POCKET_USDT_ASSETS
export const POCKET_USDT_NETWORKS = Object.keys(POCKET_USDT_ASSETS) as PocketUsdtNetwork[]
export function supportsPocketUsdt(network:string):network is PocketUsdtNetwork {
  return Object.prototype.hasOwnProperty.call(POCKET_USDT_ASSETS,network)
}

export function solanaUsdtUnits(result:unknown,owner:string):bigint {
  const rows=(result as any)?.value
  if(!Array.isArray(rows))throw Error('USDT balance unavailable.')
  const seen=new Set<string>()
  return rows.reduce((total:bigint,row:any)=>{
    const info=row?.account?.data?.parsed?.info
    if(typeof row?.pubkey!=='string'||seen.has(row.pubkey)||row?.account?.owner!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'||info?.mint!==POCKET_USDT_ASSETS.solana.address||info?.owner!==owner||info?.tokenAmount?.decimals!==6||!/^\d+$/.test(String(info?.tokenAmount?.amount)))throw Error('USDT balance response was invalid.')
    seen.add(row.pubkey)
    return total+BigInt(info.tokenAmount.amount)
  },0n)
}
