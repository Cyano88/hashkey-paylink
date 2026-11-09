import {randomBytes} from 'node:crypto'
import {getAddress, recoverMessageAddress, type Hex} from 'viem'
import type {MarketplaceAsset} from '../../src/lib/marketplacePayments.js'

export type WalletBeneficiaryRequest = {projectId:string;sellerId:string;beneficiaryId:string;asset:MarketplaceAsset;address:string}
export type WalletChallenge = WalletBeneficiaryRequest & {network:'base';nonce:string;issuedAt:number;expiresAt:number}
export type WalletBeneficiary = WalletBeneficiaryRequest & {network:'base';kind:'wallet';verifiedAt:number;status:'active'|'revoked'}
export function marketplaceReference(value:unknown):string {
  if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/.test(value))throw Error('Invalid marketplace reference.')
  return value
}
export function walletChallenge(input:WalletBeneficiaryRequest,now:number):WalletChallenge {
  const projectId=marketplaceReference(input.projectId),sellerId=marketplaceReference(input.sellerId),beneficiaryId=marketplaceReference(input.beneficiaryId)
  if(input.asset!=='USDC'&&input.asset!=='USDT')throw Error('Unsupported marketplace wallet asset.')
  const address=getAddress(input.address)
  if(address==='0x0000000000000000000000000000000000000000')throw Error('Zero address is not a beneficiary.')
  return {projectId,sellerId,beneficiaryId,asset:input.asset,address,network:'base',nonce:randomBytes(32).toString('hex'),issuedAt:now,expiresAt:now+300_000}
}
export function walletChallengeMessage(challenge:WalletChallenge):string {
  return ['Hash PayLink Marketplace Payments wallet verification v1',
    'This signature proves wallet control. It does not authorize a transfer.',
    `Project: ${challenge.projectId}`,`Seller: ${challenge.sellerId}`,`Beneficiary version: ${challenge.beneficiaryId}`,
    'Network: Base (8453)',`Asset: ${challenge.asset}`,`Address: ${challenge.address}`,
    `Nonce: ${challenge.nonce}`,`Issued at: ${challenge.issuedAt}`,`Expires at: ${challenge.expiresAt}`].join('\n')
}
/** EOA signatures only. Contract wallets require a separately implemented chain-aware verifier. */
export async function verifyWalletChallenge(challenge:WalletChallenge,signature:string,now:number):Promise<void> {
  if(now<challenge.issuedAt||now>=challenge.expiresAt)throw Error('Wallet verification challenge expired.')
  if(typeof signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(signature))throw Error('Invalid wallet verification signature.')
  const signer=await recoverMessageAddress({message:walletChallengeMessage(challenge),signature:signature as Hex})
  if(signer.toLowerCase()!==challenge.address.toLowerCase())throw Error('Wallet control verification failed.')
}
