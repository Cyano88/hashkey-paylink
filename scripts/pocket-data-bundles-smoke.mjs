import assert from 'node:assert/strict'
import { parsePocketDataBundle, parsePocketDataBundles } from '../src/pocket/lib/pocketDataBundles.ts'

const variation = (name, amountNgn = '500', available = true) => ({
  variationCode: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  amountNgn,
  available,
})

assert.deepEqual(
  parsePocketDataBundle(variation('Airtel Data Bundle - 50 Naira - 25MB - 1Day', '50'), 'airtel-data'),
  {
    ...variation('Airtel Data Bundle - 50 Naira - 25MB - 1Day', '50'),
    dataAmount: '25 MB', validity: '1 Day', price: 50, category: 'daily',
  },
)

assert.equal(parsePocketDataBundle(variation('N100 100MB - 24 hrs', '100'), 'mtn-data').validity, '1 Day')
assert.equal(parsePocketDataBundle(variation('9mobile 11GB (7GB+ 4GB Night) - 2,500 Naira - 30 days', '2500'), 'etisalat-data').category, 'monthly')
assert.equal(parsePocketDataBundle(variation('MTN N50,000 165GB SME Mobile Data (2-Months)', '50000'), 'mtn-data').category, 'mega')
assert.equal(parsePocketDataBundle(variation('Smile 10GB 30 Days Bumpa', '5000'), 'smile-direct').category, 'broadband')
assert.equal(parsePocketDataBundle(variation('Spectranet N5000', '5000'), 'spectranet').dataAmount, 'Data')
assert.equal(parsePocketDataBundle(variation('UnlimitedPlatinum for 30days - 24,000 Naira', '24000'), 'smile-direct').dataAmount, 'Unlimited')
assert.equal(parsePocketDataBundle(variation('MTN N450,000 4.5TB Mobile Data (1 Year)', '450000'), 'mtn-data').dataAmount, '4.5 TB')

const parsed = parsePocketDataBundles([
  variation('100MB - 1 day', '100'),
  variation('2GB - 7 days', '1000'),
  variation('5GB - 30 days', '2000'),
  variation('100GB - 90 days', '20000'),
], 'mtn-data')
assert.deepEqual(parsed.map(item => item.category), ['daily', 'weekly', 'monthly', 'mega'])

console.log('Pocket Data bundle parsing and categorization smoke tests passed.')
