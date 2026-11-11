import {bankQuoteErrorResponse} from './bank-readiness.js'
import {Router,type Request,type Response} from 'express'
import {createMarketplaceApplication,marketplaceFields} from './application.js'
import {createMarketplacePrincipalResolver} from './authorization.js'
import {marketplaceReference} from './beneficiaries.js'

type Service=ReturnType<typeof createMarketplaceApplication>
const defaults={enabled:()=>process.env.MARKETPLACE_INSTRUCTIONS_ENABLED==='true',authorize:createMarketplacePrincipalResolver(),service:()=>createMarketplaceApplication()}
/** Only the reviewed Base USDC methods are exposed. No raw ledger/result/signing endpoint. */
export function createMarketplaceRouter(d=defaults){
 const router=Router()
 router.use(async(req,res,next)=>{
  res.setHeader('Cache-Control','no-store')
  if(!d.enabled())return res.status(503).json({ok:false,code:'MARKETPLACE_NOT_ACTIVE',error:'Marketplace Payments is not active.'})
  const token=/^Bearer (hpl_live_[A-Za-z0-9_-]{16,220})$/.exec(req.headers.authorization||'')?.[1]
  if(!token)return res.status(401).json({ok:false,error:'A live Marketplace API key is required.'})
  try{if(!await d.authorize(token))return res.status(403).json({ok:false,error:'Marketplace access denied.'});res.locals.marketplaceToken=token;next()}catch{return res.status(503).json({ok:false,error:'Marketplace authorization unavailable.'})}
 })
 const key=(req:Request)=>marketplaceReference(req.headers['idempotency-key'])
 const id=(req:Request,name:string)=>marketplaceReference(req.params[name])
 const body=(req:Request,paymentId:string)=>{if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.hasOwn(req.body,'paymentId')||Object.hasOwn(req.body,'projectId'))throw Error('Unexpected marketplace scope fields.');return {...req.body,paymentId}}
 function route(method:'get'|'post'|'delete',path:string,fn:(s:Service,t:string,req:Request)=>Promise<unknown>){
  router[method](path,async(req:Request,res:Response)=>{
   try{const value=await fn(d.service(),res.locals.marketplaceToken,req);if(value===null)return res.status(404).json({ok:false,error:'Marketplace record not found.'});return res.json({ok:true,data:value})}
   catch(error){const bankError=bankQuoteErrorResponse(error);if(bankError)return res.status(bankError.status).json(bankError.body);const message=error instanceof Error?error.message:''
    if(error instanceof Error&&'code' in error&&error.code==='MARKETPLACE_WITHDRAWAL_BELOW_MINIMUM'){
     const e=error as Error&{code:string;minimumUnits:string;asset:string;route:string}
     return res.status(400).json({ok:false,error:message,code:e.code,minimumNetUnits:e.minimumUnits,asset:e.asset,route:e.route,feesAdditional:true})
    }
    if(message==='Marketplace bank withdrawal provider is not enabled.')return res.status(503).json({ok:false,code:'MARKETPLACE_BANK_NOT_ENABLED',error:'Marketplace bank withdrawals are not enabled. Provider fee setup and payout verification must be completed; your balance is retained.'})
    if(message==='Marketplace authorization denied.')return res.status(403).json({ok:false,error:'Marketplace access denied.'})
    if(/Idempotency key|already exists/.test(message))return res.status(409).json({ok:false,error:'Reference or idempotency key conflicts with an existing request.'})
    if(/^(Invalid |Unexpected |Use |Provide |Duplicate |Amount |Insufficient |Allocation |Seller allocations|Settlement must|Payment has no verified|Wallet quote expired)/.test(message))return res.status(400).json({ok:false,error:'Invalid request, insufficient released funds, or expired quote. Check the documented fields and refresh status.'})
    return res.status(503).json({ok:false,error:'Marketplace operation unavailable. Check status before retrying with the same idempotency key.'})
   }
  })
 }
 route('post','/wallet-beneficiaries/challenges',(s,t,r)=>s.beginWallet(t,r.body))
 route('post','/wallet-beneficiaries/:beneficiaryId/verify',(s,t,r)=>s.verifyWallet(t,id(r,'beneficiaryId'),r.body))
 route('delete','/wallet-beneficiaries/:beneficiaryId',(s,t,r)=>s.revokeWallet(t,id(r,'beneficiaryId')))
 route('post','/seller-sessions',(s,t,r)=>s.createSellerSession(t,r.body))
 route('get','/sellers/:sellerId/verification',(s,t,r)=>s.sellerVerification(t,id(r,'sellerId')))
 route('post','/withdrawal-quotes',(s,t,r)=>s.createWithdrawalQuote(t,r.body))
 route('post','/withdrawals',(s,t,r)=>s.reserveWithdrawal(t,key(r),r.body))
 route('post','/payments',(s,t,r)=>s.createPayment(t,key(r),r.body))
 route('get','/payments/:paymentId',(s,t,r)=>s.payment(t,id(r,'paymentId')))
 route('post','/payments/:paymentId/checkout',(s,t,r)=>s.createCheckout(t,body(r,id(r,'paymentId'))))
 route('post','/payments/:paymentId/releases',(s,t,r)=>s.release(t,key(r),body(r,id(r,'paymentId'))))
 route('post','/payments/:paymentId/payout-quotes',(s,t,r)=>s.createWalletQuote(t,id(r,'paymentId'),r.body))
 route('post','/payments/:paymentId/payouts',(s,t,r)=>s.reserveQuotedWalletPayout(t,key(r),body(r,id(r,'paymentId'))))
 route('post','/payments/:paymentId/refunds',(s,t,r)=>s.reserveRefund(t,key(r),body(r,id(r,'paymentId'))))
 route('post','/payments/:paymentId/refund-fees',(s,t,r)=>s.fundRefundFees(t,key(r),body(r,id(r,'paymentId'))))
 route('post','/payments/:paymentId/payouts/:operationId/cancel',(s,t,r)=>s.cancelPayout(t,key(r),{...marketplaceFields(r.body,['businessReference']),paymentId:id(r,'paymentId'),operationId:id(r,'operationId')}))
 route('get','/payments/:paymentId/payouts/:operationId/receipt',(s,t,r)=>s.walletPayoutReceipt(t,id(r,'paymentId'),id(r,'operationId')))
 route('get','/payments/:paymentId/bank-payouts/:operationId/receipt',(s,t,r)=>s.bankPayoutReceipt(t,id(r,'paymentId'),id(r,'operationId')))
 route('get','/sellers/:sellerId/balance',(s,t,r)=>s.sellerBalances(t,id(r,'sellerId')))
 route('get','/refund-fees',(s,t)=>s.refundFeeBalance(t))
 router.use((_req,res)=>res.status(404).json({ok:false,error:'Marketplace endpoint not found.'}))
 return router
}
