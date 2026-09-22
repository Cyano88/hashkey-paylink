import { createPublicClient, encodeFunctionData, formatUnits, getAddress, http, isAddress, parseAbi, parseUnits, type Address, type Hex } from 'viem'
import { xLayer } from 'viem/chains'
import catalogue from './pocketXStocksCatalog.json'

export const pocketXLayer = { ...xLayer, rpcUrls: { default: { http: ['https://rpc.xlayer.tech'] } } }
export const stockClient = createPublicClient({ chain: pocketXLayer, transport: http(pocketXLayer.rpcUrls.default.http[0], { timeout: 15_000, retryCount: 1 }) })
export const stockTokenAbi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function transfer(address,uint256) returns (bool)'])
export type StockAsset = { symbol: string; name: string; address: string; icon: string }
export const stockAssets: StockAsset[] = catalogue.assets
export const stockUsdc: StockAsset = { symbol: 'USDC', name: 'USD Coin', address: '0xB6CEceAB302E2E4948951eE7843FC24E92933061', icon: '' }
export const stockGasAsset: StockAsset = { symbol: 'OKB', name: 'OKB', address: 'native', icon: '' }
export type StockHolding = { asset: StockAsset; units: bigint; decimals: number }
export type StockTransfer = { owner: Address; recipient: Address; asset: StockAsset; amount: string; units: bigint; decimals: number; to: Address; data?: Hex; value: bigint; gas: bigint; fee: bigint; expiresAt: number }

export function stockAmountUnits(amount: string, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || (amount.split('.')[1]?.length || 0) > decimals) throw Error('Enter a valid amount within the asset precision.')
  const units = parseUnits(amount, decimals)
  if (units <= 0n || units >= 2n ** 256n) throw Error('Enter an amount greater than zero.')
  return units
}
export async function assertStockChain() {
  if (await stockClient.getChainId() !== 196) throw Error('X Layer connection could not be verified.')
}
export async function readStockHoldings(owner: Address) {
  await assertStockChain()
  const blockNumber = await stockClient.getBlockNumber()
  const balances = await stockClient.multicall({ blockNumber, batchSize: 16_384, contracts: stockAssets.map(a => ({ address: getAddress(a.address), abi: stockTokenAbi, functionName: 'balanceOf' as const, args: [owner] as const })) })
  const held = balances.flatMap((r, i) => r.status === 'success' && r.result > 0n ? [{ asset: stockAssets[i], units: r.result }] : [])
  const decimals = held.length ? await stockClient.multicall({ blockNumber, batchSize: 16_384, contracts: held.map(h => ({ address: getAddress(h.asset.address), abi: stockTokenAbi, functionName: 'decimals' as const })) }) : []
  const holdings: StockHolding[] = held.flatMap((h, i) => decimals[i]?.status === 'success' ? [{ ...h, decimals: Number(decimals[i].result) }] : [])
  return { holdings, complete: balances.every(r => r.status === 'success') && holdings.length === held.length, gas: await stockClient.getBalance({ address: owner, blockNumber }) }
}
export async function prepareStockTransfer(owner: Address, asset: StockAsset, recipientInput: string, amount: string): Promise<StockTransfer> {
  await assertStockChain()
  if (!isAddress(recipientInput, { strict: true }) || /^0x0{40}$/i.test(recipientInput)) throw Error('Enter a valid X Layer recipient address.')
  const recipient = getAddress(recipientInput)
  if (recipient.toLowerCase() === owner.toLowerCase()) throw Error('Choose a recipient other than your own wallet.')
  if (asset.address !== 'native' && ![stockUsdc, ...stockAssets].some(a => a.address.toLowerCase() === asset.address.toLowerCase())) throw Error('Unsupported stock contract.')
  const native = asset.address === 'native'
  const decimals = native ? 18 : await stockClient.readContract({ address: getAddress(asset.address), abi: stockTokenAbi, functionName: 'decimals' })
  const units = stockAmountUnits(amount, decimals)
  const balance = native ? await stockClient.getBalance({ address: owner }) : await stockClient.readContract({ address: getAddress(asset.address), abi: stockTokenAbi, functionName: 'balanceOf', args: [owner] })
  if (units > balance) throw Error('Insufficient ' + asset.symbol + ' balance.')
  const to = native ? recipient : getAddress(asset.address)
  const data = native ? undefined : encodeFunctionData({ abi: stockTokenAbi, functionName: 'transfer', args: [recipient, units] })
  const value = native ? units : 0n
  if (!native) {
    const result = await stockClient.simulateContract({ account: owner, address: to, abi: stockTokenAbi, functionName: 'transfer', args: [recipient, units] })
    if (result.result !== true) throw Error('This stock contract did not accept the transfer.')
  }
  const gas = await stockClient.estimateGas({ account: owner, to, data, value })
  const fee = gas * await stockClient.getGasPrice() * 120n / 100n
  const gasBalance = native ? balance : await stockClient.getBalance({ address: owner })
  if (gasBalance < value + fee) throw Error('Add OKB on X Layer to cover the network fee.')
  return { owner, recipient, asset, amount, units, decimals, to, data, value, gas, fee, expiresAt: Date.now() + 60_000 }
}
export const stockQuantity = (units: bigint, decimals: number) => formatUnits(units, decimals)
