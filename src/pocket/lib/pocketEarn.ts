import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { xLayer } from 'viem/chains'

// Aave DAO address book, AaveV3XLayer. This module has no signing capability.
export const POCKET_EARN_PROVIDER = '0x6C505C31714f14e8af2A03633EB2Cdfb4959138F' as const
export const POCKET_EARN_ASSETS = [
  { symbol: 'USDC', address: '0xB6CEceAB302E2E4948951eE7843FC24E92933061' },
  { symbol: 'USDT0', address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' },
] as const
const abi = parseAbi([
  'function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)',
  'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)',
  'function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)',
  'function getPaused(address asset) view returns (bool)',
])
const balanceAbi = parseAbi(['function balanceOf(address) view returns(uint256)'])
export type PocketEarnPosition = { available: bigint; earning: bigint; liquidity: bigint; active: boolean; frozen: boolean; paused: boolean }
export async function readPocketEarnPosition(symbol: string, owner: Address, signal?: AbortSignal): Promise<PocketEarnPosition> {
  const asset = POCKET_EARN_ASSETS.find(item => item.symbol === symbol)
  if (!asset) throw new Error('Unsupported Earn asset')
  const client = createPublicClient({ chain: xLayer, transport: http('https://rpc.xlayer.tech', { timeout: 12_000, retryCount: 0, fetchOptions: { signal } }) })
  const blockNumber = await client.getBlockNumber()
  const [tokens, config, paused] = await Promise.all([
    client.readContract({address:POCKET_EARN_PROVIDER,abi,functionName:'getReserveTokensAddresses',args:[asset.address],blockNumber}),
    client.readContract({address:POCKET_EARN_PROVIDER,abi,functionName:'getReserveConfigurationData',args:[asset.address],blockNumber}),
    client.readContract({address:POCKET_EARN_PROVIDER,abi,functionName:'getPaused',args:[asset.address],blockNumber}),
  ])
  if (config[0] !== 6n) throw new Error('Asset precision changed')
  const [available, earning, liquidity] = await Promise.all([
    client.readContract({address:asset.address,abi:balanceAbi,functionName:'balanceOf',args:[owner],blockNumber}),
    client.readContract({address:tokens[0],abi:balanceAbi,functionName:'balanceOf',args:[owner],blockNumber}),
    client.readContract({address:asset.address,abi:balanceAbi,functionName:'balanceOf',args:[tokens[0]],blockNumber}),
  ])
  return { available, earning, liquidity, active:config[8], frozen:config[9], paused }
}
export function supplyApyPercent(liquidityRate: bigint) {
  const apr = Number(liquidityRate) / 1e27
  const apy = Math.expm1(31_536_000 * Math.log1p(apr / 31_536_000)) * 100
  if (liquidityRate < 0n || !Number.isFinite(apy)) throw new Error('Invalid supply rate')
  return apy
}
export type PocketEarnMarket = { symbol: 'USDC' | 'USDT0'; apy: number; checkedAt: number }
export async function readPocketEarnMarkets(signal?: AbortSignal): Promise<PocketEarnMarket[]> {
  const client = createPublicClient({ chain: xLayer, transport: http('https://rpc.xlayer.tech', { timeout: 12_000, retryCount: 0, fetchOptions: { signal } }) })
  const blockNumber = await client.getBlockNumber()
  return Promise.all(POCKET_EARN_ASSETS.map(async asset => {
    const data = await client.readContract({ address: POCKET_EARN_PROVIDER, abi, functionName: 'getReserveData', args: [asset.address], blockNumber })
    // liquidityRate is supplier APR in ray units; variableBorrowRate is not yield.
    return { symbol: asset.symbol, apy: supplyApyPercent(data[5]), checkedAt: Date.now() }
  }))
}
