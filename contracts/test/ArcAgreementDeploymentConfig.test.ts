import { expect } from 'chai'
import { mainnetDeploymentAddress, requireMainnetDeploymentChain } from '../lib/arcAgreementDeploymentConfig'

describe('Arc mainnet deployment configuration', () => {
  const address = '0x1111111111111111111111111111111111111111'
  it('requires dedicated mainnet addresses without legacy fallback', () => {
    for (const key of ['ARC_AGREEMENT_FACTORY_ADDRESS_MAINNET', 'ARC_AGREEMENT_OPERATOR_ADDRESS_MAINNET'] as const) {
      expect(mainnetDeploymentAddress({ [key]: address }, key)).to.equal(address)
      expect(() => mainnetDeploymentAddress({ [key.replace('_MAINNET', '')]: address }, key)).to.throw(key)
      for (const invalid of ['', 'not-an-address', '0x' + '0'.repeat(40)]) {
        expect(() => mainnetDeploymentAddress({ [key]: invalid }, key)).to.throw(key)
      }
    }
  })
  it('rejects testnet and other chains before deployment verification', () => {
    expect(() => requireMainnetDeploymentChain(5042n)).not.to.throw()
    for (const chain of [5042002n, 1n, 8453n]) expect(() => requireMainnetDeploymentChain(chain)).to.throw('5042')
  })
})
