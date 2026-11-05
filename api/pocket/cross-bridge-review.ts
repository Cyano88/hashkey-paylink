import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {validateCrossBridgeRelayQuote,type CrossBridgeInput} from './cross-bridge-provider.js'
import {buildCrossBridgeChargedPlan} from './cross-bridge-reimbursement.js'
import {crossBridgeWalletFingerprint,type CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
import type {RelayBridgeAppFee} from './relay-bridge-app-fee.js'
import {assertCrossBridgeRollout} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'

/** Persist only JSON primitives and the original provider response. Reconstruct
 * bigint calls and Solana instructions through the same validators on every read. */
export type CrossBridgeReview={version:1;id:string;ownerId:string;wallets:CrossBridgeWalletBinding;input:CrossBridgeInput;providerQuote:unknown;appFee:RelayBridgeAppFee|null;reimbursementUnits:string;reimbursementRecipient:string;totalUnits:string;planHash:string;issuedAt:number;expiresAt:number}
const fail=():never=>{throw Object.assign(Error('Bridge review changed or expired. Review it again.'),{status:409,code:'bridge_review_invalid'})}
const mac=(body:string,secret:string)=>{if(secret.length<32)throw Error('Bridge review signing is unavailable.');return createHmac('sha256',secret).update('pocket:cross-bridge-review:v1:'+body).digest()}
const same=(network:string,a:string,b:string)=>network==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
function units(v:unknown){if(typeof v!=='string'||! /^(0|[1-9]\d{0,38})$/.test(v)||BigInt(v)>=2n**128n)fail();return BigInt(v as string)}
export function sealCrossBridgeReview(q:CrossBridgeReview,secret=process.env.POCKET_SWAP_QUOTE_SECRET||''){
 const json=JSON.stringify(q);if(json.length>120000)fail()
 const body=Buffer.from(json).toString('base64url');return body+'.'+mac(body,secret).toString('base64url')
}
export async function openCrossBridgeReview(token:string,owner:string,options:{recovery?:boolean;now?:number;secret?:string}={}){
 const now=options.now??Date.now();if(typeof token!=='string'||token.length>180000)fail()
 const [body,signature,extra]=token.split('.');if(!body||!signature||extra)fail()
 const expected=mac(body,options.secret??process.env.POCKET_SWAP_QUOTE_SECRET??''),actual=Buffer.from(signature,'base64url')
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail()
 let q:CrossBridgeReview;try{q=JSON.parse(Buffer.from(body,'base64url').toString())}catch{return fail()}
 if(!q||q.version!==1||q.ownerId!==owner||q.wallets?.ownerId!==owner||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.id)||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt<=q.issuedAt||q.expiresAt-q.issuedAt>45000||!options.recovery&&q.expiresAt<=now)fail()
 if(q.wallets.fingerprint!==crossBridgeWalletFingerprint(q.wallets)||q.wallets.source.network!==q.input?.source||q.wallets.destination.network!==q.input.destination||!same(q.input.source,q.input.sender,q.wallets.source.address)||!same(q.input.destination,q.input.recipient,q.wallets.destination.address))fail()
 if(!options.recovery)assertCrossBridgeRollout(q.input.source,q.input.destination)
 const route=validateCrossBridgeRelayQuote(q.providerQuote,q.input,q.issuedAt,q.appFee)
 const charged=await buildCrossBridgeChargedPlan(route,q.wallets,units(q.reimbursementUnits),q.reimbursementRecipient)
 if(charged.planHash!==q.planHash||charged.totalUnits!==units(q.totalUnits)||q.expiresAt>route.expiresAt)fail()
 return {quote:q,route,charged}
}
/** Authenticated service supplies a validated provider response, live wallet
 * binding and priced charges. This function neither estimates nor dispatches. */
export async function createCrossBridgeReview(input:{wallets:CrossBridgeWalletBinding;input:CrossBridgeInput;providerQuote:unknown;appFee:RelayBridgeAppFee|null;reimbursementUnits:bigint;reimbursementRecipient:string;planHash:string;totalUnits:bigint;expiresAt:number},options:{now?:number;secret?:string}={}){
 const issuedAt=options.now??Date.now()
 const q:CrossBridgeReview=JSON.parse(JSON.stringify({version:1,id:randomUUID(),ownerId:input.wallets.ownerId,wallets:input.wallets,input:input.input,providerQuote:input.providerQuote,appFee:input.appFee,reimbursementUnits:String(input.reimbursementUnits),reimbursementRecipient:input.reimbursementRecipient,planHash:input.planHash,totalUnits:String(input.totalUnits),issuedAt,expiresAt:Math.min(input.expiresAt,issuedAt+45000)}))
 const token=sealCrossBridgeReview(q,options.secret)
 await openCrossBridgeReview(token,q.ownerId,options)
 return {quote:q,quoteToken:token}
}
