import {readFileSync} from 'node:fs'

// Operator credential stays in this local process. Never send it to the browser.
export async function loadActivationCircleKey(fetcher=fetch){
 const token=readFileSync('C:/Users/USER/.render/cli.yaml','utf8').match(/^\s+key:\s*(\S+)/m)?.[1]
 if(!token)throw Error('Local Render authentication unavailable.')
 let cursor
 for(let page=0;page<10;page++){
  const response=await fetcher('https://api.render.com/v1/services/srv-d7ilg0osfn5c73eaedf0/env-vars?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw Error('Cannot read activation provider configuration.')
  const rows=await response.json()
  const key=rows.find(row=>row.envVar?.key==='CIRCLE_API_KEY')?.envVar?.value
  if(key){if(!key.startsWith('LIVE_API_KEY:'))throw Error('Live Circle configuration required.');return key}
  if(rows.length<100)break
  const next=rows.at(-1)?.cursor;if(!next||next===cursor)break;cursor=next
 }
 throw Error('Live Circle configuration unavailable.')
}

export async function readActivationCircleWallets(apiKey,userToken,fetcher=fetch){
 if(!apiKey?.startsWith('LIVE_API_KEY:')||typeof userToken!=='string'||!userToken||userToken.length>8000)throw Error('Authenticated live Circle session required.')
 const response=await fetcher('https://api.circle.com/v1/w3s/wallets?pageSize=50',{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+apiKey,'X-User-Token':userToken,Accept:'application/json'},signal:AbortSignal.timeout(20000)})
 if(!response.ok)throw Error('Authenticated Circle wallet lookup failed.')
 const data=await response.json()
 if(!Array.isArray(data.data?.wallets))throw Error('Circle wallet list unavailable.')
 // Use only this authenticated inventory. The caller still requires the exact
 // DB-linked ID, address, network, SCA type and LIVE state; no fallback wallet.
 return {ok:true,wallets:data.data.wallets}
}
