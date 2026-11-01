import {providerUsageFetch} from './provider-usage.js'
import {createHmac} from 'node:crypto'
import type {Address} from 'viem'
import {okxCredentials} from './xstocks-swap-provider.js'

export type NativeCandidate = {hash: Address; block: bigint; blockHash: string}
export type NativeDiscoveryState = {wallets?: string; verified: Record<string, {block: string; blockHash: string}>}
export type NativeDiscoveryClient = {
  getTransaction: (args: {hash: Address}) => Promise<any>
  getTransactionReceipt: (args: {hash: Address}) => Promise<any>
  getBlock: (args: {blockNumber: bigint}) => Promise<any>
}
export type NativeTransfer = {id: string; hash: string; from: string; to: string; token: string; symbol: string; units: string; decimals: number; at: number}
const hashPattern = /^0x[0-9a-f]{64}$/i
const addressPattern = /^0x[0-9a-f]{40}$/i
export const NATIVE_REPLAY_BLOCKS = 9999n

/** Index rows discover candidates only. An exhausted, validated page sequence
 * is required; provider errors and budget limits never mean empty history. */
export async function readXLayerNativeCandidates(addresses: string[], from: bigint, to: bigint, fetcher = fetch): Promise<NativeCandidate[]> {
  if(from < 0n || to < from || to-from > 9999n) throw Error('Invalid X Layer discovery range')
  const wallets = [...new Set(addresses.map(a=>a.toLowerCase()))]
  if(!wallets.length || wallets.length>200 || wallets.some(a=>!addressPattern.test(a))) throw Error('Invalid X Layer discovery wallets')
  const c = okxCredentials()
  if(!c.key || !c.secret || !c.passphrase) throw Error('X Layer index unavailable')
  const found = new Map<string,NativeCandidate>()
  let requests = 0
  for(let offset=0;offset<wallets.length;offset+=20){
    const batch=wallets.slice(offset,offset+20)
    let total = 1
    const batchHashes=new Set<string>()
    for(let page=1;page<=total;page++){
      if(++requests>10) throw Error('X Layer index page budget exceeded')
      const path='/api/v5/xlayer/address/normal-transaction-list-multi?'+new URLSearchParams({chainShortName:'xlayer',address:batch.join(','),startBlockHeight:String(from),endBlockHeight:String(to),limit:'100',page:String(page)})
      const timestamp=new Date().toISOString()
      const response=await providerUsageFetch({feature:'xlayer-discovery',network:'xlayer',operation:'history-page'},fetcher)('https://web3.okx.com'+path,{headers:{'OK-ACCESS-KEY':c.key,'OK-ACCESS-PASSPHRASE':c.passphrase,'OK-ACCESS-TIMESTAMP':timestamp,'OK-ACCESS-SIGN':createHmac('sha256',c.secret).update(timestamp+'GET'+path).digest('base64')},signal:AbortSignal.timeout(10000),redirect:'error'})
      const body=await response.json(),data=body.data?.[0]
      if(!response.ok || String(body.code)!=='0' || !data || !Array.isArray(data.transactionList) || data.transactionList.length>100 || Number(data.page)!==page || (!/^\d+$/.test(String(data.totalPage)) && !(data.totalPage==='' && page===1 && data.transactionList.length===0))) throw Error('Invalid X Layer index page')
      const pages=Number(data.totalPage)
      if(!Number.isSafeInteger(pages) || pages>10 || pages<0 || (pages===0 && data.transactionList.length) || (page>1 && pages!==total) || (pages>1 && !data.transactionList.length)) throw Error('Incomplete X Layer index pages')
      total=pages
      for(const row of data.transactionList){
        if(!hashPattern.test(row.txId) || !hashPattern.test(row.blockHash) || !/^\d+$/.test(String(row.height)) || (!batch.includes(String(row.from).toLowerCase()) && !batch.includes(String(row.to).toLowerCase()))) throw Error('Invalid X Layer index candidate')
        const block=BigInt(row.height),hash=row.txId.toLowerCase() as Address,blockHash=row.blockHash.toLowerCase()
        if(block<from || block>to) throw Error('X Layer index range mismatch')
        if(batchHashes.has(hash)) throw Error('Repeated X Layer index page')
        batchHashes.add(hash)
        const prior=found.get(hash)
        if(prior && (prior.block!==block || prior.blockHash!==blockHash)) throw Error('X Layer index candidate changed')
        found.set(hash,{hash,block,blockHash})
      }
    }
  }
  return [...found.values()]
}

/** Replay up to 10,000 blocks for delayed indexing. Persist only canonically
 * verified candidates; failed proofs must be retried. Recheck the recent reorg
 * window even when a hash was previously verified. No index amount is trusted. */
export async function verifyXLayerNativeCandidates(candidates: NativeCandidate[], addresses: string[], from: bigint, to: bigint, state: NativeDiscoveryState | undefined, client: NativeDiscoveryClient, now=Date.now()) {
  const wallets=new Set(addresses.map(a=>a.toLowerCase()))
  const walletScope=[...wallets].sort().join(',')
  const verified: NativeDiscoveryState['verified']={}
  for(const [hash,value] of Object.entries(state?.wallets===walletScope?state.verified:{})) if(BigInt(value.block)>=from && BigInt(value.block)<=to) verified[hash]=value
  const transfers:NativeTransfer[]=[],blocks=new Map<bigint,any>()
  let proofs=0
  for(const candidate of candidates){
    if(candidate.block<from || candidate.block>to) throw Error('X Layer candidate outside range')
    const saved=verified[candidate.hash]
    if(saved && saved.block===String(candidate.block) && saved.blockHash===candidate.blockHash && candidate.block+24n<to) continue
    if(++proofs>100) throw Error('X Layer native proof budget exceeded')
    const [tx,receipt]=await Promise.all([client.getTransaction({hash:candidate.hash}),client.getTransactionReceipt({hash:candidate.hash})])
    if(!tx || !receipt || tx.hash?.toLowerCase()!==candidate.hash || receipt.transactionHash?.toLowerCase()!==candidate.hash || tx.blockNumber!==candidate.block || receipt.blockNumber!==candidate.block || tx.blockHash?.toLowerCase()!==candidate.blockHash || receipt.blockHash?.toLowerCase()!==candidate.blockHash || (tx.chainId!==undefined && tx.chainId!==196 && tx.chainId!==196n)) throw Error('X Layer native proof mismatch')
    let block=blocks.get(candidate.block)
    if(!block){block=await client.getBlock({blockNumber:candidate.block});blocks.set(candidate.block,block)}
    const at=Number(block.timestamp)*1000
    if(block.number!==candidate.block || block.hash?.toLowerCase()!==candidate.blockHash || !Number.isSafeInteger(at) || at<=0 || at>now+5000) throw Error('X Layer native block mismatch')
    if(receipt.status!=='success' && receipt.status!=='reverted') throw Error('X Layer native receipt pending')
    if(receipt.status==='success' && tx.to && BigInt(tx.value)>0n && (wallets.has(tx.from.toLowerCase()) || wallets.has(tx.to.toLowerCase()))){
      transfers.push({id:candidate.hash+':native',hash:candidate.hash,from:tx.from,to:tx.to,token:'native',symbol:'OKB',units:String(tx.value),decimals:18,at})
    }
    verified[candidate.hash]={block:String(candidate.block),blockHash:candidate.blockHash}
  }
  if(Object.keys(verified).length>20000) throw Error('X Layer native verification cache full')
  return {transfers,state:{verified,wallets:walletScope},proofs}
}
