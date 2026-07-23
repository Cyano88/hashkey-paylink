import assert from 'node:assert/strict'
import {
  detectNigerianMobileNetwork,
  mobileNetworkServiceId,
  normalizeNigerianMobileNumber,
} from '../src/pocket/lib/nigerianMobileNetwork.ts'

assert.equal(normalizeNigerianMobileNumber('+2348031234567'), '08031234567')
assert.equal(normalizeNigerianMobileNumber('234 802 123 4567'), '08021234567')
assert.equal(normalizeNigerianMobileNumber('8031234567'), '08031234567')

assert.equal(detectNigerianMobileNetwork('08031234567'), 'mtn')
assert.equal(detectNigerianMobileNetwork('08021234567'), 'airtel')
assert.equal(detectNigerianMobileNetwork('08051234567'), 'glo')
assert.equal(detectNigerianMobileNetwork('08091234567'), 'etisalat')
assert.equal(detectNigerianMobileNetwork('08011234567'), null)
assert.equal(detectNigerianMobileNetwork('0803123456'), null)

assert.equal(mobileNetworkServiceId('mtn', 'airtime'), 'mtn')
assert.equal(mobileNetworkServiceId('etisalat', 'data'), 'etisalat-data')

console.log('Pocket Nigerian mobile-network suggestions passed')
