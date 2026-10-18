import assert from 'node:assert/strict'
import {curatedArcPaymentTokens} from '../src/pocket/lib/pocketArcPaymentAssets.ts'
import {readArcSwapToken,quoteArcSwap,sealArcSwapQuote,openArcSwapQuote} from '../api/pocket/arc-swap-provider.ts'
const usdc={address:'0x3600000000000000000000000000000000000000',symbol:'USDC',decimals:6};const eurc={address:'0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',symbol:'EURC',decimals:6};const meme={...usdc,address:'0x'+'1'.repeat(40)};
assert.deepEqual(curatedArcPaymentTokens([meme,eurc,usdc,usdc]),[usdc,eurc]);assert.deepEqual(curatedArcPaymentTokens([{...usdc,decimals:18},{...eurc,symbol:'FAKE'}]),[]);
let calls=0;const fetcher=()=>{calls++;throw Error('Must reject before lookup')};await assert.rejects(()=>readArcSwapToken(meme.address,fetcher),/Unsupported/);await assert.rejects(()=>quoteArcSwap({tokenIn:meme.address,tokenOut:eurc.address},fetcher),/Unsupported/);assert.equal(calls,0);
const secret='fixture-secret-long-enough-for-sealing';const historical={ownerId:'owner',chainId:5042,tokenIn:meme,tokenOut:eurc,expiresAt:Date.now()+60000};const sealed=sealArcSwapQuote(historical,secret);assert.throws(()=>openArcSwapQuote(sealed,'owner',false,secret),/Unsupported/);assert.deepEqual(openArcSwapQuote(sealed,'owner',true,secret),historical);console.log('PASS canonical identity, ordering, no arbitrary quotes, historical recovery')
