import { createHash } from 'node:crypto'
﻿import { encodeFunctionData, parseAbi, parseUnits, isAddress, type Address } from 'viem'
import { circleMigrationRequest } from '../circle-solana-email.js'
import type { MigrationPlan } from './wallet-migration-plan.js'
type Row = MigrationPlan['rows'][number]
type Network = Row['network']
type Json = (network: Network, path: string, body?: Record<string, unknown>) => Promise<Record<string, any>>
const tokens = { base:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', arbitrum:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831', arc:'0x3600000000000000000000000000000000000000', ethereum:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', polygon:'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' } as const
const chains = { base:'BASE', arbitrum:'ARB', arc:'ARC', ethereum:'ETH', polygon:'MATIC' }
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
    async noPending(row: Row, noActivitySince?: number, verifiedMigrationHash?: string) {
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
          if(noActivitySince!==undefined && (!Number.isFinite(noActivitySince) || typeof tx.createDate!=='string' || !Number.isFinite(Date.parse(tx.createDate)) || Date.parse(tx.createDate)>=noActivitySince))return false
          // Activation may ignore only this exact, independently receipt-verified
          // migration while Circle's indexing trails the chain. Other activity blocks.
          const verified=verifiedMigrationHash && /^0x[0-9a-f]{64}$/i.test(verifiedMigrationHash) && typeof tx.txHash==='string' && tx.txHash.toLowerCase()===verifiedMigrationHash.toLowerCase() && String(tx.contractAddress??'').toLowerCase()===row.source.address.toLowerCase() && ['SENT','CONFIRMED','COMPLETE'].includes(tx.state)
          if(!verified && !['COMPLETE','FAILED','DENIED','CANCELLED'].includes(tx.state))return false
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
      return {amount,asset:row.network==='arc'?'USDC' as const:row.network==='polygon'?'POL' as const:'ETH' as const,feeLevel:'HIGH' as const}
    },
    async createChallenge(row: Row,idempotencyKey: string) {
      if(!uuid(idempotencyKey)) throw new Error('Invalid migration idempotency key.')
      await own(row)
      const data=await json(row.network,'/v1/w3s/user/transactions/contractExecution',migrationChallengeBody(row,idempotencyKey))
      if(!uuid(data.challengeId)) throw new Error('Migration challenge requires reconciliation.')
      return {challengeId:data.challengeId}
    },
    async inspectChallenge(row: Row,challengeId: string): Promise<'approval_required'|'pending'|'needs_review'|'expired'> {
      if(!uuid(challengeId)) throw new Error('Invalid migration challenge.')
      await own(row)
      const data=await json(row.network,'/v1/w3s/user/challenges/'+encodeURIComponent(challengeId))
      const challenge=data.challenge
      if(!challenge || challenge.id!==challengeId) throw new Error('Migration challenge lookup did not match.')
      // Circle's Challenge schema makes errorCode/errorMessage optional and
      // documents them only for FAILED. EXPIRED itself is terminal evidence.
      if(challenge.status==='EXPIRED' && (challenge.errorCode===undefined || String(challenge.errorCode)==='155121'))return 'expired'
      if(challenge.errorCode || challenge.errorMessage) {
        if(String(challenge.errorCode)==='155121') {
          // Circle SDK ChallengeStatusEnum includes terminal FAILED and EXPIRED;
          // older API examples also report PENDING with the same expiry code.
          if(['PENDING','FAILED','EXPIRED'].includes(challenge.status))return 'expired'
          throw new Error('Circle reports an expired approval with '+(['IN_PROGRESS','COMPLETE'].includes(challenge.status)?challenge.status.toLowerCase().replace('_',' '):'an unknown')+' status. Check progress before reviewing another transfer.')
        }
        const code=String(challenge.errorCode??'')
        throw new Error('Circle could not continue the saved approval'+(/^\d{1,9}$/.test(code)?' (code '+code+')':'')+'. No replacement transfer has been created.')
      }
      if(challenge.status==='IN_PROGRESS') return 'pending'
      if(!['PENDING','COMPLETE'].includes(challenge.status)) {
        const status=challenge.status==='FAILED'?'FAILED':'UNKNOWN'
        throw new Error('The saved Circle approval has '+status+' status. Its transaction must be reconciled before another transfer can be reviewed.')
      }
      const ids=challenge.correlationIds
      if(!Array.isArray(ids)||ids.length!==1||!uuid(ids[0])) throw new Error('Circle has not provided one valid transaction reference for this saved approval. No replacement transfer has been created.')
      const result=await json(row.network,'/v1/w3s/transactions/'+encodeURIComponent(ids[0]))
      const tx=result.transaction
      if(!tx || tx.id!==ids[0] || tx.walletId!==row.source.walletId || tx.blockchain!==chains[row.network] || String(tx.contractAddress??'').toLowerCase()!==row.source.address.toLowerCase()) throw new Error('The saved Circle transaction does not match the reviewed wallet transfer. Approval is paused for review.')
      if(tx.state==='INITIATED' && !tx.txHash) return challenge.status==='PENDING'?'approval_required':'pending'
      if(['CLEARED','QUEUED','SENT','STUCK','CONFIRMED','COMPLETE'].includes(tx.state))return 'pending'
      const state=['FAILED','DENIED','CANCELLED'].includes(tx.state)?tx.state.toLowerCase():'unverified'
      throw new Error('The saved Circle transaction is '+state+'. No replacement transfer has been created.')
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
      if(!tx||tx.id!==ids[0]||tx.walletId!==row.source.walletId||tx.blockchain!==chains[row.network]||!['SENT','CONFIRMED','COMPLETE'].includes(tx.state)||String(tx.contractAddress??'').toLowerCase()!==row.source.address.toLowerCase()) return null
      if(typeof tx.txHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(tx.txHash)) return null
      return {walletId:tx.walletId as string,transactionHash:tx.txHash as string}
    },
  }
}
