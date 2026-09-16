import process from 'node:process'
import { provisionArcAgreementOperator } from './lib/arc-agreement-operator-provision.mjs'

provisionArcAgreementOperator({
  env: process.env,
  confirmed: process.argv.includes('--confirm-create-arc-mainnet-operator'),
})
  .then(wallet => {
    console.log(JSON.stringify({
      created: true,
      ...wallet,
      next: 'Save walletId as ARC_AGREEMENT_OPERATOR_WALLET_ID_MAINNET and address as ARC_AGREEMENT_OPERATOR_ADDRESS_MAINNET, then run the read-only preflight.',
    }, null, 2))
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'Arc operator provisioning failed.')
    process.exitCode = 1
  })
