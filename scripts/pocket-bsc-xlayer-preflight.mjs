// Read-only provider quotes. No signatures, approvals, or transfers.
import {mkdirSync,writeFileSync} from 'node:fs'
import {bscRelayRequest,validateBscRelayQuote} from '../api/pocket/bsc-bridge-provider.ts'
import {relayStablecoinRequest,validateRelayStablecoinQuote} from '../api/pocket/xlayer-bridge-provider.ts'
const evm='0xd7579fa0784288ef6eab335bc97d3c8ebc7ec435',solana='5tAUpyEjHsKN2CLXduUVTDHmTC4zWAbgGSWiL7XVippA'
mkdirSync('scripts/fixtures/reverse-bridge',{recursive:true})
const results=[]
for(const source of ['bsc'])for(const destination of ['xlayer'])for(const asset of ['USDC','USDT']){
 if(asset==='USDT'&&destination==='arc')continue
 // Existing LI.FI paths retain their separate provider/settlement regression suite.
 if(source==='xlayer'&&asset==='USDT'&&['arbitrum','ethereum','polygon'].includes(destination))continue
 const input={source,destination,asset,sender:evm,recipient:destination==='solana'?solana:evm,amountUnits:source==='bsc'?'10000000000000000000':'10000000',...(source==='xlayer'&&asset==='USDT'?{inputAsset:'USDC'}:{})}
 try{
  const response=await fetch('https://api.relay.link/quote/v2',{method:'POST',headers:{'content-type':'application/json',...(process.env.RELAY_API_KEY?{'x-api-key':process.env.RELAY_API_KEY}:{})},body:JSON.stringify(source==='bsc'?bscRelayRequest(input):relayStablecoinRequest(input)),signal:AbortSignal.timeout(20000)})
  const quote=await response.json(),now=Date.now()
  if(!response.ok)throw Error('HTTP '+response.status+' '+JSON.stringify(quote).slice(0,200))
  writeFileSync('.codex-temp/bsc-xlayer-'+asset+'-raw.json',JSON.stringify({input,now,response:quote},null,2))
  const valid=source==='bsc'?validateBscRelayQuote(quote,input,now,{allowXLayerUsdcRefund:true}):validateRelayStablecoinQuote(quote,input,now)
  writeFileSync(`scripts/fixtures/reverse-bridge/${asset}-${source}-${destination}.json`,JSON.stringify({input,now,response:quote},null,2))
  results.push({source,destination,asset,ok:true,execution:valid.execution.kind})
 }catch(e){results.push({source,destination,asset,ok:false,error:e.message})}
 console.log(JSON.stringify(results.at(-1)))
}
writeFileSync('.codex-temp/reverse-route-preflight.json',JSON.stringify(results,null,2))
if(results.some(r=>!r.ok))process.exitCode=1
