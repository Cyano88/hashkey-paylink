// Read-only quotes: no signing or broadcast. Persist public provider fixtures for regression tests.
import {mkdirSync,writeFileSync} from 'node:fs'
import {bscRelayRequest,validateBscRelayQuote} from '../api/pocket/bsc-bridge-provider.ts'
import {relayStablecoinRequest,validateRelayStablecoinQuote} from '../api/pocket/xlayer-bridge-provider.ts'
const senderEvm='0xd7579fa0784288ef6eab335bc97d3c8ebc7ec435',senderSolana='5tAUpyEjHsKN2CLXduUVTDHmTC4zWAbgGSWiL7XVippA'
mkdirSync('scripts/fixtures/inbound-bridge',{recursive:true})
const results=[]
for(const source of ['base','arbitrum','ethereum','polygon','arc','solana'])for(const destination of ['bsc','xlayer'])for(const asset of ['USDC','USDT']){
 if(asset==='USDT'&&source==='arc')continue
 const input={source,destination,asset,sender:source==='solana'?senderSolana:senderEvm,recipient:senderEvm,amountUnits:'10000000'}
 try{
  const response=await fetch('https://api.relay.link/quote/v2',{method:'POST',headers:{'content-type':'application/json',...(process.env.RELAY_API_KEY?{'x-api-key':process.env.RELAY_API_KEY}:{})},body:JSON.stringify(destination==='bsc'?bscRelayRequest(input):relayStablecoinRequest(input)),signal:AbortSignal.timeout(20000)})
  const quote=await response.json(),now=Date.now()
  if(!response.ok){results.push({source,destination,asset,http:response.status,ok:false});continue}
  const valid=destination==='bsc'?validateBscRelayQuote(quote,input,now):validateRelayStablecoinQuote(quote,input,now,{allowXLayerUsdcRefund:true})
  writeFileSync(`scripts/fixtures/inbound-bridge/${asset}-${source}-${destination}.json`,JSON.stringify({input,now,response:quote},null,2))
  results.push({source,destination,asset,ok:true,execution:valid.execution.kind})
 }catch(e){results.push({source,destination,asset,ok:false,error:e.message})}
 console.log(JSON.stringify(results.at(-1)))
}
writeFileSync('.codex-temp/inbound-route-preflight.json',JSON.stringify(results,null,2))
if(results.some(r=>!r.ok))process.exitCode=1
