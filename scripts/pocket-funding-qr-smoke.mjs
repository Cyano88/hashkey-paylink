import assert from 'node:assert/strict'
import {pocketFundingCode,parsePocketFundingCode} from '../src/pocket/lib/pocketFundingCode.ts'
import {parsePocketScanCode,pocketScanDestination} from '../src/pocket/lib/pocketScanCode.ts'
const evm='0xE292801Ff95620ae2749B8C71A9EABB51E77e851',sol='11111111111111111111111111111111'
for(const network of ['base','arbitrum','ethereum','polygon','solana','arc','xlayer','bsc'])for(const asset of ['USDC','USDT']){
 if(network==='arc'&&asset==='USDT'){assert.throws(()=>pocketFundingCode(evm,network,asset));continue}
 const recipient=network==='solana'?sol:evm,raw=pocketFundingCode(recipient,network,asset),parsed=parsePocketFundingCode(raw)
 assert.equal(parsed.recipient,recipient);assert.equal(parsed.network,network);assert.equal(parsed.asset,asset);assert.equal(parsePocketScanCode(raw).kind,'funding');assert.equal(pocketScanDestination(raw),parsed.path)
}
const raw=pocketFundingCode(evm,'xlayer','USDT')
for(const invalid of [raw+'&asset=USDC',raw+'&amount=2',raw.replace('xlayer','unknown'),raw.replace('USDT','FAKE'),raw.replace(evm,'invalid'),raw.replace('https:','http:'),raw+'#fragment',raw.replace('pocket.hash','user@pocket.hash'),raw.replace('mode=address','mode=pocket')])assert.throws(()=>parsePocketFundingCode(invalid))
assert.equal(parsePocketFundingCode(evm),null);assert.equal(parsePocketFundingCode(raw.replace('pocket.hashpaylink.com','evil.example')),null)
assert.equal(parsePocketScanCode('https://app.hashpaylink.com/pay/c/chkx_48e1aebe24fb43d28de481b2?browser=1').kind,'checkout')
console.log('PASS funding QR address/network/asset roundtrip, all checkout stablecoin routes, malformed/conflicting rejection and checkout separation.')
