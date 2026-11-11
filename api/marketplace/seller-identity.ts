import {normalizeBankLegalName as normalizeSellerBankName} from '../pocket/verified-bank-name.js'
import {normalizeBusinessSummaryPreferences,type BusinessSummaryPreferences} from '../../src/lib/businessSummaryPreferences.js'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {marketplaceReference} from './beneficiaries.js'
import type {readPocketKycLevel} from '../pocket/kyc-level.js'
export type SellerIdentityStore={sessions:Array<{id:string;digest:string;projectId:string;sellerId:string;credentialId:string;projectName:string;returnUrl:string;expiresAt:number;owner?:string}>;links:Array<{projectId:string;sellerId:string;owner:string;consentedAt:number;revokedAt?:number;reporting?:BusinessSummaryPreferences}>}
type Dependencies={read:()=>Promise<SellerIdentityStore|undefined>;mutate:(fn:(s:SellerIdentityStore)=>SellerIdentityStore)=>Promise<SellerIdentityStore>;now:()=>number;authorize:(projectId:string,credentialId:string)=>Promise<boolean>;kyc:typeof readPocketKycLevel;project:(id:string)=>Promise<{name:string;allowedOrigins:string[]}>}
const digest=(token:string)=>createHash('sha256').update(token).digest('hex')
export {normalizeBankLegalName as normalizeSellerBankName} from '../pocket/verified-bank-name.js'
export function createMarketplaceSellerIdentity(d:Dependencies){
 async function session(token:string,owner:string){
  if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(token)||!owner)throw Error('Seller session is invalid or expired.')
  const record=(await d.read())?.sessions.find(s=>s.digest===digest(token))
  if(record&&record.expiresAt<=d.now())throw Error('Seller verification link has expired. Return to your marketplace for a new link.')
  if(!record||record.owner&&record.owner!==owner||!await d.authorize(record.projectId,record.credentialId))throw Error('Seller session is invalid or expired.')
  return record
 }
 async function identity(projectId:string,sellerId:string){
  const link=(await d.read())?.links.find(l=>l.projectId===projectId&&l.sellerId===sellerId&&!l.revokedAt)
  if(!link)throw Error('Connect the seller Hash PayLink account first.')
  return {link,kyc:await d.kyc(link.owner)}
 }
 return {
  async issue(projectId:string,sellerId:string,credentialId:string,returnUrl:string){
   for(const id of [projectId,sellerId,credentialId])marketplaceReference(id)
   if(!await d.authorize(projectId,credentialId))throw Error('Marketplace authorization denied.')
   const project=await d.project(projectId),url=new URL(returnUrl)
   if(url.protocol!=='https:'||url.username||url.password||url.hash||!project.allowedOrigins.includes(url.origin))throw Error('Use a saved HTTPS marketplace return origin.')
   const token=randomBytes(32).toString('base64url'),record={id:randomUUID(),digest:digest(token),projectId,sellerId,credentialId,projectName:project.name,returnUrl:url.href,expiresAt:d.now()+3600000}
   await d.mutate(s=>{s.sessions=s.sessions.filter(x=>x.expiresAt>d.now());if(s.sessions.length>=10000)throw Error('Seller session capacity reached.');s.sessions.push(record);return s})
   return {sessionId:record.id,verificationUrl:'https://developer.hashpaylink.com/marketplace/verify#token='+token,expiresAt:record.expiresAt}
  },
  async inspect(token:string,owner:string){const s=await session(token,owner),link=(await d.read())?.links.find(l=>l.projectId===s.projectId&&l.sellerId===s.sellerId&&!l.revokedAt);if(link&&link.owner!==owner)throw Error('This seller is linked to a different account.');const k=await d.kyc(owner);return {reporting:link?.reporting,projectName:s.projectName,sellerId:s.sellerId,connected:!!link&&s.owner===owner,level:k.level,bankEligible:!!link&&s.owner===owner&&k.country==='NG'&&(k.level==='basic'||k.level==='advanced')&&!!k.legalName&&!!k.reference,returnUrl:s.returnUrl,expiresAt:s.expiresAt}},
  async connect(token:string,owner:string,consent:boolean){
   if(consent!==true)throw Error('Consent is required to connect your seller account.')
   const record=await session(token,owner)
   await d.mutate(s=>{const current=s.sessions.find(x=>x.id===record.id);if(!current||current.expiresAt<=d.now()||current.owner&&current.owner!==owner)throw Error('Seller session is invalid or expired.');const prior=s.links.find(l=>l.projectId===record.projectId&&l.sellerId===record.sellerId);if(prior&&(prior.owner!==owner||prior.revokedAt))throw Error('Seller identity replacement requires review.');current.owner=owner;if(!prior)s.links.push({projectId:record.projectId,sellerId:record.sellerId,owner,consentedAt:d.now()});return s})
   return this.inspect(token,owner)
  },
  async scope(token:string,owner:string){const s=await session(token,owner),{link}=await identity(s.projectId,s.sellerId);if(link.owner!==owner||s.owner!==owner)throw Error('Connect this account before adding a bank.');return {projectId:s.projectId,sellerId:s.sellerId}},
  async reporting(token:string,owner:string,value:unknown){
   const scope=await this.scope(token,owner)
   await d.mutate(s=>{const links=s.links.filter(l=>l.projectId===scope.projectId&&l.sellerId===scope.sellerId&&!l.revokedAt);if(links.length!==1||links[0].owner!==owner)throw Error('Seller identity replacement requires review.');links[0].reporting=normalizeBusinessSummaryPreferences(value,links[0].reporting,new Date(d.now()).toISOString(),owner);return s})
   return this.inspect(token,owner)
  },
  async status(projectId:string,sellerId:string){const link=(await d.read())?.links.find(l=>l.projectId===projectId&&l.sellerId===sellerId&&!l.revokedAt);if(!link)return {sellerId,connected:false,bankEligible:false};const k=await d.kyc(link.owner);return {sellerId,connected:true,bankEligible:k.country==='NG'&&(k.level==='basic'||k.level==='advanced')&&!!k.legalName&&!!k.reference}},
  async verifyBank(input:{projectId:string;sellerId:string;bankCode:string;accountNumber:string;accountName:string}){
   const {link,kyc}=await identity(input.projectId,input.sellerId)
   if(kyc.country!=='NG'||(kyc.level!=='basic'&&kyc.level!=='advanced')||!kyc.legalName||!kyc.reference)throw Error('Complete Nigerian Basic verification before adding a bank account.')
   const legal=normalizeSellerBankName(kyc.legalName),resolved=normalizeSellerBankName(input.accountName)
   if(legal.split(' ').length<2||legal!==resolved)throw Error('Bank account name does not match your verified identity. Use your own account or contact support for review.')
   const evidenceId='seller-bank:'+digest(JSON.stringify([input.projectId,input.sellerId,link.owner,kyc.reference,legal,input.bankCode,input.accountNumber]))
   return {verified:true as const,projectId:input.projectId,sellerId:input.sellerId,bankCode:input.bankCode,accountNumber:input.accountNumber,evidenceId}
  },
 }
}
