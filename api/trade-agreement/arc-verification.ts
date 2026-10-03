import { getAddress, isAddress, keccak256, parseAbi, zeroAddress, type Abi, type Address, type Hex } from 'viem'
import { ARC_AGREEMENT_NETWORK } from '../arc-agreement-config.js'
import { ARC_TRADE_POLICY, type ArcTradeRelease } from './arc.js'

export type ArcTradeReader = {
  getChainId(): Promise<number>
  getBlockNumber(input?: {cacheTime?:number}): Promise<bigint>
  getBlock(input: {blockNumber:bigint}): Promise<{hash:Hex|null;timestamp:bigint}>
  getCode(input: {address:Address;blockNumber?:bigint}): Promise<Hex|undefined>
  readContract(input: {address:Address;abi:Abi;functionName:string;args?:readonly unknown[];blockNumber?:bigint}): Promise<unknown>
  call(input: {account:Address;to:Address;data:Hex;value:bigint}): Promise<unknown>
}
export const ARC_TRADE_FACTORY_ABI = parseAbi([
  'function token() view returns(address)', 'function arbiter() view returns(address)',
  'function escrows(bytes32) view returns(address)',
  'function create((bytes32 offerId,bytes32 termsHash,address buyer,address seller,address arbiter,address token,uint256 amount,uint64 fundBy,uint32 dispatchWindow,uint32 deliveryWindow,uint32 inspectionWindow) terms) returns(address)',
])
const safeAbi = parseAbi([
  'function masterCopy() view returns(address)', 'function VERSION() view returns(string)',
  'function getOwners() view returns(address[])', 'function getThreshold() view returns(uint256)',
  'function getModulesPaginated(address,uint256) view returns(address[],address)',
])
const tokenAbi = parseAbi(['function decimals() view returns(uint8)'])
export const MODULE_SENTINEL = '0x0000000000000000000000000000000000000001' as const
export function address(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value)) throw Error('Invalid Trade address.')
  return getAddress(value)
}
export function unsigned(value: unknown): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  throw Error('Invalid Trade chain value.')
}
function hash(value: unknown): value is Hex { return typeof value === 'string' && /^0x[a-f0-9]{64}$/i.test(value) && !/^0x0{64}$/i.test(value) }
export function assertArcTradeRelease(release: ArcTradeRelease) {
  if (release.policy !== ARC_TRADE_POLICY || release.chainId !== 5042 || !hash(release.factoryRuntimeHash)) throw Error('Unverified Arc Trade release.')
  const fixed = [release.factory,release.arbiter,ARC_AGREEMENT_NETWORK.usdc].map(address)
  if (fixed.includes(zeroAddress) || new Set(fixed).size !== fixed.length) throw Error('Invalid Arc Trade deployment roles.')
}
async function codeMatches(reader: ArcTradeReader, target: Address, expected: Hex, blockNumber?: bigint) {
  const code = await reader.getCode({address:target,blockNumber})
  if (!code || code === '0x' || keccak256(code) !== expected) throw Error('Arc Trade runtime does not match the reviewed release.')
}
export async function verifyArcTradeFactory(reader: ArcTradeReader, release: ArcTradeRelease, blockNumber?: bigint) {
  assertArcTradeRelease(release)
  if (await reader.getChainId() !== 5042) throw Error('Arc Trade network mismatch.')
  await codeMatches(reader,release.factory,release.factoryRuntimeHash,blockNumber)
  const read = (functionName:string) => reader.readContract({address:release.factory,abi:ARC_TRADE_FACTORY_ABI,functionName,blockNumber})
  if (address(await read('token')) !== ARC_AGREEMENT_NETWORK.usdc || address(await read('arbiter')) !== address(release.arbiter)) throw Error('Arc Trade asset or authority mismatch.')
  if (unsigned(await reader.readContract({address:ARC_AGREEMENT_NETWORK.usdc,abi:tokenAbi,functionName:'decimals',blockNumber})) !== 6n) throw Error('Arc USDC precision mismatch.')
}
export async function verifyArcTradeAuthority(reader: ArcTradeReader, release: ArcTradeRelease, blockNumber?: bigint) {
  assertArcTradeRelease(release)
  if (await reader.getChainId() !== 5042) throw Error('Arc Trade network mismatch.')
  const policy = release.authority
  if (!policy || policy.threshold !== 2 || !hash(policy.proxyRuntimeHash) || !hash(policy.singletonRuntimeHash)
    || !Array.isArray(policy.owners) || policy.owners.length < 2 || !policy.version) throw Error('Arc Trade two-signer policy is not configured.')
  const owners = policy.owners.map(address).sort()
  if (owners.includes(zeroAddress) || owners.includes(MODULE_SENTINEL) || new Set(owners).size !== owners.length) throw Error('Invalid Arc Trade reviewers.')
  const singleton = address(policy.singleton)
  if (singleton === zeroAddress || singleton === address(release.arbiter)) throw Error('Invalid Arc Trade Safe implementation.')
  await codeMatches(reader,release.arbiter,policy.proxyRuntimeHash,blockNumber)
  await codeMatches(reader,singleton,policy.singletonRuntimeHash,blockNumber)
  const read = (functionName:string,args?:readonly unknown[]) => reader.readContract({address:release.arbiter,abi:safeAbi,functionName,args,blockNumber})
  if (address(await read('masterCopy')) !== singleton || await read('VERSION') !== policy.version) throw Error('Arc Trade Safe implementation changed.')
  if (unsigned(await read('getThreshold')) !== 2n) throw Error('Arc Trade requires two reviewer signatures.')
  const actualOwners = await read('getOwners')
  if (!Array.isArray(actualOwners) || JSON.stringify(actualOwners.map(address).sort()) !== JSON.stringify(owners)) throw Error('Arc Trade reviewer owners changed.')
  // Safe modules can bypass the ordinary owner-signature threshold.
  const modules = await read('getModulesPaginated',[MODULE_SENTINEL,1n])
  if (!Array.isArray(modules) || !Array.isArray(modules[0]) || modules[0].length !== 0 || address(modules[1]) !== MODULE_SENTINEL) throw Error('Arc Trade Safe modules must be disabled.')
}
