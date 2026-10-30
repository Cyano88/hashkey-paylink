import {CHECKOUT_ACCEPTANCE} from './checkoutAcceptance.js'
export const SANDBOX_ASSETS: Record<string, readonly string[]> = {...CHECKOUT_ACCEPTANCE, bsc:['USDC','USDT'], xlayer:['USDC','USDT','USDe','USDG']}
export const SANDBOX_ENDPOINT = '/api/developer-projects?resource=sandbox'
export type SandboxPayment = {id:string; title:string; amount:string; network:string; asset:string; status:'pending'|'processing'|'paid'|'failed'|'expired'; createdAt:string; updatedAt:string; environment:'test'; simulated:true; reference:string}
export type SandboxSnapshot = {payments:SandboxPayment[]; keys:Array<{id:string;prefix:string;createdAt:string;revokedAt?:string}>}
