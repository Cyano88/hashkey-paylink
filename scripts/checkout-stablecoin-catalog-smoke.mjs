import assert from 'node:assert/strict'
import {CHECKOUT_NETWORK_ORDER, CHECKOUT_STABLECOINS,checkoutStablecoin,checkoutStablecoins} from '../src/lib/checkoutStablecoins.ts'
import {paymentToken} from '../api/pocket/payment-asset.ts'
const expected={base:['USDC','USDT','EURC'],arc:['USDC','EURC'],xlayer:['USDC','USDT','USDe','USDG'],arbitrum:['USDC','USDT'],solana:['USDC','USDT'],bsc:['USDC','USDT'],ethereum:['USDC','USDT'],polygon:['USDC','USDT']}
assert.equal(CHECKOUT_STABLECOINS.length,19)
for(const network of CHECKOUT_NETWORK_ORDER){
 assert.deepEqual(checkoutStablecoins(network).map(a=>a.symbol),expected[network])
 for(const asset of checkoutStablecoins(network)){
  assert.equal(checkoutStablecoin(network,asset.address),asset)
  assert.equal(asset.currency,asset.symbol==='EURC'?'EUR':'USD')
  assert.equal(asset.decimals,network==='bsc'||asset.symbol==='USDe'?18:6)
 }
 for(const symbol of ['ETH','SOL','BNB','OKB','POL','NVDAx'])assert.equal(checkoutStablecoin(network,symbol),undefined)
}
for(const a of checkoutStablecoins('xlayer')){
 assert.equal(paymentToken(a,'xlayer','xlayer').symbol,a.symbol)
 for(const bad of [{...a,decimals:a.decimals===6?18:6},{...a,symbol:'USDC-fake'},{...a,chainId:56}])assert.throws(()=>paymentToken(bad,'xlayer','xlayer'))
}
assert.equal(checkoutStablecoin('arc','USDT'),undefined)
assert.equal(checkoutStablecoin('solana',checkoutStablecoin('solana','USDC').address.toLowerCase()),undefined)
console.log('PASS 19 exact stablecoin identities across 8 networks; native/stocks rejected, euro denomination and 18-decimal assets preserved.')
