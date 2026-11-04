import {createHmac} from 'node:crypto'
import {createPublicClient,formatUnits,http,parseAbi,type Hex} from 'viem'
import {readCircleTokenDisplay} from './circle-token-display.js'
import {circleLinkKey,type CircleLinkRecord} from '../privy-circle-link.js'
import {okxCredentials} from './xstocks-swap-provider.js'
import {POCKET_EURC,type PocketEurcNetwork,type PocketEurcBalance} from '../../src/pocket/lib/pocketEurc.js'

const networks=['base','arc'] as const
const abi=parseAbi(['function balanceOf(address owner) view returns(uint256)','function decimals() view returns(uint8)'])
export async function readEurcBalanceUnits(network:PocketEurcNetwork,address:Hex){
 const url=network==='base'?process.env.PRIVATE_RPC_URL:process.env.PRIVATE_RPC_URL_ARC_MAINNET
 if(!url)throw Error('EURC connection unavailable.')
 const client=createPublicClient({transport:http(url,{timeout:8000,retryCount:0})}),token=POCKET_EURC[network]
 const [chain,decimals,units]=await Promise.all([client.getChainId(),client.readContract({address:token.address,abi,functionName:'decimals'}),client.readContract({address:token.address,abi,functionName:'balanceOf',args:[address]})])
 if(chain!==(network==='base'?8453:5042)||decimals!==6)throw Error('EURC asset configuration mismatch.')
 return units
}
export async function readEurcBalance(network:PocketEurcNetwork,address:Hex){return Number(formatUnits(await readEurcBalanceUnits(network,address),6))}
export async function readEurcUsdPrice(fetcher=fetch,now=Date.now){
 const c=okxCredentials(),path='/api/v6/dex/market/price',timestamp=new Date(now()).toISOString()
 if(!c.key||!c.secret||!c.passphrase)throw Error('EURC price unavailable.')
 const body=JSON.stringify([{chainIndex:'8453',tokenContractAddress:POCKET_EURC.base.address}])
 const r=await fetcher('https://web3.okx.com'+path,{method:'POST',headers:{'Content-Type':'application/json','OK-ACCESS-KEY':c.key,'OK-ACCESS-SIGN':createHmac('sha256',c.secret).update(timestamp+'POST'+path+body).digest('base64'),'OK-ACCESS-PASSPHRASE':c.passphrase,'OK-ACCESS-TIMESTAMP':timestamp},body,signal:AbortSignal.timeout(8000),redirect:'error'})
 const b=await r.json(),rows=b.data?.filter((p:any)=>String(p.chainIndex)==='8453'&&String(p.tokenContractAddress).toLowerCase()===POCKET_EURC.base.address.toLowerCase())
 if(!r.ok||String(b.code)!=='0'||rows?.length!==1)throw Error('EURC price unavailable.')
 const usd=Number(rows[0].price),time=Number(rows[0].time)
 if(!Number.isFinite(usd)||usd<=0||!Number.isFinite(time)||now()-time>60000||time>now()+5000)throw Error('EURC price unavailable.')
 return usd
}
export async function readPocketEurcBalances(userId:string,readLink:(key:string)=>Promise<CircleLinkRecord|null>,read?:typeof readEurcBalance,price=readEurcUsdPrice,fresh=false):Promise<PocketEurcBalance[]>{
 const market=price().catch(()=>null)
 return Promise.all(networks.map(async network=>{
  let address:string|null=null
  const base={network,symbol:'EURC' as const,observedAt:Date.now()}
  try{
   const link=await readLink(circleLinkKey(userId,network,'payment'))
   if(!link)return {...base,address,quantity:0,valueUsd:0,status:'ok' as const}
   if(link.privyUserId!==userId||link.chain!==network||(link.purpose??'payment')!=='payment'||link.circleBlockchain!==(network==='base'?'BASE':'ARC'))throw Error('EURC wallet binding mismatch.')
   address=link.circleWalletAddress
   const quantity=read?await read(network,address as Hex):Number(formatUnits(await readCircleTokenDisplay(link,POCKET_EURC[network],()=>readEurcBalanceUnits(network,address as Hex),fresh),6)),usd=await market
   if(!Number.isFinite(quantity)||quantity<0)throw Error('EURC balance unavailable.')
   return {...base,address,quantity,valueUsd:quantity===0?0:usd===null?null:quantity*usd,status:'ok' as const}
  }catch{return {...base,address,quantity:null,valueUsd:null,status:'error' as const}}
 }))
}
