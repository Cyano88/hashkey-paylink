import {STOCK_GIFT_DEPLOYMENTS} from '../../../src/pocket/lib/pocketGiftDeployments.js'
export const stockGiftDeployments=():GiftDeployment[]=>STOCK_GIFT_DEPLOYMENTS.map(p=>({protocol:2,network:'xlayer',chainId:196,escrow:p.escrow,token:p.asset.token,treasury:p.treasury,claimAuthority:p.authority,runtimeHash:p.runtimeHash,deploymentBlock:p.deploymentBlock,confirmations:p.confirmations,asset:p.asset}))
import {isAddress,type Hex} from 'viem'
import {privateKeyToAccount} from 'viem/accounts'
import {multiGiftAccountId} from './multi-authorization.js'
import {multiGiftClaimTypedData} from '../../../src/pocket/features/gifts/pocketMultiGift.js'
import {GiftError,type GiftDeployment,type GiftNetwork} from './types.js'
// Pin reviewed chain deployments here. Environment variables alone never enable funding.
export const MULTI_GIFT_DEPLOYMENTS:Readonly<Partial<Record<GiftNetwork,GiftDeployment>>>=Object.freeze({base:{"protocol":2,"network":"base","chainId":8453,"escrow":"0xa4df7dc962a278d1215b8b05255ea1bfd32a4c57","token":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","treasury":"0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753","claimAuthority":"0xdD4670dF8C8D9C0D64b0291b36990990743C3801","runtimeHash":"0x803bb469f00694a4a32eb20a64f24dde78f143891f59b66b56446e31f4ef13c3","deploymentBlock":"52122221","confirmations":2}})
export function validateMultiGiftDeployment(d:GiftDeployment){
 if(d.protocol!==2||!(d.network==='base'&&d.chainId===8453&&d.token.toLowerCase()==='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'||d.network==='xlayer'&&d.chainId===196&&d.asset?.rail==='xstocks'&&d.asset.chainId===196&&d.asset.token.toLowerCase()===d.token.toLowerCase()&&Number.isInteger(d.asset.decimals)&&d.asset.decimals>=0&&d.asset.decimals<=36)||![d.escrow,d.treasury,d.claimAuthority].every(a=>!!a&&isAddress(a)&&!/^0x0{40}$/i.test(a))||d.escrow.toLowerCase()===d.treasury.toLowerCase()||!/^0x[0-9a-fA-F]{64}$/.test(d.runtimeHash)||!/^\d+$/.test(d.deploymentBlock||'')||!Number.isSafeInteger(d.confirmations)||d.confirmations<2)throw new GiftError(503,'Multi-recipient gift deployment is not reviewed.')
 return d
}
let cachedAuthority:ReturnType<typeof privateKeyToAccount>|undefined,cachedAuthorityKey:string|undefined
function authority(){const key=process.env.POCKET_MULTI_GIFT_AUTHORITY_KEY;if(!key||!/^0x[0-9a-fA-F]{64}$/.test(key))throw new GiftError(503,'Gift authorization unavailable.');if(cachedAuthorityKey!==key){cachedAuthority=privateKeyToAccount(key as Hex);cachedAuthorityKey=key}return cachedAuthority!}
export function multiGiftDeployment(network:GiftNetwork,token?:string){const d=network==='xlayer'?stockGiftDeployments().find(d=>d.token.toLowerCase()===token?.toLowerCase()):MULTI_GIFT_DEPLOYMENTS[network];if(!d)return;validateMultiGiftDeployment(d);try{if(authority().address.toLowerCase()!==d.claimAuthority!.toLowerCase()||!/^[a-f0-9]{64}$/i.test(process.env.POCKET_MULTI_GIFT_IDENTITY_KEY||''))return;return d}catch{return}}
export const multiGiftIdentity=(id:Hex,user:string)=>multiGiftAccountId(process.env.POCKET_MULTI_GIFT_IDENTITY_KEY||'',id,user)
export async function signMultiGiftAccount(data:ReturnType<typeof multiGiftClaimTypedData>){const d=[...Object.values(MULTI_GIFT_DEPLOYMENTS),...stockGiftDeployments()].find(d=>d.chainId===data.domain.chainId&&d.escrow.toLowerCase()===data.domain.verifyingContract.toLowerCase());if(!d||!multiGiftDeployment(d.network,d.token))throw new GiftError(503,'Gift authorization unavailable.');return authority().signTypedData(data)}
