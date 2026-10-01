import { type Address, type Hex, getAddress, isAddress, keccak256, encodeAbiParameters } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const zero = '0x0000000000000000000000000000000000000000'
export function createGiftCapability() {
  const key = generatePrivateKey()
  const secret = btoa(String.fromCharCode(...key.slice(2).match(/.{2}/g)!.map(n => parseInt(n, 16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { secret, signer: privateKeyToAccount(key).address }
}
function capabilityAccount(secret: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw Error('Invalid gift code.')
  const bytes = atob(secret.replace(/-/g, '+').replace(/_/g, '/') + '=')
  // Reject noncanonical encodings so one credential has exactly one code.
  if (btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== secret) throw Error('Invalid gift code.')
  const key = ('0x' + Array.from(bytes, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')) as Hex
  try { return privateKeyToAccount(key) } catch { throw Error('Invalid gift code.') }
}
export function giftCapabilitySigner(secret:string){return capabilityAccount(secret).address}
export function giftContractId(sender: Address, salt: Hex) {
  return keccak256(encodeAbiParameters([{type:'address'}, {type:'bytes32'}], [sender, salt]))
}
export function giftClaimTypedData(input: {chainId: number; escrow: Address; giftId: Hex; recipient: Address; deadline: bigint}) {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0 || !/^0x[0-9a-fA-F]{64}$/.test(input.giftId) || input.deadline <= 0n || input.deadline > (1n << 64n) - 1n) throw Error('Invalid gift claim.')
  if (![input.escrow, input.recipient].every(address => isAddress(address) && address.toLowerCase() !== zero) || input.escrow.toLowerCase() === input.recipient.toLowerCase()) throw Error('Invalid gift destination.')
  return {
    domain: {name:'PocketGift',version:'1',chainId:input.chainId,verifyingContract:getAddress(input.escrow)},
    types: {Claim:[{name:'giftId',type:'bytes32'},{name:'recipient',type:'address'},{name:'deadline',type:'uint64'}]},
    primaryType:'Claim',message:{giftId:input.giftId,recipient:getAddress(input.recipient),deadline:input.deadline},
  } as const
}
// Browser-side only. Send the resulting recipient-bound signature to a relayer,
// never the gift capability. No logging, fetch, analytics or persistence here.
export async function signGiftClaim(secret: string, input: Parameters<typeof giftClaimTypedData>[0]) {
  return capabilityAccount(secret).signTypedData(giftClaimTypedData(input))
}
