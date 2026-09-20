import { createHash } from 'node:crypto'
﻿import { encodeFunctionData, parseAbi, parseUnits, isAddress, type Address } from 'viem'
import { circleMigrationRequest } from '../circle-solana-email.js'
import type { MigrationPlan } from './wallet-migration-plan.js'
type Row = MigrationPlan['rows'][number]
type Network = Row['network']
type Json = (network: Network, path: string, body?: Record<string, unknown>) => Promise<Record<string, any>>
const tokens = { base:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', arbitrum:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831', arc:'0x3600000000000000000000000000000000000000' } as const
const chains = { base:'BASE', arbitrum:'ARB', arc:'ARC' }
const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])
const batchAbi = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
// Follow provider collection cursors, never token IDs, preserving wallet scope.
export function migrationNextPage(data: Record<string, any>, path: string): string | null {
  const link=data.migrationPageLink
  if(link===null)return null
  if(typeof link!=='string')throw new Error('Migration pagination is unavailable.')
  const next=link.split(',').filter((part:string)=>/;\s*rel="next"/.test(part))
  if(next.length===0)return null
  if(next.length!==1)throw new Error('Migration pagination is inconsistent.')
  const match=next[0].match(/^\s*<([^>]+)>/)
  if(!match)throw new Error('Migration pagination is inconsistent.')
  const current=new URL(path,'https://api.circle.com'),url=new URL(match[1],current)
  if(url.origin!==current.origin || url.pathname!==current.pathname || url.username || url.password || url.hash || !url.searchParams.get('pageAfter') || url.searchParams.has('pageBefore'))throw new Error('Migration pagination is inconsistent.')
  for(const key of ['walletIds','includeAll','pageSize'])if(url.searchParams.get(key)!==current.searchParams.get(key))throw new Error('Migration pagination scope changed.')
  return url.pathname+url.search
}
export function migrationCallData(row: Row) {
  if (!Object.hasOwn(tokens,row.network) || !isAddress(row.target.address) || !isAddress(row.source.address) || !/^[1-9][0-9]*$/.test(row.units) || BigInt(row.units)>=2n**256n) throw new Error('Invalid migration transfer.')
  const data=encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[row.target.address as Address,BigInt(row.units)]})
  return encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[[{target:tokens[row.network],value:0n,data}]]})
}
function uuid(value: unknown): value is string { return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
export function migrationChallengeBody(row: Row, idempotencyKey: string) {
  if(!uuid(idempotencyKey)) throw new Error('Invalid migration idempotency key.')
  return {idempotencyKey,walletId:row.source.walletId,feeLevel:'HIGH',refId:'pocket-wallet-migration',contractAddress:row.source.address,callData:migrationCallData(row)}
}
export function migrationChallengeFingerprint(row: Row, idempotencyKey: string) {
  return createHash('sha256').update(JSON.stringify({network:row.network,body:migrationChallengeBody(row,idempotencyKey)})).digest('hex')
}
export function createMigrationProvider(userToken: string, request?: Json) {
  const json: Json=request??((network,path,body)=>circleMigrationRequest(userToken,network,path,body))
  async function own(row: Row) {
    for(const expected of [row.source,row.target]) {
      const response=await json(row.network,'/v1/w3s/wallets/'+encodeURIComponent(expected.walletId))
      const w=response.wallet
      if(!w || w.id!==expected.walletId || typeof w.address!=='string' || w.address.toLowerCase()!==expected.address.toLowerCase() || w.blockchain!==chains[row.network] || w.accountType!=='SCA' || w.state!=='LIVE') throw new Error('Circle migration wallet ownership failed.')
    }
  }
  return {
    own,
    async inventory(row: Row) {
      await own(row)
      let path='/v1/w3s/wallets/'+encodeURIComponent(row.source.walletId)+'/balances?'+new URLSearchParams({includeAll:'true',pageSize:'50'})
      const pages=new Set<string>()
      const balances:Array<{amount:string;token:Record<string,any>}> = []
      const seen=new Set<string>()
      while(true) {
        if(pages.has(path)||pages.size>=4)throw new Error('Migration asset inventory exceeds the review limit.')
        pages.add(path)
        const data=await json(row.network,path)
        if(!Array.isArray(data.tokenBalances)) throw new Error('Migration asset inventory is unavailable.')
        for(const item of data.tokenBalances) {
          if(!item || !item.token || typeof item.amount!=='string' || !/^\d+(?:\.\d+)?$/.test(item.amount) || item.token.blockchain!==chains[row.network] || !uuid(item.token.id) || seen.has(item.token.id)) throw new Error('Migration asset inventory is inconsistent.')
          seen.add(item.token.id);balances.push(item)
        }
        const next=migrationNextPage(data,path)
        if(!next)break
        path=next
      }
      const otherAssets=balances.filter(item=> /[1-9]/.test(item.amount) && String(item.token.tokenAddress??'').toLowerCase()!==tokens[row.network].toLowerCase())
      return {balances,otherAssets}
    },
    async noPending(row: Row) {
      let path='/v1/w3s/transactions?'+new URLSearchParams({walletIds:row.source.walletId,includeAll:'true',pageSize:'50'})
      const pages=new Set<string>(),seen=new Set<string>()
      while(true) {
        if(pages.has(path)||pages.size>=20)throw new Error('Migration transaction history exceeds the review limit.')
        pages.add(path)
        const data=await json(row.network,path)
        if(!Array.isArray(data.transactions))throw new Error('Migration transaction status is unavailable.')
        for(const tx of data.transactions) {
          if(!uuid(tx?.id)||tx.walletId!==row.source.walletId||tx.blockchain!==chains[row.network]||seen.has(tx.id))throw new Error('Migration transaction history is inconsistent.')
          seen.add(tx.id)
          if(!['COMPLETE','FAILED','DENIED','CANCELLED'].includes(tx.state))return false
        }
        const next=migrationNextPage(data,path)
        if(!next)break
        path=next
      }
      return true
    },
    async estimate(row: Row) {
      await own(row)
      const data=await json(row.network,'/v1/w3s/transactions/contractExecution/estimateFee',{walletId:row.source.walletId,contractAddress:row.source.address,callData:migrationCallData(row)})
      const amount=data.high?.networkFee
      if(typeof amount!=='string'||!/^\d+(?:\.\d{1,18})?$/.test(amount)) throw new Error('Migration network fee is unavailable.')
      parseUnits(amount,18)
      return {amount,asset:row.network==='arc'?'USDC' as const:'ETH' as const,feeLevel:'HIGH' as const}
    },
    async createChallenge(row: Row,idempotencyKey: string) {
      if(!uuid(idempotencyKey)) throw new Error('Invalid migration idempotency key.')
      await own(row)
      const data=await json(row.network,'/v1/w3s/user/transactions/contractExecution',migrationChallengeBody(row,idempotencyKey))
      if(!uuid(data.challengeId)) throw new Error('Migration challenge requires reconciliation.')
      return {challengeId:data.challengeId}
    },
    async inspectChallenge(row: Row,challengeId: string): Promise<'approval_required'|'pending'|'needs_review'> {
      if(!uuid(challengeId)) throw new Error('Invalid migration challenge.')
      await own(row)
      const data=await json(row.network,'/v1/w3s/user/challenges/'+encodeURIComponent(challengeId))
      const challenge=data.challenge
      if(!challenge || challenge.id!==challengeId) throw new Error('Migration challenge lookup did not match.')
      if(challenge.errorCode || challenge.errorMessage) return 'needs_review'
      if(challenge.status==='IN_PROGRESS') return 'pending'
      if(challenge.status!=='PENDING') return 'needs_review'
      const ids=challenge.correlationIds
      if(!Array.isArray(ids)||ids.length!==1||!uuid(ids[0])) return 'needs_review'
      const result=await json(row.network,'/v1/w3s/transactions/'+encodeURIComponent(ids[0]))
      const tx=result.transaction
      if(!tx || tx.id!==ids[0] || tx.walletId!==row.source.walletId || tx.blockchain!==chains[row.network] || String(tx.contractAddress??'').toLowerCase()!==row.source.address.toLowerCase()) return 'needs_review'
      if(tx.state==='INITIATED' && !tx.txHash) return 'approval_required'
      return ['CLEARED','QUEUED','SENT','STUCK','CONFIRMED','COMPLETE'].includes(tx.state)?'pending':'needs_review'
    },
    async resolveChallenge(row: Row,challengeId: string) {
      if(!uuid(challengeId)) throw new Error('Invalid migration challenge.')
      const data=await json(row.network,'/v1/w3s/user/challenges/'+encodeURIComponent(challengeId))
      const challenge=data.challenge
      if(!challenge || challenge.id!==challengeId) throw new Error('Migration challenge lookup did not match.')
      const ids=challenge.correlationIds
      if(!Array.isArray(ids)||ids.length!==1||!uuid(ids[0])) return null
      const result=await json(row.network,'/v1/w3s/transactions/'+encodeURIComponent(ids[0]))
      const tx=result.transaction
      if(!tx||tx.id!==ids[0]||tx.walletId!==row.source.walletId||tx.blockchain!==chains[row.network]||tx.state!=='COMPLETE'||String(tx.contractAddress??'').toLowerCase()!==row.source.address.toLowerCase()) return null
      if(typeof tx.txHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(tx.txHash)) return null
      return {walletId:tx.walletId as string,transactionHash:tx.txHash as string}
    },
  }
}
