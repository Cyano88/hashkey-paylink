import assert from 'node:assert/strict'
import { verifyAgreementPrivyWallet } from '../api/xstocks-agreement/wallet.ts'

const address = '0x' + '11'.repeat(20)
const account = { type: 'wallet', chainType: 'ethereum', walletClientType: 'privy', connectorType: 'embedded', address }
const user = { id: 'did:privy:verified', linkedAccounts: [account] }
const load = async () => user
assert.equal((await verifyAgreementPrivyWallet(user.id, address, {}, load)).chainId, 196)
await assert.rejects(() => verifyAgreementPrivyWallet('did:privy:other', address, {}, load), /account mismatch/)
await assert.rejects(() => verifyAgreementPrivyWallet(user.id, '0x' + '22'.repeat(20), {}, load), /verified embedded/)
for (const accounts of [[], [account, account], [{ ...account, connectorType: 'injected' }], [{ ...account, chainType: 'solana' }]]) {
  await assert.rejects(() => verifyAgreementPrivyWallet(user.id, address, {}, async () => ({ ...user, linkedAccounts: accounts })), /verified embedded/)
}
await assert.rejects(() => verifyAgreementPrivyWallet(user.id, address, {}), /unavailable/)
console.log('Agreement Privy identity, exact embedded wallet, ambiguous wallet and missing configuration checks passed.')
