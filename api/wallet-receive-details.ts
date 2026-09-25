import { getAddress, isAddress, zeroAddress } from 'viem'
// Transport-neutral receiving data. Builders choose layout; these fields never attest Pocket ID routing.
export function walletReceiveDetails(network: 'arc' | 'xlayer', address: string) {
  if (!isAddress(address) || getAddress(address) === zeroAddress) throw Error('A valid receiving wallet is required.')
  const wallet = getAddress(address)
  return { network, chainId: network === 'arc' ? 5042 : 196, networkName: network === 'arc' ? 'Arc' : 'X Layer', address: wallet,
    qrValue: wallet, qrFormat: 'evm-address' as const, assetKind: network === 'arc' ? 'usdc' : 'xstocks',
    gasSymbol: network === 'arc' ? 'USDC' : 'OKB',
    depositNotice: network === 'arc' ? 'Deposit only USDC on Arc.' : 'Deposit only supported stocks on X Layer.',
    gasNotice: network === 'arc' ? 'Keep a small amount of USDC for network fees.' : 'Keep a small amount of OKB for network fees.',
    pocketIdRouting: 'not_provided' as const }
}
